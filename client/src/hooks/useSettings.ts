import { useEffect, useState } from "react";

import { API_BASE_URL } from "../../config";
const API_BASE = API_BASE_URL;

export type WorkspaceSettings = {
  id: string;
  workspaceName: string | null;
  companyName: string | null;
  primaryDomain: string | null;
  defaultCurrency: string;
  timezone: string;
  industry: string;
  plan: string;
  trialEndsAt: string | null;
  createdAt: string;
  seatsTotal: number;
  seatsUsed: number;
  billingEmail: string | null;
  iqpipeIdPrefix: string;
  publicApiKey: string;
  webhookEndpoint: string;
  dataAnonymization: boolean;
  dataRetentionMonths: number;
};

export type MembershipSettings = {
  id: string;
  role: string;
  isBillingOwner: boolean;
  darkMode: boolean;
  weeklyDigest: boolean;
  performanceAlerts: boolean;
  userFullName: string;
  userEmail: string;
};

export type SettingsResponse = {
  workspace: WorkspaceSettings;
  membership: MembershipSettings;
};

export function useSettings() {
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load on mount
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const token = localStorage.getItem("iqpipe_token");
        const headers: HeadersInit = {};

        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }

        const res = await fetch(`${API_BASE}/api/settings`, {
          headers,
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          const msg =
            body?.error ||
            (res.status === 401
              ? "Your session expired. Please log in again."
              : `Request failed: ${res.status}`);
          throw new Error(msg);
        }

        const data = (await res.json()) as SettingsResponse;
        if (!cancelled) {
          setSettings(data);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || "Failed to load settings");
          setSettings(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Save current state back to backend
  async function saveSettings() {
    if (!settings) return;
    try {
      setSaving(true);
      setError(null);

      const token = localStorage.getItem("iqpipe_token");
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE}/api/settings`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          workspace: settings.workspace,
          membership: settings.membership,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg =
          body?.error ||
          (res.status === 401
            ? "Your session expired. Please log in again."
            : `Save failed: ${res.status}`);
        throw new Error(msg);
      }

      const data = (await res.json()) as SettingsResponse;
      setSettings(data);
    } catch (err: any) {
      setError(err?.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  return {
    settings,
    setSettings,
    loading,
    saving,
    error,
    saveSettings,
  };
}
