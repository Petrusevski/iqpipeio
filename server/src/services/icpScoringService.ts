/**
 * icpScoringService.ts
 *
 * Scores IqLead records against the workspace ICP profile and writes
 * icpScore + icpGrade back to LeadActivitySummary.
 *
 * Re-uses the same scoring logic as icp.ts (scoreContact) but operates
 * on IqLead.company + IqLead.title rather than the legacy Lead model.
 *
 * Exported pure functions are tested independently of the DB.
 */

import { prisma } from "../db";

// ─── ICP profile shape (matches what icp.ts saves in IntegrationConnection) ──

export interface IcpProfile {
  targetTitles?:          string[];
  excludeSeniority?:      string[];
  targetIndustries?:      string[];
  targetCompanyKeywords?: string[];
  hotThreshold?:          number;   // default 70
  warmThreshold?:         number;   // default 40
  weights?: {
    title?:   number;
    company?: number;
    source?:  number;
  };
}

// ─── Pure scoring function (no DB, fully testable) ────────────────────────────

export function scoreIqLead(
  title:   string | null,
  company: string | null,
  profile: IcpProfile,
): number {
  const t = (title   || "").toLowerCase();
  const c = (company || "").toLowerCase();

  // ── Title score (0–100) ────────────────────────────────────────────────────
  let titleScore = 0;

  const targetTitles = (profile.targetTitles ?? []).map(s => s.toLowerCase());
  if (targetTitles.length > 0 && targetTitles.some(tt => t.includes(tt))) {
    titleScore = 100;
  } else {
    if      (/\b(ceo|cto|coo|cmo|cfo|ciso|cso|cpo|founder|co-founder|owner|president|managing director|md)\b/.test(t)) titleScore = 95;
    else if (/\b(vp|svp|evp|vice president|vice-president)\b/.test(t))                                                  titleScore = 80;
    else if (/\b(director|head of|head,|principal)\b/.test(t))                                                          titleScore = 68;
    else if (/\b(manager|lead|senior|sr\.?|team lead)\b/.test(t))                                                       titleScore = 45;
    else if (t.length > 1)                                                                                               titleScore = 20;
    else                                                                                                                 titleScore = 5;
  }

  const excludeSeniority = (profile.excludeSeniority ?? []).map(s => s.toLowerCase());
  if (excludeSeniority.some(s => t.includes(s))) {
    titleScore = Math.round(titleScore * 0.3);
  }

  // ── Company score (0–100) ─────────────────────────────────────────────────
  let companyScore = 30;

  const targetIndustries = (profile.targetIndustries ?? []).map(s => s.toLowerCase());
  const targetKeywords   = (profile.targetCompanyKeywords ?? []).map(s => s.toLowerCase());

  if      (targetIndustries.some(ind => c.includes(ind))) companyScore = 90;
  else if (targetKeywords.some(kw => c.includes(kw)))     companyScore = 80;
  else if (c.length > 1)                                  companyScore = 35;

  // ── Weighted combination ───────────────────────────────────────────────────
  const w      = profile.weights ?? {};
  const wTitle   = Number(w.title)   || 4;
  const wCompany = Number(w.company) || 2;
  const total    = wTitle + wCompany;

  const raw = (titleScore * wTitle + companyScore * wCompany) / total;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

export function gradeFromScore(score: number, profile: IcpProfile): string {
  const hot  = profile.hotThreshold  ?? 70;
  const warm = profile.warmThreshold ?? 40;
  if (score >= hot)  return "hot";
  if (score >= warm) return "warm";
  return "cold";
}

// ─── DB worker: score all IqLeads in a workspace ──────────────────────────────

export async function scoreWorkspaceLeads(workspaceId: string): Promise<{
  scored: number;
  skipped: number;
}> {
  // Load ICP profile
  const conn = await prisma.integrationConnection.findFirst({
    where:  { workspaceId, provider: "icp_profile" },
    select: { authData: true },
  });
  if (!conn?.authData) return { scored: 0, skipped: 0 };

  let profile: IcpProfile;
  try { profile = JSON.parse(conn.authData); }
  catch { return { scored: 0, skipped: 0 }; }

  // Load all IqLeads that have a LeadActivitySummary (i.e. active leads)
  const leads = await prisma.iqLead.findMany({
    where:  { workspaceId },
    select: { id: true, title: true, company: true },
  });

  let scored  = 0;
  let skipped = 0;

  for (const lead of leads) {
    const score = scoreIqLead(lead.title, lead.company, profile);
    const grade = gradeFromScore(score, profile);

    const updated = await prisma.leadActivitySummary.updateMany({
      where: { workspaceId, iqLeadId: lead.id },
      data:  { icpScore: score, icpGrade: grade } as any,
    });

    if (updated.count > 0) scored++;
    else skipped++;
  }

  return { scored, skipped };
}

// ─── Single-lead query (used by get_lead_score MCP tool) ─────────────────────

export async function getLeadScore(
  workspaceId: string,
  iqLeadId:    string,
): Promise<{
  iqLeadId:    string;
  displayName: string | null;
  company:     string | null;
  title:       string | null;
  icpScore:    number | null;
  icpGrade:    string | null;
  funnelStage: string;
  breakdown: {
    titleScore:   number;
    companyScore: number;
    hasProfile:   boolean;
  };
} | null> {
  const lead = await prisma.iqLead.findFirst({
    where:  { id: iqLeadId, workspaceId },
    select: { id: true, displayName: true, company: true, title: true },
  });
  if (!lead) return null;

  const summary = await prisma.leadActivitySummary.findUnique({
    where:  { iqLeadId },
    select: { funnelStage: true, icpScore: true, icpGrade: true } as any,
  }) as any;

  const conn = await prisma.integrationConnection.findFirst({
    where:  { workspaceId, provider: "icp_profile" },
    select: { authData: true },
  });

  const hasProfile = !!conn?.authData;
  let icpScore: number | null = summary?.icpScore ?? null;
  let icpGrade: string | null = summary?.icpGrade ?? null;
  let titleScore = 0;
  let companyScore = 0;

  if (hasProfile) {
    let profile: IcpProfile = {};
    try { profile = JSON.parse(conn!.authData!); } catch { /* */ }
    icpScore     = scoreIqLead(lead.title, lead.company, profile);
    icpGrade     = gradeFromScore(icpScore, profile);
    // Recompute breakdown
    const t = (lead.title   || "").toLowerCase();
    const c = (lead.company || "").toLowerCase();
    titleScore   = scoreIqLead(lead.title, null, profile);
    companyScore = scoreIqLead(null, lead.company, profile);
  }

  return {
    iqLeadId:    lead.id,
    displayName: lead.displayName,
    company:     lead.company,
    title:       lead.title,
    icpScore,
    icpGrade,
    funnelStage: summary?.funnelStage ?? "unknown",
    breakdown: { titleScore, companyScore, hasProfile },
  };
}
