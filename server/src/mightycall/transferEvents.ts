import { createHash } from 'crypto';

type Json = Record<string, any>;
export type TransferContext = { clientId: string; callId: string; extension?: string; businessNumber?: string; phone?: string };
const text = (...values: any[]): string => {
  const found = values.find(v => (typeof v === 'string' || typeof v === 'number') && String(v).trim());
  return found === undefined ? '' : String(found).trim();
};
const phone = (v: any) => text(v?.number, v?.phone, v?.address, v);
const callId = (raw: Json) => text(/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(raw.requestGuid || '') ? '' : raw.requestGuid, raw.id, raw.callId);
const iso = (...values: any[]) => {
  for (const value of values) if (typeof value === 'string' && /[TZ]|\d{4}-\d{2}-\d{2}/.test(value) && Number.isFinite(Date.parse(value))) return new Date(value).toISOString();
  return null;
};

/** Only explicit transfer evidence counts. Multiple called parties and transfer counters do not. */
export function extractTransferEvents(raw: Json, context: TransferContext): Json[] {
  const candidates: { item: Json; eventTimestamp: boolean; journal?: boolean }[] = [];
  const visit = (node: any, explicit = false) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return;
    const kind = text(node.eventType, node.type, node.event, node.evt).toLowerCase();
    const hasChildren = node.transfer && typeof node.transfer === 'object' || Array.isArray(node.transfers) && node.transfers.length;
    if (!hasChildren && (explicit || node.transferId || node.transfer_id || node.transferTarget || node.transferredTo || node.transferDestination || node.transferStatus || kind === 'transfer')) candidates.push({ item: node, eventTimestamp: explicit || kind === 'transfer' });
    if (node.transfer && typeof node.transfer === 'object') visit(node.transfer, true);
    if (Array.isArray(node.transfers)) node.transfers.forEach((v: any) => visit(v, true));
    for (const field of ['legs', 'callLegs', 'events', 'history']) if (Array.isArray(node[field])) node[field].forEach((v: any) => visit(v));
  };
  visit(raw);
  // Journal TransferReceiver is evidence of a transfer, but never evidence of its exact timestamp.
  const users = Array.isArray(raw.users) ? raw.users : [];
  const owners = users.filter((u: Json) => /^(callowner|owner)$/i.test(text(u.agentRole, u.role)));
  for (const receiver of users.filter((u: Json) => /^transferreceiver$/i.test(text(u.agentRole, u.role)))) {
    candidates.push({ journal: true, eventTimestamp: false, item: { transferId: callId(raw) && text(receiver.id, receiver.extension) ? `journal:${callId(raw)}:${text(receiver.id, receiver.extension)}` : '',
      transferTarget: phone(receiver.phone) || text(receiver.extension), transferType: 'journal',
      sourceExtension: owners.length === 1 ? owners[0].extension : '',
      transferredAt: receiver.transferredAt, transferStatus: receiver.transferStatus } });
  }
  const events = new Map<string, Json>();
  for (const { item, eventTimestamp, journal } of candidates) {
    const target = text(item.transferTarget, item.transferredTo, item.transferDestination, phone(item.target), phone(item.to), item.extension);
    const extension = text(item.sourceExtension, item.fromExtension, item.agent_extension, item.agent?.extension, journal ? '' : context.extension);
    const occurred = iso(item.transferredAt, item.transferred_at, item.transferDateTimeUtc, eventTimestamp ? item.timestamp : null, eventTimestamp ? item.createdAt : null);
    const providerId = text(item.transferId, item.transfer_id, item === raw ? raw.transferId : item.id);
    const stable = !!context.callId && (!!providerId || (!!target && !!extension && !!occurred));
    const identity = providerId || createHash('sha256').update(JSON.stringify([context.callId, extension, target, occurred])).digest('hex');
    const sourceKey = `${context.clientId}:${context.callId}:${identity}`;
    const outcome = text(item.transferStatus, item.transfer_status, item === raw ? '' : item.status, item === raw ? '' : item.result).toLowerCase();
    events.set(sourceKey, { source_key: sourceKey, identity_confirmed: stable, client_id: context.clientId,
      external_call_id: context.callId, extension, business_number: phone(raw.businessNumber) || phone(raw.business_number) || context.businessNumber || '',
      phone: context.phone || phone(raw.client), occurred_at: occurred,
      outcome: outcome === 'noanswer' ? 'no_answer' : outcome || null,
      transfer_target: target, transfer_type: text(item.transferType, item.type),
    });
  }
  return [...events.values()];
}

export function contextFromProvider(raw: Json, clientId: string): TransferContext {
  const outgoing = /^(outgoing|outbound|outcamp)$/i.test(text(raw.direction, raw.origin));
  const called = Array.isArray(raw.called) ? raw.called : [];
  const external = called.filter((p: Json) => phone(p.phone) && !p.extension);
  return { clientId, callId: callId(raw), businessNumber: phone(raw.businessNumber),
    // A connected recipient may be the transfer receiver, not the sending agent.
    extension: text(raw.sourceExtension, /^callowner$/i.test(raw.agent?.agentRole || '') ? raw.agent?.extension : '', outgoing ? raw.caller?.extension : ''),
    phone: phone(raw.client) || (outgoing ? external.length === 1 ? phone(external[0].phone) : '' : phone(raw.caller?.phone)),
  };
}
