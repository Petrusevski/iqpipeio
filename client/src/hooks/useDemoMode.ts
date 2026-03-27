/**
 * useDemoMode
 *
 * Returns whether the current workspace is in demo mode.
 * Caches the result in sessionStorage so we don't re-fetch on every render.
 * Always re-fetches once per session.
 */

import { useState, useEffect } from "react";
import { API_BASE_URL } from "../../config";

const SESSION_KEY = "iqpipe_is_demo";

export function useDemoMode(): boolean {
  const cached = sessionStorage.getItem(SESSION_KEY);
  const [isDemo, setIsDemo] = useState<boolean>(cached === "true");

  useEffect(() => {
    const token = localStorage.getItem("iqpipe_token");
    if (!token) return;
    fetch(`${API_BASE_URL}/api/workspaces/primary`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return;
        const demo = !!d.isDemo;
        sessionStorage.setItem(SESSION_KEY, String(demo));
        setIsDemo(demo);
      })
      .catch(() => {});
  }, []);

  return isDemo;
}

/** Call this after seeding to immediately reflect demo mode without a full re-fetch. */
export function markDemoMode(value: boolean) {
  sessionStorage.setItem(SESSION_KEY, String(value));
}
