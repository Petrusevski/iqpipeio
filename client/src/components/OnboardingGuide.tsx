/**
 * OnboardingGuide — step data and localStorage helpers.
 * No JSX — pure data + state utilities used by Sidebar.
 */

import {
  Workflow, Zap, Search, HeartPulse, GitBranch, BarChart3, Settings,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const GUIDE_KEY_PREFIX = "iqpipe_guide_v2_";
export function getGuideKey(workspaceId: string) { return `${GUIDE_KEY_PREFIX}${workspaceId}`; }

export interface GuideStep {
  key:         string;
  path:        string;
  label:       string;
  Icon:        LucideIcon;
  iconColor:   string;
  title:       string;
  description: string;
  whatToDo:    string;
  ctaLabel:    string;
}

export const GUIDE_STEPS: GuideStep[] = [
  {
    key:         "automations",
    path:        "/automations",
    label:       "Automations",
    Icon:        Workflow,
    iconColor:   "text-indigo-400",
    title:       "Connect your automations",
    description: "This is where you connect your n8n or Make.com workspace. Once connected, IQPipe fetches all your workflows, maps which apps each automation uses, and starts monitoring every event that flows through them.",
    whatToDo:    "Paste your n8n API key + base URL, or your Make.com API key. IQPipe will immediately sync all your workflows and surface which tools they touch.",
    ctaLabel:    "Connect automations",
  },
  {
    key:         "feed",
    path:        "/feed",
    label:       "Live Feed",
    Icon:        Zap,
    iconColor:   "text-amber-400",
    title:       "Watch events flow in real time",
    description: "The Live Feed is a real-time stream of every signal across your entire GTM stack — email opens, replies, connection requests, enrichments, meetings booked, deals created. Everything in one place, the moment it happens.",
    whatToDo:    "Once you've connected your tools, events start appearing here within seconds. Use filters to drill into a specific tool, event type, or contact.",
    ctaLabel:    "Explore Live Feed",
  },
  {
    key:         "inspect",
    path:        "/inspect",
    label:       "Contact Inspector",
    Icon:        Search,
    iconColor:   "text-emerald-400",
    title:       "Full journey for any contact",
    description: "Search any contact by email or name and see their complete cross-tool timeline — every touchpoint, enrichment signal, reply, and outcome across every tool in your stack, all in chronological order.",
    whatToDo:    "Type a prospect's email in the search bar. You'll see exactly what they received, from which tool, and when — perfect context before any follow-up or call.",
    ctaLabel:    "Inspect a contact",
  },
  {
    key:         "workflow-health",
    path:        "/workflow-health",
    label:       "Workflow Health",
    Icon:        HeartPulse,
    iconColor:   "text-rose-400",
    title:       "Monitor your workflow health",
    description: "See the health of every active sequence and workflow — step-by-step error rates, bounce rates, reply rates, and event volumes. Catch problems before they burn your sending domain or miss quota.",
    whatToDo:    "Look for any workflow with a red health score. That means high bounce rate, API errors, or a silent tool. Click into it to see which step is failing.",
    ctaLabel:    "Check workflow health",
  },
  {
    key:         "compare",
    path:        "/compare",
    label:       "Workflow Compare",
    Icon:        BarChart3,
    iconColor:   "text-sky-400",
    title:       "Compare workflows side by side",
    description: "Workflow Compare lets you run a head-to-head analysis of any two automations — event volumes, conversion rates, tool performance, and outcome attribution. See exactly which workflow is driving more revenue.",
    whatToDo:    "Select two workflows from your connected n8n or Make.com workspace and click Compare. You'll get a breakdown of which one converts better and why.",
    ctaLabel:    "Compare workflows",
  },
  {
    key:         "my-workflow",
    path:        "/my-workflow",
    label:       "My Workflow",
    Icon:        GitBranch,
    iconColor:   "text-violet-400",
    title:       "Your personal workflow view",
    description: "A focused view of the workflows assigned to you — task statuses, next actions, and pipeline signals. Everything your team has flagged for your attention.",
    whatToDo:    "Review any flagged tasks or pipeline signals here. This is your personal workspace inside IQPipe.",
    ctaLabel:    "Open my workflow",
  },
  {
    key:         "settings",
    path:        "/settings",
    label:       "Settings",
    Icon:        Settings,
    iconColor:   "text-slate-400",
    title:       "Configure your workspace",
    description: "Set your workspace name, manage team members and roles, connect your Claude AI agent (MCP), and control data retention. All API credentials are AES-256 encrypted at rest.",
    whatToDo:    "Invite your team, set your company domain, and connect Claude for AI-powered diagnostics. If you're on the Agency plan, only corporate email addresses are allowed.",
    ctaLabel:    "Open settings",
  },
];

/** Returns the Set of completed step keys from localStorage, scoped to a workspace. */
export function getCompletedSteps(workspaceId: string): Set<string> {
  try {
    const raw = localStorage.getItem(getGuideKey(workspaceId)) ?? "";
    return new Set(raw.split(",").filter(Boolean));
  } catch {
    return new Set();
  }
}

/** Marks a step as done. Returns the updated completed set. */
export function markStepDone(key: string, workspaceId: string): Set<string> {
  const done = getCompletedSteps(workspaceId);
  done.add(key);
  localStorage.setItem(getGuideKey(workspaceId), Array.from(done).join(","));
  return done;
}

/** Returns the next incomplete step, or null if all done. */
export function getNextStep(done: Set<string>): GuideStep | null {
  return GUIDE_STEPS.find(s => !done.has(s.key)) ?? null;
}

/** Returns true if every step has been completed. */
export function isGuideComplete(done: Set<string>): boolean {
  return GUIDE_STEPS.every(s => done.has(s.key));
}

