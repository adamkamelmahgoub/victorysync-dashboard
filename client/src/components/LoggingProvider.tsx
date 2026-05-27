import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useActivityLogger } from "../hooks/useActivityLogger";
import { usePageViewLogger } from "../hooks/usePageViewLogger";
import { logClientError } from "../lib/logging";

export default function LoggingProvider() {
  const location = useLocation();
  const { logEvent } = useActivityLogger();
  usePageViewLogger();

  useEffect(() => {
    const clickHandler = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const el = target?.closest?.("[data-log]") as HTMLElement | null;
      if (!el) return;
      logEvent(
        el.dataset.log || "Clicked element",
        el.dataset.logType || "button_click",
        el.id || el.getAttribute("aria-label") || el.textContent?.trim().slice(0, 80) || el.tagName.toLowerCase(),
        { path: location.pathname }
      );
    };
    document.addEventListener("click", clickHandler, true);
    return () => document.removeEventListener("click", clickHandler, true);
  }, [location.pathname, logEvent]);

  useEffect(() => {
    window.onerror = (message, source, line, col, error) => {
      logClientError({
        error_type: "js_error",
        error_message: String(message || "Unknown browser error"),
        error_stack: error?.stack || null,
        endpoint: source ? `${source}:${line || 0}:${col || 0}` : window.location.pathname,
      });
      return false;
    };
    const rejectionHandler = (event: PromiseRejectionEvent) => {
      const reason: any = event.reason;
      logClientError({
        error_type: "unhandledrejection",
        error_message: reason?.message || String(reason || "Unhandled promise rejection"),
        error_stack: reason?.stack || null,
        endpoint: window.location.pathname,
      });
    };
    window.addEventListener("unhandledrejection", rejectionHandler);
    return () => {
      window.onerror = null;
      window.removeEventListener("unhandledrejection", rejectionHandler);
    };
  }, []);

  return null;
}
