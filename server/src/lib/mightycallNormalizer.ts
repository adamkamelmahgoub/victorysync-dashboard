export type NormalizedMightyCallActivity = {
  source: 'calls' | 'journal' | 'status' | 'profile';
  extension: string | null;
  display_name: string | null;
  status: string | null;
  counterpart: string | null;
  started_at: string | null;
  raw: any;
};

function normExt(value: any) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits && digits.length <= 8 ? digits : null;
}

function firstText(...values: any[]): string | null {
  for (const value of values) {
    if (value == null) continue;
    if (typeof value === 'object') {
      const nested = firstText(
        value.status,
        value.state,
        value.presenceStatus,
        value.presence_status,
        value.availability,
        value.value,
        value.label,
        value.name
      );
      if (nested) return nested;
      continue;
    }
    const text = String(value).trim();
    if (text && text !== '[object Object]' && text !== '[object Array]') return text;
  }
  return null;
}

export function normalizeMightyCallJournalActivity(row: any): NormalizedMightyCallActivity {
  const agent = row?.agent || row?.users?.[0] || null;
  return {
    source: 'journal',
    extension: normExt(agent?.extension),
    display_name: String(agent?.name || '').trim() || null,
    status: String(row?.state || row?.availability || row?.wfstate?.state || '').trim() || null,
    counterpart: String(row?.client?.address || row?.businessNumber?.number || '').trim() || null,
    started_at: row?.created || null,
    raw: row,
  };
}

export function normalizeMightyCallStatusActivity(row: any, extension?: string | null): NormalizedMightyCallActivity {
  const currentCall = row?.currentCall || row?.current_call || row?.status?.currentCall || row?.status?.current_call || null;
  return {
    source: 'status',
    extension: normExt(extension || row?.extension),
    display_name: null,
    status: firstText(row?.status, row?.state, row?.availability, row?.presenceStatus, row?.presence) || null,
    counterpart: firstText(currentCall?.phone, currentCall?.from, currentCall?.to, row?.with) || null,
    started_at: currentCall?.startedAt || currentCall?.started_at || currentCall?.dateTimeUtc || null,
    raw: row,
  };
}
