import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { postLog } from "../lib/logging";

export function usePageViewLogger() {
  const location = useLocation();
  const currentRef = useRef<{ page: string; title: string; enteredAt: number } | null>(null);

  useEffect(() => {
    const next = {
      page: `${location.pathname}${location.search || ""}`,
      title: document.title || location.pathname,
      enteredAt: Date.now(),
    };

    if (currentRef.current) {
      const previous = currentRef.current;
      postLog("/api/logs/pageview", {
        page: previous.page,
        page_title: previous.title,
        referrer: document.referrer || null,
        time_on_page_seconds: Math.max(0, Math.round((Date.now() - previous.enteredAt) / 1000)),
      });
    }

    postLog("/api/logs/activity", {
      event_type: "page_view",
      event_name: `Viewed ${next.title}`,
      page: next.page,
      element: null,
      metadata: { path: next.page },
    });
    currentRef.current = next;
  }, [location.pathname, location.search]);

  useEffect(() => {
    const flush = () => {
      const current = currentRef.current;
      if (!current) return;
      postLog("/api/logs/pageview", {
        page: current.page,
        page_title: current.title,
        referrer: document.referrer || null,
        time_on_page_seconds: Math.max(0, Math.round((Date.now() - current.enteredAt) / 1000)),
      });
    };
    window.addEventListener("beforeunload", flush);
    return () => {
      flush();
      window.removeEventListener("beforeunload", flush);
    };
  }, []);
}
