import { contextFromProvider, extractTransferEvents } from './transferEvents';

export const TRANSFER_PAGE_SIZE = 10;

export function nextTransferCursor(job: any, rowCount: number, now = new Date().toISOString()) {
  if (rowCount === TRANSFER_PAGE_SIZE) return { page_offset: job.page_offset + TRANSFER_PAGE_SIZE };
  if (job.phase === 'calls') return { phase: 'journal', page_offset: 0 };
  // Revisit an hour to collect delayed provider updates, with stable event keys.
  return { phase: 'calls', page_offset: 0, window_start: new Date(Date.parse(job.window_end) - 60 * 60_000).toISOString(), window_end: now, last_success_at: now };
}

/** The worker saves its cursor only after this succeeds. Retrying a partial page is idempotent. */
export async function importTransferPage(rows: any[], clientId: string, ingest: (event: any) => Promise<any>) {
  let imported = 0, queued = 0;
  for (const raw of rows) {
    for (const event of extractTransferEvents(raw, contextFromProvider(raw, clientId))) {
      const result = await ingest(event);
      if (result) imported++; else queued++;
    }
  }
  return { imported, queued };
}
