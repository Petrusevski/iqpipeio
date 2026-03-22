/**
 * usePushNotifications
 *
 * Manages the full Web Push lifecycle:
 *  1. Register the service worker (/sw.js)
 *  2. Fetch VAPID public key from /api/push/config
 *  3. Request notification permission
 *  4. Subscribe to push and POST to /api/push/subscribe
 *  5. Persist auth token to IndexedDB so the SW can re-subscribe on key rotation
 *  6. Expose state: permission, subscribed, loading, error
 *  7. Expose actions: subscribe(), unsubscribe(), sendTest(), updatePreferences()
 */

import { useState, useEffect, useCallback } from "react";
import { API_BASE_URL } from "../../config";

// ── Types ──────────────────────────────────────────────────────────────────

export type NotificationPermission = "default" | "granted" | "denied" | "unsupported";

export interface PushState {
  supported:    boolean;
  permission:   NotificationPermission;
  subscribed:   boolean;
  loading:      boolean;
  error:        string | null;
  eventTypes:   string[] | null; // null = all events
}

export interface PushActions {
  requestAndSubscribe: () => Promise<void>;
  unsubscribe:         () => Promise<void>;
  sendTest:            () => Promise<void>;
  updateEventTypes:    (types: string[] | null) => Promise<void>;
}

// ── VAPID key conversion ───────────────────────────────────────────────────

function urlBase64ToArrayBuffer(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw     = window.atob(base64);
  const buf     = new ArrayBuffer(raw.length);
  const view    = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buf;
}

// ── IndexedDB token persistence (for SW key-rotation re-subscribe) ─────────

async function persistTokenToIDB(token: string): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.open("iqpipe-sw", 1);
    req.onupgradeneeded = () => { req.result.createObjectStore("kv"); };
    req.onsuccess = () => {
      const tx = req.result.transaction("kv", "readwrite");
      tx.objectStore("kv").put(token, "auth_token");
      tx.oncomplete = () => resolve();
      tx.onerror    = () => resolve();
    };
    req.onerror = () => resolve();
  });
}

// ── Auth header helper ─────────────────────────────────────────────────────

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("iqpipe_token") ?? "";
  return {
    "Content-Type":  "application/json",
    "Authorization": `Bearer ${token}`,
  };
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function usePushNotifications(): [PushState, PushActions] {
  const [state, setState] = useState<PushState>({
    supported:  false,
    permission: "default",
    subscribed: false,
    loading:    true,
    error:      null,
    eventTypes: null,
  });

  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [vapidKey,     setVapidKey]     = useState<string>("");

  // ── Bootstrap: register SW + fetch VAPID key + probe current sub ──────────

  useEffect(() => {
    let mounted = true;

    async function init() {
      const supported =
        "serviceWorker" in navigator &&
        "PushManager"   in window &&
        "Notification"  in window;

      if (!supported) {
        setState((s) => ({ ...s, supported: false, loading: false }));
        return;
      }

      const permission = Notification.permission as NotificationPermission;

      // Register SW
      let reg: ServiceWorkerRegistration | null = null;
      try {
        reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        if (mounted) setRegistration(reg);
      } catch (err) {
        if (mounted)
          setState((s) => ({
            ...s, supported, permission, loading: false,
            error: "Service worker registration failed.",
          }));
        return;
      }

      // Fetch VAPID key
      let vapid = "";
      try {
        const res  = await fetch(`${API_BASE_URL}/api/push/config`);
        if (res.ok) {
          const data = await res.json();
          vapid = data.vapidPublicKey ?? "";
        }
      } catch { /* server offline — proceed without push */ }

      if (mounted) setVapidKey(vapid);

      // Probe current subscription state
      let subscribed  = false;
      let eventTypes: string[] | null = null;
      try {
        const existing = await reg.pushManager.getSubscription();
        if (existing) {
          subscribed = true;
          // Fetch preferences
          const encoded = encodeURIComponent(existing.endpoint);
          const prefRes = await fetch(
            `${API_BASE_URL}/api/push/preferences?endpoint=${encoded}`,
            { headers: authHeaders() },
          );
          if (prefRes.ok) {
            const prefData = await prefRes.json();
            if (prefData.subscribed) eventTypes = prefData.eventTypes;
          }
        }
      } catch { /* ignore */ }

      // Persist token for SW re-subscribe
      const token = localStorage.getItem("iqpipe_token");
      if (token) persistTokenToIDB(token).catch(() => {});

      if (mounted) {
        setState({ supported, permission, subscribed, loading: false, error: null, eventTypes });
      }
    }

    init();
    return () => { mounted = false; };
  }, []);

  // ── requestAndSubscribe ───────────────────────────────────────────────────

  const requestAndSubscribe = useCallback(async () => {
    if (!registration || !vapidKey) {
      setState((s) => ({ ...s, error: "Push not available on this server." }));
      return;
    }

    setState((s) => ({ ...s, loading: true, error: null }));

    // 1. Request permission
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      setState((s) => ({
        ...s,
        loading: false,
        permission: perm as NotificationPermission,
        error: perm === "denied" ? "Notification permission denied." : null,
      }));
      return;
    }

    try {
      // 2. Subscribe to push
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToArrayBuffer(vapidKey),
      });

      // 3. Send subscription to backend
      const res = await fetch(`${API_BASE_URL}/api/push/subscribe`, {
        method:  "POST",
        headers: authHeaders(),
        body:    JSON.stringify(sub.toJSON()),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save subscription.");
      }

      setState((s) => ({
        ...s, loading: false, permission: "granted", subscribed: true, error: null,
      }));
    } catch (err: any) {
      setState((s) => ({ ...s, loading: false, error: err.message ?? "Subscribe failed." }));
    }
  }, [registration, vapidKey]);

  // ── unsubscribe ────────────────────────────────────────────────────────────

  const unsubscribe = useCallback(async () => {
    if (!registration) return;
    setState((s) => ({ ...s, loading: true, error: null }));

    try {
      const sub = await registration.pushManager.getSubscription();
      if (sub) {
        await fetch(`${API_BASE_URL}/api/push/subscribe`, {
          method:  "DELETE",
          headers: authHeaders(),
          body:    JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState((s) => ({ ...s, loading: false, subscribed: false }));
    } catch (err: any) {
      setState((s) => ({ ...s, loading: false, error: err.message }));
    }
  }, [registration]);

  // ── sendTest ───────────────────────────────────────────────────────────────

  const sendTest = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetch(`${API_BASE_URL}/api/push/test`, {
        method:  "POST",
        headers: authHeaders(),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Test failed.");
      }
      setState((s) => ({ ...s, loading: false }));
    } catch (err: any) {
      setState((s) => ({ ...s, loading: false, error: err.message }));
    }
  }, []);

  // ── updateEventTypes ──────────────────────────────────────────────────────

  const updateEventTypes = useCallback(async (types: string[] | null) => {
    if (!registration) return;
    setState((s) => ({ ...s, loading: true, error: null }));

    try {
      const sub = await registration.pushManager.getSubscription();
      if (!sub) {
        setState((s) => ({ ...s, loading: false, error: "No active subscription." }));
        return;
      }

      const res = await fetch(`${API_BASE_URL}/api/push/preferences`, {
        method:  "PATCH",
        headers: authHeaders(),
        body:    JSON.stringify({ endpoint: sub.endpoint, eventTypes: types }),
      });

      if (!res.ok) throw new Error("Failed to update preferences.");
      setState((s) => ({ ...s, loading: false, eventTypes: types }));
    } catch (err: any) {
      setState((s) => ({ ...s, loading: false, error: err.message }));
    }
  }, [registration]);

  return [
    state,
    { requestAndSubscribe, unsubscribe, sendTest, updateEventTypes },
  ];
}

// ── Available event types for user preference UI ──────────────────────────

export const PUSH_EVENT_TYPES: { key: string; label: string; description: string }[] = [
  { key: "deal_won",          label: "Deal won",             description: "Alert when a deal closes as won" },
  { key: "deal_lost",         label: "Deal lost",            description: "Alert when a deal closes as lost" },
  { key: "signal_critical",   label: "Critical GTM signal",  description: "High-priority signal from pipeline health" },
  { key: "payment_failed",    label: "Payment failure",      description: "Billing payment could not be processed" },
  { key: "meeting_booked",    label: "Meeting booked",       description: "Prospect books a meeting" },
  { key: "new_lead",          label: "New lead",             description: "Lead enriched and entered pipeline" },
];
