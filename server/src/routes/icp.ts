import { Router, Request, Response } from "express";
import { prisma } from "../db";
import { ACTIVITY_DELTA, applyActivityDeltas } from "../utils/icpUtils";
import { scoreWorkspaceLeads } from "../services/icpScoringService";

const router = Router();

// ── Scoring engine ────────────────────────────────────────────────────────────

function scoreContact(lead: any, profile: any): number {
  const title   = (lead.title   || "").toLowerCase();
  const company = (lead.company || "").toLowerCase();
  const source  = (lead.source  || "").toLowerCase();

  // ── 1. Title score (0–100) ───────────────────────────────────────────────
  let titleScore = 0;

  // Exact match against user-defined target titles (highest priority)
  const targetTitles: string[] = (profile.targetTitles || []).map((t: string) => t.toLowerCase());
  if (targetTitles.some(t => title.includes(t))) {
    titleScore = 100;
  } else {
    // Seniority ladder
    if (/\b(ceo|cto|coo|cmo|cfo|ciso|cso|cpo|founder|co-founder|owner|president|managing director|md)\b/.test(title))  titleScore = 95;
    else if (/\b(vp|svp|evp|vice president|vice-president)\b/.test(title)) titleScore = 80;
    else if (/\b(director|head of|head,|principal)\b/.test(title))          titleScore = 68;
    else if (/\b(manager|lead|senior|sr\.?|team lead)\b/.test(title))       titleScore = 45;
    else if (title.length > 1)                                               titleScore = 20;
    else                                                                     titleScore = 5;
  }

  // Check against explicitly excluded seniority levels
  const excludeSeniority: string[] = profile.excludeSeniority || [];
  if (excludeSeniority.some(s => title.includes(s.toLowerCase()))) {
    titleScore = Math.round(titleScore * 0.3); // Heavy penalty
  }

  // ── 2. Company score (0–100) ─────────────────────────────────────────────
  let companyScore = 30; // base: company is at least known

  const targetIndustries: string[] = (profile.targetIndustries || []).map((i: string) => i.toLowerCase());
  const targetKeywords:   string[] = (profile.targetCompanyKeywords || []).map((k: string) => k.toLowerCase());

  if (targetIndustries.some(ind => company.includes(ind))) companyScore = 90;
  else if (targetKeywords.some(kw => company.includes(kw)))  companyScore = 80;
  else if (company.length > 1)                               companyScore = 35;

  // ── 3. Source quality score (0–100) ──────────────────────────────────────
  const sourceMap: [RegExp, number][] = [
    [/apollo|zoominfo|lusha|cognism|bombora/,    92],
    [/clearbit|clay|hunter|phantombuster/,       80],
    [/linkedin/,                                 85],
    [/heyreach|lemlist|instantly|smartlead/,     68],
    [/hubspot|salesforce|pipedrive/,             65],
    [/webhook/,                                  60],
    [/google sheets/,                            50],
    [/csv/,                                      45],
    [/manual/,                                   28],
  ];

  let sourceScore = 25;
  for (const [pattern, score] of sourceMap) {
    if (pattern.test(source)) { sourceScore = score; break; }
  }

  // ── 4. Weighted combination ───────────────────────────────────────────────
  const w = profile.weights || {};
  const wTitle   = Number(w.title)   || 4;
  const wCompany = Number(w.company) || 2;
  const wSource  = Number(w.source)  || 1;
  const total    = wTitle + wCompany + wSource;

  const raw = (titleScore * wTitle + companyScore * wCompany + sourceScore * wSource) / total;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

function deriveGrade(score: number | null, profile: any): string | null {
  if (score === null) return null;
  const hot  = profile.hotThreshold  ?? 70;
  const warm = profile.warmThreshold ?? 40;
  if (score >= hot)  return "hot";
  if (score >= warm) return "warm";
  return "cold";
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/icp/profile
router.get("/profile", async (req: Request, res: Response) => {
  const workspaceId = String(req.query.workspaceId || "");
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });
  try {
    const conn = await prisma.integrationConnection.findFirst({
      where: { workspaceId, provider: "icp_profile" },
    });
    return res.json({ profile: conn ? JSON.parse(conn.authData || "null") : null });
  } catch {
    return res.status(500).json({ error: "Failed to load ICP profile" });
  }
});

// POST /api/icp/profile
router.post("/profile", async (req: Request, res: Response) => {
  const { workspaceId, profile } = req.body;
  if (!workspaceId || !profile) return res.status(400).json({ error: "Missing workspaceId or profile" });
  try {
    const existing = await prisma.integrationConnection.findFirst({
      where: { workspaceId, provider: "icp_profile" },
    });
    if (existing) {
      await prisma.integrationConnection.update({
        where: { id: existing.id },
        data: { authData: JSON.stringify(profile), updatedAt: new Date() },
      });
    } else {
      await prisma.integrationConnection.create({
        data: { workspaceId, provider: "icp_profile", status: "active", authData: JSON.stringify(profile) },
      });
    }
    // Fire-and-forget: backfill icpScore/icpGrade on LeadActivitySummary
    scoreWorkspaceLeads(workspaceId).catch(err =>
      console.error("[icp/profile] IqLead scoring failed:", err.message)
    );
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: "Failed to save ICP profile" });
  }
});

// POST /api/icp/score-all
router.post("/score-all", async (req: Request, res: Response) => {
  const { workspaceId, unscoredOnly } = req.body;
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });
  try {
    const conn = await prisma.integrationConnection.findFirst({
      where: { workspaceId, provider: "icp_profile" },
    });
    if (!conn) return res.status(404).json({ error: "No ICP profile found. Save your profile first." });

    const profile = JSON.parse(conn.authData || "{}");
    const where: any = { workspaceId };
    if (unscoredOnly) where.fitScore = null;

    const leads = await prisma.lead.findMany({
      where,
      take: 2000,
      include: { activities: { select: { type: true } } },
    });

    for (const lead of leads) {
      const profileScore = scoreContact(lead, profile);
      const finalScore   = applyActivityDeltas(profileScore, lead.activities);
      await prisma.lead.update({ where: { id: lead.id }, data: { fitScore: finalScore } });
    }

    return res.json({ success: true, scored: leads.length });
  } catch (err: any) {
    return res.status(500).json({ error: "Scoring failed: " + err.message });
  }
});

// GET /api/icp/leads — scored leads with grade
router.get("/leads", async (req: Request, res: Response) => {
  const workspaceId = String(req.query.workspaceId || "");
  if (!workspaceId) return res.status(400).json({ error: "workspaceId required" });
  try {
    const conn = await prisma.integrationConnection.findFirst({
      where: { workspaceId, provider: "icp_profile" },
    });
    const profile = conn ? JSON.parse(conn.authData || "{}") : {};

    const leads = await prisma.lead.findMany({
      where: { workspaceId },
      orderBy: { fitScore: "desc" },
      take: 1000,
    });

    const result = leads.map(l => ({
      id:       l.id,
      fullName: l.fullName || l.email,
      email:    l.email,
      title:    l.title    || "",
      company:  l.company  || "",
      source:   l.source   || "Manual",
      score:    l.fitScore ?? null,
      grade:    deriveGrade(l.fitScore ?? null, profile),
    }));

    return res.json({ leads: result, profile });
  } catch {
    return res.status(500).json({ error: "Failed to load scored leads" });
  }
});

export default router;
