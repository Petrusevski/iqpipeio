/**
 * useDemoMode
 *
 * Returns whether the current workspace is in demo mode.
 *
 * Intentionally starts as `false` and only flips to `true` after the server
 * confirms it. This prevents stale sessionStorage values from showing the demo
 * banner when demo data has already been removed.
 *
 * markDemoMode(false) clears the cache immediately so the next mount also
 * starts clean.
 */

import { useState, useEffect } from "react";
import { API_BASE_URL } from "../../config";

const SESSION_KEY = "iqpipe_is_demo";

export function useDemoMode(): boolean {
  // Always start as false — never trust a cached "true" from a prior session.
  // The effect below will set it to true if the server confirms demo mode.
  const [isDemo, setIsDemo] = useState<boolean>(false);

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

/** Call this after seeding/removing demo data to clear the cache. */
export function markDemoMode(value: boolean) {
  sessionStorage.setItem(SESSION_KEY, String(value));
}
