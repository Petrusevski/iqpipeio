import { useEffect, useRef } from "react";

const INACTIVITY_MS = 10 * 60 * 1000; // 10 minutes
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"];

export const SESSION_EXPIRES_KEY = "iqpipe_session_expires";

function clearSession() {
  localStorage.removeItem("iqpipe_token");
  localStorage.removeItem(SESSION_EXPIRES_KEY);
  window.location.replace("/login");
}

function refreshExpiry() {
  localStorage.setItem(SESSION_EXPIRES_KEY, String(Date.now() + INACTIVITY_MS));
}

/**
 * Ends the user session when:
 *  1. The tab/window is closed (beforeunload)
 *  2. The user is inactive for 10 minutes
 *
 * Also writes sessionExpiresAt to localStorage on every activity event so that
 * if beforeunload never fires (crash, mobile kill, force-quit), the next app
 * boot will detect the expired timestamp and clear the token before rendering.
 */
export function useSessionGuard() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // ── 1. Clear token on tab/window close ────────────────────────────────
    const handleUnload = () => {
      localStorage.removeItem("iqpipe_token");
      localStorage.removeItem(SESSION_EXPIRES_KEY);
    };
    window.addEventListener("beforeunload", handleUnload);

    // ── 2. Inactivity timer + expiry timestamp ────────────────────────────
    const resetTimer = () => {
      refreshExpiry();
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(clearSession, INACTIVITY_MS);
    };

    // Start the timer immediately and stamp the initial expiry
    resetTimer();

    // Reset on any user activity
    ACTIVITY_EVENTS.forEach(evt => window.addEventListener(evt, resetTimer, { passive: true }));

    return () => {
      window.removeEventListener("beforeunload", handleUnload);
      ACTIVITY_EVENTS.forEach(evt => window.removeEventListener(evt, resetTimer));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);
}
