/**
 * useAdmin — shared fetch utility for admin pages.
 * Reads the admin JWT from sessionStorage and attaches it to requests.
 */

import { API_BASE_URL } from "../../../config";

export function adminToken(): string {
  return sessionStorage.getItem("iqpipe_admin_token") ?? "";
}

export function adminHeaders(): Record<string, string> {
  return {
    "Content-Type":  "application/json",
    "Authorization": `Bearer ${adminToken()}`,
  };
}

export async function adminFetch<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}/api/admin${path}`, {
    ...init,
    headers: { ...adminHeaders(), ...(init?.headers ?? {}) },
  });

  if (res.status === 401) {
    sessionStorage.removeItem("iqpipe_admin_token");
    window.location.href = "/admin/login";
    throw new Error("Session expired.");
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed.");
  return data as T;
}
