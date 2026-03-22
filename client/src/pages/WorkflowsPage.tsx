import { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/PageHeader";

import { API_BASE_URL } from "../../config";
const API_BASE = API_BASE_URL;
const DEFAULT_WORKSPACE_ID = "demo-workspace";

type AppStep = {
  appId: string;
  displayName: string;
  role?: string | null;
};

type WorkflowNodeDb = {
  id: string;
  label?: string | null;
  appId?: string | null;
  appName?: string | null;
  role?: string | null;
  orderIndex?: number | null;
};

type Workflow = {
  id: string;
  name?: string | null;
  summary?: string | null;
  description?: string | null;
  createdAt?: string;
  apps?: AppStep[];
  nodes?: WorkflowNodeDb[];
  [key: string]: any;
};

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchWorkflows = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `${API_BASE}/api/workflows?workspaceId=${encodeURIComponent(
            DEFAULT_WORKSPACE_ID
          )}`
        );
        let data: any = null;
        try {
          data = await res.json();
        } catch {
          // ignore JSON parse error
        }

        if (!res.ok) {
          throw new Error(
            data?.error ||
              data?.message ||
              `HTTP ${res.status} ${res.statusText || ""}`.trim()
          );
        }

        const list: Workflow[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.workflows)
          ? data.workflows
          : [];

        setWorkflows(list);
      } catch (e: any) {
        setError(e?.message || "Failed to load workflows.");
      } finally {
        setLoading(false);
      }
    };

    fetchWorkflows();
  }, []);

  const latestWorkflow: Workflow | null = useMemo(() => {
    if (!workflows.length) return null;
    return (
      workflows
        .slice()
        .sort((a, b) =>
          a.createdAt && b.createdAt
            ? new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            : 0
        )[0] || null
    );
  }, [workflows]);

  // Build a simple left-to-right list of app steps
  const steps: AppStep[] = useMemo(() => {
    if (!latestWorkflow) return [];

    // 1) Prefer explicit apps[] array returned by the agent
    if (Array.isArray(latestWorkflow.apps) && latestWorkflow.apps.length > 0) {
      return latestWorkflow.apps.map((a) => ({
        appId: a.appId,
        displayName: a.displayName || a.appId,
        role: a.role ?? null,
      }));
    }

    // 2) Otherwise, try to use nodes[] (if you later store them)
    if (
      Array.isArray(latestWorkflow.nodes) &&
      latestWorkflow.nodes.length > 0
    ) {
      const ordered = [...latestWorkflow.nodes].sort((a, b) => {
        if (
          typeof a.orderIndex === "number" &&
          typeof b.orderIndex === "number"
        ) {
          return a.orderIndex - b.orderIndex;
        }
        return 0;
      });

      return ordered.map((n) => ({
        appId: n.appId || n.appName || n.label || "step",
        displayName: n.appName || n.label || n.appId || "Step",
        role: n.role ?? null,
      }));
    }

    // 3) Fallback: simple demo chain Clay -> iqpipe -> HeyReach
    return [
      { appId: "clay", displayName: "Clay", role: "trigger" },
      { appId: "iqpipe", displayName: "iqpipe", role: "router" },
      { appId: "heyreach", displayName: "HeyReach", role: "outreach" },
    ];
  }, [latestWorkflow]);

  const workflowTitle =
    latestWorkflow?.name ||
    latestWorkflow?.summary ||
    (steps.length
      ? steps.map((s) => s.displayName).join(" → ")
      : "Your first workflow");

  const workflowSubtitle =
    latestWorkflow?.description ||
    latestWorkflow?.summary ||
    "Describe a workflow in the assistant panel and iqpipe will generate it. It will appear here as a simple left-to-right path.";

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Workflows"
        subtitle="Design GTM automations that connect leads, deals, billing, and product usage."
        primaryActionLabel="New workflow"
        onPrimaryActionClick={() => {
          console.log("Open create workflow modal");
        }}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Left – templates */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <h2 className="text-sm font-semibold text-slate-100 mb-2">
            Templates
          </h2>
          <ul className="space-y-3 text-xs">
            <li className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 cursor-pointer hover:border-indigo-500/70">
              <p className="font-medium text-slate-100">Clay → Lead Inbox</p>
              <p className="text-slate-400">
                Import enriched leads from Clay and assign to owners.
              </p>
            </li>
            <li className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 cursor-pointer hover:border-indigo-500/70">
              <p className="font-medium text-slate-100">
                Hot Lead → Outbound Sequence
              </p>
              <p className="text-slate-400">
                Auto-enroll high score leads into multi-step outreach.
              </p>
            </li>
          </ul>
        </div>

        {/* Right – static visual canvas */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
          <h2 className="text-sm font-semibold text-slate-100 mb-1">Canvas</h2>
          <p className="text-xs text-slate-400 mb-3">
            A simple left-to-right flow of the apps involved in your latest
            workflow. No dragging, just a clean visual path.
          </p>

          <div className="h-72 rounded-2xl border border-dashed border-slate-700 bg-slate-950/80 flex flex-col">
            {loading && (
              <div className="flex-1 flex items-center justify-center text-xs text-slate-400">
                Loading workflows…
              </div>
            )}

            {!loading && error && (
              <div className="flex-1 flex items-center justify-center text-xs text-rose-300 px-4 text-center">
                {error}
              </div>
            )}

            {!loading && !error && (
              <div className="flex-1 flex flex-col gap-4 items-center justify-center px-6">
                <div className="text-[13px] font-medium text-slate-100 text-center">
                  {workflowTitle}
                </div>

                <div className="text-[11px] text-slate-400 text-center max-w-xl">
                  {workflowSubtitle}
                </div>

                <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
                  {steps.map((step, idx) => (
                    <div
                      key={step.appId + idx}
                      className="flex items-center gap-3"
                    >
                      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 min-w-[120px] justify-center">
                        {/* little circle with first letter; you can swap for real logos later */}
                        <div className="h-6 w-6 rounded-full bg-slate-800 flex items-center justify-center text-[11px] uppercase">
                          {step.displayName[0]}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-slate-100">
                            {step.displayName}
                          </span>
                          {step.role && (
                            <span className="text-[10px] text-slate-400">
                              {step.role}
                            </span>
                          )}
                        </div>
                      </div>

                      {idx < steps.length - 1 && (
                        <span className="text-slate-500 text-lg">➜</span>
                      )}
                    </div>
                  ))}

                  {steps.length === 0 && (
                    <div className="text-xs text-slate-500 text-center">
                      No workflow apps detected yet. Try asking the assistant:{" "}
                      <span className="italic">
                        "When Clay finds a new ICP-fit lead, send it to
                        iqpipe then to HeyReach."
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
