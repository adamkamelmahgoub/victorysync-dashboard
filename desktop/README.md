# Victory Sync Windows tracker

The desktop app uses the existing Supabase login. Clerk integration is intentionally deferred. This package does not alter the separate Clerk starter.

Install dependencies with `npm ci --prefix desktop`. Run `npm run build --prefix desktop` for an unpacked Windows application or `npm run package --prefix desktop` for an NSIS installer. Builds are unsigned until an organization signing certificate is supplied through electron-builder's signing configuration. Do not treat the unsigned development package as a production release.

Copy `tracker-config.example.json` to `tracker-config.json` next to the installed executable, or set `VICTORY_TRACKER_CONFIG` to an absolute configuration path. Use the same staging Supabase project and API deployment as the dashboard. The configuration takes only a public anon key. Never put a service-role key in this file. HTTPS is required except for localhost development.

The application requires an assigned agent account. The disclosure must be accepted before starting monitoring. Acceptance and the disclosure version are recorded in the database. Existing accepted consent is shown by the account's record when signing in on another device.

While working, a visible indicator shows tracking status. Pause, clock out, lock, suspend, sign out and close stop local capture. A 20-second authorization lease also stops capture when authorization is lost. Realtime session updates revoke capture when another dashboard stops the session; heartbeat polling is the fallback. Remote changes necessarily depend on network delivery. Validate that behavior on the deployment before rollout. The browser's idle detector defers to a recent desktop heartbeat, so an unused dashboard tab does not pause active desktop work.

The Windows helper receives short leases over stdin and emits aggregate counts once per second. It counts key-down and mouse-event types without dereferencing keyboard event payloads, storing key identities, typed text, clipboard contents or cursor coordinates. The main process aggregates counts per minute. Optional window titles and application names are collected only when enabled. No local telemetry spool is written. Pending aggregates are discarded on authorization loss rather than uploaded after a session change.

Screenshots capture the first enumerated screen at a random configured interval. Optional blur is applied in memory before upload. Blur reduces detail; it is not guaranteed redaction. Images use the private `workforce-screenshots` bucket, and the web dashboard obtains 60-second signed viewing URLs. Screen capture requires a current server authorization immediately before capture and RLS permission again at upload. Multi-monitor selection, high-DPI behavior, endpoint-protection compatibility and physical-device lock/suspend behavior need staging validation.

`npm run test --prefix desktop` exercises capture gates and interval bounds. From the repository root, `node tests/desktop-smoke.mjs` launches the setup screen hidden, checks that tracking remains off, and verifies that Node APIs are not available in the renderer. It performs no login or monitoring. The native helper can be compiled without calling `VictoryCounts.Run` to validate its C# code without installing hooks.

No automatic updater is enabled. Sign and distribute updates through your controlled Windows deployment process until a signed update channel is configured.
