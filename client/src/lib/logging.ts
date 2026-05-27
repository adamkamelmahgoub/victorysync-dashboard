import { buildApiUrl } from "../config";

const SESSION_KEY = "victorysync_session_id";

export function getLoggingSessionId() {
  try {
    let id = window.sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      window.sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return "session-unavailable";
  }
}

function stripSensitiveFields(value: any): any {
  if (Array.isArray(value)) return value.map(stripSensitiveFields);
  if (value && typeof value === "object") {
    const out: Record<string, any> = {};
    for (const [key, next] of Object.entries(value)) {
      out[key] = /(password|token|key|secret|card|cvv|ssn|authorization|cookie|payment)/i.test(key)
        ? "[redacted]"
        : stripSensitiveFields(next);
    }
    return out;
  }
  if (typeof value === "string") return value.replace(/\0/g, "").slice(0, 20000);
  return value;
}

export function postLog(path: string, payload: Record<string, any>) {
  try {
    const body = JSON.stringify(stripSensitiveFields({ ...payload, session_id: getLoggingSessionId() }));
    void fetch(buildApiUrl(path), {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-session-id": getLoggingSessionId() },
      body,
      keepalive: body.length < 60000,
    }).catch(() => undefined);
  } catch {
    // Logging must never affect the UI.
  }
}

export function logClientError(params: {
  error_type: string;
  error_message: string;
  error_stack?: string | null;
  endpoint?: string | null;
  http_status?: number | null;
  request_payload?: any;
}) {
  postLog("/api/logs/error", params);
}
