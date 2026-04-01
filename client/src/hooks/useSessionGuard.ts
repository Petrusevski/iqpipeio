import { useEffect, useRef } from "react";

const INACTIVITY_MS = 10 * 60 * 1000; // 10 minutes
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"];

function clearSession() {
  localStorage.removeItem("iqpipe_token");
  window.location.replace("/login");
}

/**
 * Ends the user session when:
 *  1. The tab/window is closed (beforeunload)
 *  2. The user is inactive for 10 minutes
 */
export function useSessionGuard() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // ── 1. Clear token on tab/window close ────────────────────────────────
    const handleUnload = () => {
      localStorage.removeItem("iqpipe_token");
    };
    window.addEventListener("beforeunload", handleUnload);

    // ── 2. Inactivity timer ───────────────────────────────────────────────
    const resetTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(clearSession, INACTIVITY_MS);
    };

    // Start the timer immediately
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
