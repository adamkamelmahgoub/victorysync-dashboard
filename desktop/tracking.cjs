const DISCLOSURE_VERSION = "2026-09-29-v1";
const DISCLOSURE =
  "While you are clocked in, Victory Sync records per-minute counts of keystrokes, mouse clicks and mouse movement. The tracker never records which keys you press or any typed content. When enabled by an administrator, it captures screenshots at random intervals and the active application and window title. Screenshots may contain sensitive content; optional blur reduces detail but is not guaranteed redaction. Screenshots and activity are visible to you and authorized staff. Screenshots may also be shared with your client if an administrator enables access. Nothing is captured during breaks or while clocked out. A visible indicator shows when tracking is active. Screenshots are deleted after the configured retention period. Accept to enable monitoring on this device.";
function canCapture({
  consent,
  locked,
  session,
  leaseUntil,
  now = Date.now(),
}) {
  return (
    consent === true &&
    !locked &&
    session?.status === "working" &&
    !session.ended_at &&
    Number.isFinite(leaseUntil) &&
    leaseUntil > now
  );
}
function nextScreenshot(settings, random = Math.random) {
  const min = Math.max(1, Number(settings.screenshot_min_minutes) || 5);
  const max = Math.max(min, Number(settings.screenshot_max_minutes) || 10);
  return (min + random() * (max - min)) * 60000;
}
module.exports = { DISCLOSURE, DISCLOSURE_VERSION, canCapture, nextScreenshot };
