/**
 * iqpipe Service Worker
 *
 * Responsibilities:
 *  1. Receive `push` events and display system notifications
 *  2. Handle `notificationclick` to focus/open the app
 *  3. Handle `pushsubscriptionchange` to re-subscribe automatically
 *
 * This file must be served from the root scope (/sw.js) to have
 * full-origin push notification permissions.
 */

/* ── Push event ────────────────────────────────────────────────────────── */

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "iqpipe", body: event.data.text(), url: "/" };
  }

  const title   = payload.title   ?? "iqpipe";
  const options = {
    body:      payload.body      ?? "",
    icon:      payload.icon      ?? "/favicon.svg",
    badge:     payload.badge     ?? "/favicon.svg",
    tag:       payload.eventType ?? "iqpipe-notification",
    renotify:  false, // don't vibrate again for same tag
    requireInteraction: false,
    data: { url: payload.url ?? "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

/* ── Notification click ─────────────────────────────────────────────────── */

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url ?? "/";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        // If there is already a window open, focus it and navigate
        for (const client of windowClients) {
          if ("focus" in client) {
            client.focus();
            if ("navigate" in client) client.navigate(targetUrl);
            return;
          }
        }
        // Otherwise open a new window
        if (clients.openWindow) return clients.openWindow(targetUrl);
      })
  );
});

/* ── Subscription change (browser rotated keys) ─────────────────────────── */

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    self.registration.pushManager
      .subscribe({
        userVisibleOnly: true,
        applicationServerKey: event.oldSubscription?.options?.applicationServerKey,
      })
      .then(async (newSub) => {
        const token = await getAuthToken();
        if (!token) return;

        await fetch("/api/push/subscribe", {
          method:  "POST",
          headers: {
            "Content-Type":  "application/json",
            "Authorization": `Bearer ${token}`,
          },
          body: JSON.stringify(newSub.toJSON()),
        });
      })
      .catch((err) => console.error("[sw] pushsubscriptionchange re-subscribe failed:", err))
  );
});

/* ── Helper: read auth token from IndexedDB (set by the app) ─────────────── */

async function getAuthToken() {
  // The app stores the token in localStorage which is not accessible
  // from a service worker. Instead we read from a dedicated IDB store
  // written by usePushNotifications hook.
  try {
    return await new Promise((resolve) => {
      const req = indexedDB.open("iqpipe-sw", 1);

      req.onupgradeneeded = () => {
        req.result.createObjectStore("kv");
      };

      req.onsuccess = () => {
        const tx  = req.result.transaction("kv", "readonly");
        const get = tx.objectStore("kv").get("auth_token");
        get.onsuccess = () => resolve(get.result ?? null);
        get.onerror   = () => resolve(null);
      };

      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}
