import React, { useState } from "react";

import { API_BASE_URL } from "../../config";
const API_BASE = API_BASE_URL;

type RequiredIntegration = {
  appId: string;
  displayName: string;
  status: string;
  missingCredentialFields: string[] | any; // be lenient at runtime
  reason?: string;
};

interface SecureVaultModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  integrations: RequiredIntegration[];
  onConnected?: (provider: string) => void; // optional callback when saved
}

export const SecureVaultModal: React.FC<SecureVaultModalProps> = ({
  isOpen,
  onClose,
  workspaceId,
  integrations,
  onConnected
}) => {
  const [values, setValues] = useState<Record<string, Record<string, string>>>(
    {}
  );
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleChange = (
    appId: string,
    fieldKey: string,
    value: string
  ): void => {
    setValues((prev) => ({
      ...prev,
      [appId]: {
        ...(prev[appId] || {}),
        [fieldKey]: value
      }
    }));
  };

  const handleSave = async (provider: string) => {
    setError(null);
    setLoadingProvider(provider);

    try {
      const credentials = values[provider] || {};

      const res = await fetch(
        `${API_BASE}/api/integrations/${provider}/connect`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            credentials
          })
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data?.error ||
            data?.message ||
            `HTTP ${res.status} ${res.statusText || ""}`.trim()
        );
      }

      if (onConnected) {
        onConnected(provider);
      }
    } catch (e: any) {
      setError(e?.message || "Something went wrong while saving credentials.");
    } finally {
      setLoadingProvider(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full md:max-w-xl bg-slate-950 border border-slate-800 rounded-t-2xl md:rounded-2xl shadow-xl shadow-black/50 overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-50">
              Secure API Key Vault
            </h2>
            <p className="text-[11px] text-slate-400">
              Store tokens and API keys per app. They are tied to this workspace
              only.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-100 text-lg"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[65vh] overflow-y-auto px-4 py-3 space-y-4 text-sm">
          {integrations.length === 0 && (
            <div className="text-xs text-slate-400">
              No integrations require credentials right now.
            </div>
          )}

          {integrations.map((integration) => {
            const { appId, displayName, status, reason } = integration;

            // Be defensive about the shape of missingCredentialFields
            const rawMissing: any = (integration as any).missingCredentialFields;
            const missingCredentialFields: string[] = Array.isArray(rawMissing)
              ? rawMissing
              : rawMissing && typeof rawMissing === "object"
              ? Object.keys(rawMissing)
              : [];

            return (
              <div
                key={appId}
                className="border border-slate-800 rounded-xl p-3 bg-slate-900/60"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold text-slate-100 flex items-center gap-2">
                      <span>{displayName}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                        {appId}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {reason
                        ? reason
                        : "This app is used in your workflows and needs credentials."}
                    </div>
                  </div>
                  <span
                    className={
                      "text-[10px] px-2 py-0.5 rounded-full " +
                      (status === "connected"
                        ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/40"
                        : "bg-amber-500/10 text-amber-300 border border-amber-500/40")
                    }
                  >
                    {status === "connected" ? "Connected" : "Not connected"}
                  </span>
                </div>

                {missingCredentialFields.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {missingCredentialFields.map((fieldKey) => (
                      <div key={fieldKey} className="flex flex-col gap-1">
                        <label className="text-[11px] text-slate-300">
                          {fieldKey}
                        </label>
                        <input
                          type="password"
                          className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                          placeholder={`Enter ${fieldKey}`}
                          value={values[appId]?.[fieldKey] || ""}
                          onChange={(e) =>
                            handleChange(appId, fieldKey, e.target.value)
                          }
                        />
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-3 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">
                    Keys are stored server-side and not sent to the AI model.
                  </span>
                  <button
                    type="button"
                    disabled={loadingProvider === appId}
                    onClick={() => handleSave(appId)}
                    className="px-3 py-1.5 rounded-full bg-indigo-500 text-white font-medium disabled:bg-slate-700 disabled:cursor-not-allowed hover:bg-indigo-400"
                  >
                    {loadingProvider === appId ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            );
          })}

          {error && (
            <div className="text-[11px] text-rose-400 bg-rose-500/10 border border-rose-500/40 rounded-lg px-2 py-1.5">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-slate-800 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="text-[11px] px-3 py-1.5 rounded-full bg-slate-800 text-slate-200 hover:bg-slate-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
