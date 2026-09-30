const {
  app,
  BrowserWindow,
  ipcMain,
  desktopCapturer,
  powerMonitor,
  session: electronSession,
} = require("electron");
const { createClient } = require("@supabase/supabase-js");
const { spawn } = require("node:child_process");
const { createInterface } = require("node:readline");
const fs = require("node:fs");
const path = require("node:path");
const {
  DISCLOSURE,
  DISCLOSURE_VERSION,
  canCapture,
  nextScreenshot,
} = require("./tracking.cjs");
let win,
  db,
  config,
  helper,
  current = null,
  settings = {},
  campaigns = [],
  consent = false,
  locked = false,
  leaseUntil = 0,
  nextShot = Infinity,
  error = "",
  busy = false;
let sample = null,
  refreshing = false,
  shotBusy = false,
  closing = false,
  pendingPause = null,
  budget = null;
function active() {
  return canCapture({
    consent,
    locked: locked || !!pendingPause,
    session: current,
    leaseUntil,
  });
}
function stopCapture() {
  leaseUntil = 0;
  sample = null;
  if (helper?.stdin.writable) helper.stdin.write("0,0\n");
  publish();
}
function publicState() {
  return {
    signedIn: !!db && !!currentUser,
    session: current,
    tracking: active(),
    settings,
    campaigns,
    consent,
    budget,
    leaseUntil,
    disclosure: DISCLOSURE,
    error,
  };
}
let currentUser = null;
function publish() {
  if (win && !win.isDestroyed()) {
    win.setTitle(
      active() ? "Victory Sync - TRACKING ON" : "Victory Sync - Tracking off",
    );
    win.webContents.send("state", publicState());
  }
}
async function api(route, body) {
  const { data } = await db.auth.getSession();
  if (!data.session) throw Error("Sign in again.");
  let csrfToken = "";
  if (body) {
    const csrf = await fetch(`${config.apiUrl}/api/csrf-token`, {
      headers: { Authorization: `Bearer ${data.session.access_token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!csrf.ok) throw Error("Unable to authorize this action.");
    csrfToken = (await csrf.json()).csrfToken;
  }
  const response = await fetch(`${config.apiUrl}/api/workforce/${route}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      "Content-Type": "application/json",
      "x-csrf-token": csrfToken,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(10000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok)
    throw Error(result.message || "Unable to contact the workforce service.");
  return result;
}
async function all(table) {
  let offset = 0;
  const rows = [];
  do {
    const p = await api(`data/${table}?offset=${offset}`);
    rows.push(...p.rows);
    offset = p.next_offset;
  } while (offset !== null);
  return rows;
}
async function command(action, campaign) {
  if (["pause", "idle", "stop"].includes(action)) {
    pendingPause = action;
    stopCapture();
  }
  const result = (
    await api("actions/timer", { action, campaign: campaign || null })
  ).result;
  current = result.session;
  budget = result.budget;
  if (["start", "resume"].includes(action)) nextShot = Date.now() + nextScreenshot(settings);
  if (["pause", "idle", "stop", "start", "resume"].includes(action))
    pendingPause = null;
  leaseUntil = Math.min(
    Date.now() + 20000,
    Date.now() +
      Math.max(
        0,
        Date.parse(result.authorized_until) - Date.parse(result.server_time),
      ),
  );
  if (!active()) stopCapture();
  publish();
  return result;
}
async function sendSample(item) {
  if (item)
    await api("actions/activity", {
      sid: item.sid,
      at_minute: item.minute,
      keys: item.keys,
      clicks: item.clicks,
      movements: item.movements,
      app: settings.window_titles_enabled ? item.app : null,
      title: settings.window_titles_enabled ? item.title : null,
    });
}
async function flush() {
  const item = sample;
  sample = null;
  await sendSample(item);
}
function startHelper() {
  const script = path.join(
    app.isPackaged ? process.resourcesPath : __dirname,
    "native",
    "counts.ps1",
  );
  helper = spawn(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      script,
    ],
    { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
  );
  helper.on("error", () => {
    error = "Activity helper is unavailable. Tracking is paused.";
    stopCapture();
    command("pause").catch(() => {});
  });
  helper.on("exit", () => {
    helper = null;
    error = "Activity helper stopped. Tracking is paused.";
    stopCapture();
    if (current?.status === "working") command("pause").catch(() => {});
  });
  helper.stderr.on("data", () => {
    error = "Activity helper could not start.";
    stopCapture();
  });
  createInterface({ input: helper.stdout }).on("line", async (line) => {
    if (!active()) return;
    try {
      const counts = JSON.parse(line);
      const minute = new Date(
        Math.floor(Date.now() / 60000) * 60000,
      ).toISOString();
      if (sample && sample.minute !== minute) {
        const previous = sample;
        sample = null;
        sendSample(previous).catch(() => {
          error = "Activity upload failed. Tracking is paused.";
          pendingPause = "pause";
          stopCapture();
        });
      }
      if (!active()) return;
      if (!sample)
        sample = { sid: current.id, minute, keys: 0, clicks: 0, movements: 0 };
      sample.app =
        settings.window_titles_enabled && counts.app
          ? Buffer.from(counts.app, "base64").toString("utf8")
          : null;
      sample.title =
        settings.window_titles_enabled && counts.title
          ? Buffer.from(counts.title, "base64").toString("utf8")
          : null;
      for (const key of ["keys", "clicks", "movements"])
        sample[key] = Math.min(
          60000,
          sample[key] + Math.max(0, Math.min(60000, Number(counts[key]) || 0)),
        );
    } catch {
      error = "Activity upload failed. Tracking is paused.";
      stopCapture();
      command("pause").catch(() => {});
    }
  });
}
async function screenshot() {
  if (
    shotBusy ||
    !active() ||
    !settings.screenshots_enabled ||
    Date.now() < nextShot
  )
    return;
  shotBusy = true;
  nextShot = Date.now() + nextScreenshot(settings);
  try {
    const sid = current.id;
    const shot = (await api("actions/screenshot", { sid })).result;
    if (!active() || current.id !== sid) return;
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: 1600, height: 1000 },
      fetchWindowIcons: false,
    });
    if (!active() || current.id !== sid) return;
    let image = sources[0]?.thumbnail;
    if (!image || image.isEmpty()) throw Error("Screen capture unavailable.");
    if (shot.blurred)
      image = image
        .resize({ width: 32 })
        .resize({ width: 1600, quality: "best" });
    const bytes = image.toJPEG(70);
    if (!active()) return;
    const { error: uploadError } = await db.storage
      .from("workforce-screenshots")
      .upload(shot.object_path, bytes, {
        contentType: "image/jpeg",
        upsert: false,
      });
    if (uploadError) throw uploadError;
  } catch (e) {
    error = e.message;
  } finally {
    shotBusy = false;
    publish();
  }
}
async function refresh() {
  if (refreshing || !currentUser) return;
  refreshing = true;
  try {
    settings = (await all("settings"))[0] || {};
    if (pendingPause) await command(pendingPause);
    if (
      current?.status === "working" &&
      powerMonitor.getSystemIdleTime() >= (settings.idle_minutes || 10) * 60
    )
      await command("idle");
    else await command("desktop_state");
    if (active() && helper?.stdin.writable)
      helper.stdin.write(
        `${Math.max(0, Math.floor(leaseUntil - Date.now()))},${settings.window_titles_enabled ? "1" : "0"}\n`,
      );
    await screenshot();
  } catch (e) {
    error = e.message;
    pendingPause = "pause";
    stopCapture();
  } finally {
    refreshing = false;
    publish();
  }
}
function handle(channel, fn) {
  ipcMain.handle(channel, async (event, arg) => {
    if (
      event.sender !== win.webContents ||
      event.senderFrame !== win.webContents.mainFrame
    )
      throw Error("Untrusted sender");
    try {
      return await fn(arg);
    } catch (e) {
      error = e.message;
      publish();
      return { error };
    }
  });
}
app.whenReady().then(() => {
  try {
    const configFile =
      process.env.VICTORY_TRACKER_CONFIG ||
      path.join(path.dirname(app.getPath("exe")), "tracker-config.json");
    config = JSON.parse(fs.readFileSync(configFile, "utf8"));
    for (const key of ["apiUrl", "supabaseUrl"]) {
      const u = new URL(config[key]);
      if (
        u.protocol !== "https:" &&
        !(u.hostname === "localhost" && u.protocol === "http:")
      )
        throw Error("Use HTTPS service URLs.");
      config[key] = u.origin;
    }
    db = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: true },
    });
    db.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        currentUser = null;
        current = null;
        consent = false;
        stopCapture();
      }
    });
  } catch {
    error =
      "Administrator setup required: provide tracker-config.json with apiUrl, supabaseUrl and supabaseAnonKey.";
  }
  win = new BrowserWindow({
    show: app.isPackaged || process.env.VICTORY_TRACKER_TEST !== "1",
    width: 500,
    height: 760,
    minWidth: 360,
    minHeight: 540,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  win.setMenu(null);
  win.loadFile("index.html");
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  electronSession.defaultSession.setPermissionRequestHandler(
    (_contents, _permission, callback) => callback(false),
  );
  handle("state", async () => publicState());
  handle("login", async ({ email, password }) => {
    if (!db) throw Error(error);
    if (typeof email !== "string" || typeof password !== "string")
      throw Error("Invalid credentials.");
    const result = await db.auth.signInWithPassword({ email, password });
    if (result.error) throw result.error;
    const me = await api("me");
    if (me.role !== "agent") {
      await db.auth.signOut();
      throw Error("The desktop tracker is for assigned agents.");
    }
    currentUser = me.user_id;
    await db.removeAllChannels();
    db.channel('work-session').on('postgres_changes', {event:'UPDATE',schema:'public',table:'wf_sessions',filter:`agent_id=eq.${currentUser}`}, ({new: row}) => {
      if(current?.id===row.id && (row.status!=='working'||row.ended_at)) {current=row;stopCapture();}
    }).subscribe();
    consent = (await all("consents")).some(
      (c) => c.disclosure_version === DISCLOSURE_VERSION,
    );
    campaigns = await all("campaigns");
    settings = (await all("settings"))[0] || {};
    error = "";
    if (!helper) startHelper();
    nextShot = Date.now() + nextScreenshot(settings);
    await refresh();
    return publicState();
  });
  handle("consent", async () => {
    await api("actions/consent", { version: DISCLOSURE_VERSION });
    consent = true;
    await refresh();
    return publicState();
  });
  handle("timer", async ({ action, campaign }) => {
    if (!consent) throw Error("Accept the monitoring disclosure first.");
    if (!["start", "pause", "resume", "stop"].includes(action))
      throw Error("Invalid timer action.");
    if (busy) throw Error("Wait for the current action.");
    busy = true;
    try {
      const pending = sample;
      if (["pause", "stop"].includes(action)) {
        pendingPause = action;
        stopCapture();
      } else sample = null;
      if (pending) await sendSample(pending);
      await command(action, campaign);
      await refresh();
      return publicState();
    } finally {
      busy = false;
    }
  });
  handle("logout", async () => {
    stopCapture();
    if (current?.status === "working" || current?.status === "break")
      await command("stop");
    await db.auth.signOut();
    currentUser = null;
    current = null;
    consent = false;
    publish();
    return publicState();
  });
  powerMonitor.on("suspend", () => {
    locked = true;
    stopCapture();
    command("pause").catch(() => {});
  });
  powerMonitor.on("lock-screen", () => {
    locked = true;
    stopCapture();
    command("pause").catch(() => {});
  });
  powerMonitor.on("resume", () => {
    locked = false;
    publish();
  });
  powerMonitor.on("unlock-screen", () => {
    locked = false;
    publish();
  });
  setInterval(refresh, 10000);
  setInterval(() => {
    if (!active()) stopCapture();
  }, 1000);
  win.on("close", (event) => {
    if (closing) return;
    event.preventDefault();
    closing = true;
    stopCapture();
    Promise.race([
      currentUser ? command("stop").catch(() => {}) : Promise.resolve(),
      new Promise((r) => setTimeout(r, 3000)),
    ]).finally(() => {
      helper?.kill();
      app.quit();
    });
  });
});
app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => {
  stopCapture();
  helper?.kill();
});
