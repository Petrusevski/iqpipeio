import { describe, it, expect } from "vitest";
import { scoreIqLead, gradeFromScore, type IcpProfile } from "../icpScoringService";

const baseProfile: IcpProfile = {
  targetTitles:          ["head of growth", "vp marketing"],
  excludeSeniority:      ["intern", "junior"],
  targetIndustries:      ["saas", "software"],
  targetCompanyKeywords: ["tech", "platform"],
  hotThreshold:          70,
  warmThreshold:         40,
  weights:               { title: 4, company: 2 },
};

describe("scoreIqLead", () => {
  it("scores high for an exact target title match", () => {
    // "Head of Growth" hits targetTitle (titleScore=100), "Notion" misses industry keywords
    // weighted: (100*4 + 35*2) / 6 = 78 → still "hot" grade
    const score = scoreIqLead("Head of Growth", "Notion", baseProfile);
    expect(score).toBeGreaterThanOrEqual(70);
  });

  it("scores high for C-suite titles", () => {
    const score = scoreIqLead("CEO", "Acme Corp", baseProfile);
    expect(score).toBeGreaterThan(60);
  });

  it("penalises excluded seniority levels", () => {
    const scoreNormal  = scoreIqLead("Manager", "Acme", baseProfile);
    const scoreExcluded = scoreIqLead("Junior Manager", "Acme", baseProfile);
    expect(scoreExcluded).toBeLessThan(scoreNormal);
  });

  it("boosts company score for target industry match", () => {
    const scoreMatch   = scoreIqLead("Manager", "SaaS Platform", baseProfile);
    const scoreNoMatch = scoreIqLead("Manager", "Bakery Inc", baseProfile);
    expect(scoreMatch).toBeGreaterThan(scoreNoMatch);
  });

  it("handles null title and company gracefully", () => {
    const score = scoreIqLead(null, null, baseProfile);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("always returns a score between 0 and 100", () => {
    const extremeProfile: IcpProfile = { hotThreshold: 70, warmThreshold: 40 };
    const score = scoreIqLead("Extreme Title CEO Founder Owner", "SaaS Tech Platform Software", extremeProfile);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("scores vp titles at seniority tier 80", () => {
    const score = scoreIqLead("VP Sales", "Some Company", {});
    expect(score).toBeGreaterThanOrEqual(50);
  });
});

describe("gradeFromScore", () => {
  it("returns hot for score >= hotThreshold", () => {
    expect(gradeFromScore(75, baseProfile)).toBe("hot");
    expect(gradeFromScore(70, baseProfile)).toBe("hot");
  });

  it("returns warm for score >= warmThreshold and < hotThreshold", () => {
    expect(gradeFromScore(55, baseProfile)).toBe("warm");
    expect(gradeFromScore(40, baseProfile)).toBe("warm");
  });

  it("returns cold for score < warmThreshold", () => {
    expect(gradeFromScore(39, baseProfile)).toBe("cold");
    expect(gradeFromScore(0, baseProfile)).toBe("cold");
  });

  it("uses defaults when thresholds not set", () => {
    expect(gradeFromScore(70, {})).toBe("hot");
    expect(gradeFromScore(40, {})).toBe("warm");
    expect(gradeFromScore(39, {})).toBe("cold");
  });
});
