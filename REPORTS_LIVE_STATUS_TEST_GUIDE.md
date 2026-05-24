# Reports And Live Status Verification

## Apply Database Changes

Apply `supabase/migrations/022_reporting_live_transfer_normalization.sql` before testing webhooks or transfer reports. It adds `call_events`, `call_transfers`, and the `on_hold` / `transferring` live-status states.

## Live Status

1. Open `/live-status`.
2. Start an inbound call to an assigned MightyCall number.
3. Confirm the matching extension changes to `Ringing` immediately.
4. Answer the call and confirm it changes to `On Call`.
5. Place the call on hold and confirm it changes to `On Hold` when MightyCall sends a hold event/status.
6. Transfer the call and confirm it changes to `Transferring`.
7. End the call and confirm the agent returns to `Available`.

Useful fallback check for admins:

```bash
POST /api/admin/live-status/simulate
{
  "orgId": "<org-id>",
  "extension": "101",
  "event": "ringing",
  "direction": "inbound",
  "from_number": "+15551234567",
  "to_number": "+15557654321"
}
```

Repeat with `answered`, `on_hold`, `transferring`, and `completed`.

## Reports

1. Open `/reports` or `/admin/reports`.
2. Pick a date range and, if available, one or more numbers.
3. Verify the Overview cards change when the number filter changes.
4. Check each tab: Calls, Recordings, SMS, Transfers, Numbers, Agents.
5. Use Export CSV on table tabs.

Expected behavior:

- Calls aggregate from `calls`.
- Recordings aggregate from `mightycall_recordings`.
- SMS aggregates from `mightycall_sms_messages`.
- Transfers aggregate from `call_transfers`.
- Non-platform users only see records matching their organization and assigned numbers unless they have org-wide manager/admin access.

## Recordings

1. Complete a recorded MightyCall call.
2. Sync or wait for the webhook/API ingestion.
3. Open `/recordings`.
4. Confirm the row has from/to numbers, direction, duration, timestamp, and playback/download actions.
5. If MightyCall did not provide a URL, the Reports recording table should show `Recording unavailable`.

## SMS Direction

1. Send an outbound SMS from an assigned MightyCall number.
2. Receive an inbound SMS to the same number.
3. Open `/sms`.
4. Confirm outbound messages show `outbound`, inbound messages show `inbound`.
5. Filter by inbound and outbound and confirm the rows change correctly.

## Transfers

1. Transfer a live call in MightyCall.
2. Confirm the webhook payload includes a transfer event or transfer target.
3. Open Reports -> Transfers.
4. Confirm original caller, original receiving number, initiating extension, target, type, result, and timestamp appear when MightyCall provides those fields.
