/** Run from a trusted scheduler every minute. No public maintenance endpoint. */
import "dotenv/config";
import { supabaseAdmin } from "../lib/supabaseClient";

async function maintain() {
  const swept = await supabaseAdmin.rpc("wf_sweep_timers");
  if (swept.error) throw swept.error;
  let deleted = 0,
    failures = 0;
  // Retention changes apply to existing screenshots too. Never extend old expiry.
  const settings = await supabaseAdmin
    .from("wf_settings")
    .select("retention_days")
    .single();
  if (settings.error) throw settings.error;
  const cutoff = new Date(
    Date.now() - settings.data.retention_days * 86400000,
  ).toISOString();
  for (let batch = 0; batch < 100; batch++) {
    const expired = await supabaseAdmin
      .from("wf_screenshots")
      .select("id,object_path")
      .or(
        `expires_at.lte.${new Date().toISOString()},captured_at.lte.${cutoff}`,
      )
      .order("id")
      .limit(100);
    if (expired.error) throw expired.error;
    if (!expired.data.length) break;
    const result = await supabaseAdmin.storage
      .from("workforce-screenshots")
      .remove(expired.data.map((p) => p.object_path));
    if (result.error) {
      failures += expired.data.length;
      break;
    }
    const removed = await supabaseAdmin
      .from("wf_screenshots")
      .delete()
      .in(
        "id",
        expired.data.map((p) => p.id),
      );
    if (removed.error) throw removed.error;
    deleted += expired.data.length;
  }
  const activity = await supabaseAdmin
    .from("wf_activity")
    .delete()
    .lt("minute_at", cutoff);
  if (activity.error) failures++;
  const log = await supabaseAdmin
    .from("wf_retention_runs")
    .insert({ deleted_count: deleted, error_count: failures });
  if (log.error) throw log.error;
  console.log(JSON.stringify({ deleted, failures }));
  if (failures) process.exitCode = 1;
}
maintain().catch(() => {
  console.error(
    "Workforce maintenance failed. Check scheduler credentials and migrations.",
  );
  process.exitCode = 1;
});
