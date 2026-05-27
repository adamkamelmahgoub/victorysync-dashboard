import { useCallback } from "react";
import { postLog } from "../lib/logging";

export function useActivityLogger() {
  const logEvent = useCallback((
    event_name: string,
    event_type = "interaction",
    element?: string | null,
    metadata: Record<string, any> = {}
  ) => {
    postLog("/api/logs/activity", {
      event_type,
      event_name,
      page: window.location.pathname,
      element: element || null,
      metadata,
    });
  }, []);

  return { logEvent };
}
