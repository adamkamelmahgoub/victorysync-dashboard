const $ = (id) => document.getElementById(id);
function render(s) {
  $("error").textContent = s.error || "";
  $("login").hidden = s.signedIn;
  $("logout").hidden = !s.signedIn;
  $("disclosure").hidden = !s.signedIn || s.consent;
  $("disclosure-text").textContent = s.disclosure;
  $("work").hidden = !s.signedIn || !s.consent;
  $("indicator").textContent = s.tracking
    ? "TRACKING ON - activity is being counted"
    : "Tracking off";
  $("indicator").classList.toggle("active", s.tracking);
  const value = $("campaign").value;
  const campaigns = s.campaigns || [];
  if ($("campaign").dataset.keys !== JSON.stringify(campaigns)) {
    $("campaign").replaceChildren(
      ...campaigns.map((c) => {
        const option = document.createElement("option");
        option.value = c.id;
        option.textContent = c.name;
        return option;
      }),
    );
    $("campaign").dataset.keys = JSON.stringify(campaigns);
    if (campaigns.some((c) => c.id === value)) $("campaign").value = value;
  }
  $("status").textContent =
    (s.session?.status || "Clocked out") +
    (Number(s.budget?.percent) >= 80
      ? ` - ${Number(s.budget.percent) >= 95 ? "95%" : "80%"} of your hour allowance used`
      : "");
  const status = s.session?.status;
  $("start").disabled =
    status === "working" || status === "break" || !campaigns.length;
  $("pause").disabled = status !== "working";
  $("resume").disabled = status !== "break";
  $("stop").disabled = !["working", "break"].includes(status);
  $("settings").textContent =
    `Idle pause: ${s.settings.idle_minutes || 10} minutes. Screenshots: ${s.settings.screenshots_enabled ? `every ${s.settings.screenshot_min_minutes} to ${s.settings.screenshot_max_minutes} minutes` : "off"}. Window titles: ${s.settings.window_titles_enabled ? "on" : "off"}. Retention: ${s.settings.retention_days || 30} days.`;
}
async function run(fn) {
  try {
    const result = await fn();
    if (result.error) $("error").textContent = result.error;
    else render(result);
  } catch {
    $("error").textContent = "Unable to complete this action.";
  }
}
$("login").addEventListener("submit", (e) => {
  e.preventDefault();
  const data = new FormData(e.currentTarget);
  const password = data.get("password");
  e.currentTarget.elements.password.value = "";
  run(() => window.tracker.login(data.get("email"), password));
});
$("accept").onclick = () => run(() => window.tracker.consent());
$("logout").onclick = () => run(() => window.tracker.logout());
for (const action of ["start", "pause", "resume", "stop"])
  $(action).onclick = () =>
    run(() => window.tracker.timer(action, $("campaign").value));
window.tracker.onState(render);
window.tracker.state().then(render);
