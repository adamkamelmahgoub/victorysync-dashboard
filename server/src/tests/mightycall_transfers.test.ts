import test from 'node:test';
import assert from 'node:assert/strict';
import { contextFromProvider, extractTransferEvents } from '../mightycall/transferEvents';
import { importTransferPage, nextTransferCursor, TRANSFER_PAGE_SIZE } from '../mightycall/transferImport';

const context = { clientId: 'client-a', callId: 'call-1', extension: '101', businessNumber: '+12125550000', phone: '+12125550100' };
const time = '2026-09-30T10:00:00.000Z';
const transfer = { id: 'transfer-1', target: '+12125550200', timestamp: time, status: 'Connected' };

test('ordinary calls, multiple recipients and transfer counters are not transfer evidence', () => {
  for (const raw of [{ transferred: 0 }, { transferCount: 2 }, { called: [{ extension: '101' }, { extension: '102' }] }]) {
    assert.deepEqual(extractTransferEvents(raw, context), []);
  }
});
test('each explicit transfer leg is imported once, independently of outcome updates', () => {
  const raw = { transferTarget: transfer.target, transfers: [transfer, transfer, { ...transfer, id: 'transfer-2' }] };
  const events = extractTransferEvents(raw, context);
  assert.equal(events.length, 2);
  assert.equal(events[0].occurred_at, time);
  assert.equal(events[0].outcome, 'connected');
  assert.equal(events[0].source_key, extractTransferEvents({ transfers: [{ ...transfer, status: 'NoAnswer' }] }, context)[0].source_key);
  assert.notEqual(events[0].source_key, extractTransferEvents(raw, { ...context, clientId: 'client-b' })[0].source_key);
});
test('a call start or call completion cannot become the transfer timestamp or outcome', () => {
  const [event] = extractTransferEvents({ transferId: 't1', transferTarget: '102', timestamp: time, dateTimeUtc: time, createdAt: time, status: 'Connected' }, context);
  assert.equal(event.occurred_at, null);
  assert.equal(event.outcome, null);
});
test('missing event identity is deterministic for review and is never guessed', () => {
  const raw = { transferTarget: '102' };
  const event = extractTransferEvents(raw, context)[0];
  assert.equal(event.identity_confirmed, false);
  assert.deepEqual(event, extractTransferEvents(raw, context)[0]);
});
test('API and webhook explicit transfer IDs use the same key', () => {
  const api = extractTransferEvents({ transfers: [transfer] }, context)[0];
  const webhook = extractTransferEvents({ transferId: transfer.id, transferTarget: transfer.target, transferredAt: time }, context)[0];
  assert.equal(api.source_key, webhook.source_key);
});
test('journal participants preserve evidence but do not invent timing or sending agent', () => {
  const journal = { id: 'journal-1', requestGuid: '00000000-0000-0000-0000-000000000000', created: time, respondedAt: time,
    agent: { extension: '102' }, businessNumber: { number: context.businessNumber }, client: { address: context.phone },
    users: [{ id: 'receiver-1', extension: '102', agentRole: 'TransferReceiver' }] };
  const ctx = contextFromProvider(journal, context.clientId);
  assert.equal(ctx.callId, 'journal-1');
  const [event] = extractTransferEvents(journal, ctx);
  assert.equal(event.extension, '');
  assert.equal(event.occurred_at, null);
  assert.equal(event.outcome, null);
  assert.equal(event.business_number, context.businessNumber);
  assert.equal(event.phone, context.phone);
});
test('journal routes the sending owner rather than the transfer receiver', () => {
  const raw = { id: 'j1', users: [{ extension: '101', agentRole: 'CallOwner' }, { extension: '102', agentRole: 'TransferReceiver' }] };
  assert.equal(extractTransferEvents(raw, { ...context, extension: '102' })[0].extension, '101');
});
test('outbound context chooses the external lead phone and caller extension', () => {
  const ctx = contextFromProvider({ id: 'call-1', direction: 'Outgoing', caller: { extension: '101' },
    called: [{ extension: '102', phone: '102' }, { phone: context.phone }], businessNumber: context.businessNumber }, context.clientId);
  assert.deepEqual(ctx, context);
});
test('an inbound connected recipient cannot be assumed to be the sending agent', () => {
  const raw = { id: 'call-1', direction: 'Incoming', called: [{ extension: '102', isConnected: true }], agent: { extension: '102' } };
  assert.equal(contextFromProvider(raw, context.clientId).extension, '');
});
test('pagination drains calls and journal before moving the time window', () => {
  const job = { phase: 'calls', page_offset: 20, window_end: time };
  assert.deepEqual(nextTransferCursor(job, TRANSFER_PAGE_SIZE), { page_offset: 30 });
  assert.deepEqual(nextTransferCursor(job, 0), { phase: 'journal', page_offset: 0 });
  const result = nextTransferCursor({ ...job, phase: 'journal' }, 1, '2026-09-30T11:00:00.000Z');
  assert.equal(result.window_start, '2026-09-30T09:00:00.000Z');
  assert.equal(result.window_end, '2026-09-30T11:00:00.000Z');
});
test('partial page failures reject without success so the page can safely replay', async () => {
  const raw = { id: 'call-1', transfers: [transfer, { ...transfer, id: 'transfer-2' }] };
  const stored = new Map();
  let fail = true;
  const ingest = async (event: any) => {
    if (fail && event.source_key.endsWith('transfer-2')) throw new Error('database unavailable');
    stored.set(event.source_key, event); return event.source_key;
  };
  await assert.rejects(importTransferPage([raw], context.clientId, ingest));
  assert.equal(stored.size, 1);
  fail = false;
  assert.deepEqual(await importTransferPage([raw], context.clientId, ingest), { imported: 2, queued: 0 });
  assert.equal(stored.size, 2);
  assert.deepEqual(await importTransferPage([raw], context.clientId, async () => null), { imported: 0, queued: 2 });
});
