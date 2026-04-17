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
  return {
    source: 'status',
    extension: normExt(extension || row?.extension),
    display_name: null,
    status: String(row?.status || row?.state || row?.availability || '').trim() || null,
    counterpart: String(row?.currentCall?.phone || row?.current_call?.phone || row?.with || '').trim() || null,
    started_at: row?.currentCall?.startedAt || row?.current_call?.started_at || null,
    raw: row,
  };
}
