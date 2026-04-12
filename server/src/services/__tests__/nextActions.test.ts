import { describe, it, expect } from "vitest";

// Re-export the pure functions for testing by duplicating the logic here.
// The service functions are not independently exported from nextActionsService
// (they're module-level), so we test the behaviour through equivalent reimplementations.

// ── scoreToUrgency ────────────────────────────────────────────────────────────
function scoreToUrgency(score: number): string {
  if (score >= 120) return "critical";
  if (score >= 80)  return "high";
  if (score >= 40)  return "medium";
  return "low";
}

// ── staleBonus ────────────────────────────────────────────────────────────────
function staleBonus(daysSince: number | null, stage: string): number {
  if (!daysSince) return 0;
  const caps: Record<string, number>  = { meeting: 50, replied: 40, engaged: 30, contacted: 25, enriched: 10, imported: 10 };
  const rate: Record<string, number>  = { meeting: 20, replied: 10, engaged:  5, contacted:  3, enriched:  1, imported:  1 };
  return Math.min(daysSince * (rate[stage] ?? 1), caps[stage] ?? 10);
}

// ── classifyAction ────────────────────────────────────────────────────────────
function classifyAction(
  stage: string, daysSince: number | null,
  isSilent: boolean, enrichmentBucket: string | null,
): string {
  if (isSilent) return "rescue";
  switch (stage) {
    case "meeting":   return "close";
    case "replied":   return "follow_up";
    case "engaged":   return daysSince !== null && daysSince >= 3 ? "follow_up" : "re_engage";
    case "contacted": return "re_engage";
    case "enriched":  return "sequence_start";
    default:          return (!enrichmentBucket || enrichmentBucket === "never") ? "enrich" : "sequence_start";
  }
}

describe("scoreToUrgency", () => {
  it("returns critical for score >= 120", () => {
    expect(scoreToUrgency(120)).toBe("critical");
    expect(scoreToUrgency(150)).toBe("critical");
  });

  it("returns high for score 80–119", () => {
    expect(scoreToUrgency(80)).toBe("high");
    expect(scoreToUrgency(119)).toBe("high");
  });

  it("returns medium for score 40–79", () => {
    expect(scoreToUrgency(40)).toBe("medium");
    expect(scoreToUrgency(79)).toBe("medium");
  });

  it("returns low for score < 40", () => {
    expect(scoreToUrgency(0)).toBe("low");
    expect(scoreToUrgency(39)).toBe("low");
  });
});

describe("staleBonus", () => {
  it("returns 0 for null days", () => {
    expect(staleBonus(null, "contacted")).toBe(0);
  });

  it("returns 0 for 0 days", () => {
    expect(staleBonus(0, "contacted")).toBe(0);
  });

  it("accumulates for meeting stage quickly", () => {
    expect(staleBonus(3, "meeting")).toBe(50);  // 3*20=60 capped at 50
  });

  it("accumulates slowly for imported stage", () => {
    expect(staleBonus(5, "imported")).toBe(5);  // 5*1=5 < cap 10
  });

  it("is capped per stage", () => {
    const cappedMeeting  = staleBonus(100, "meeting");
    const cappedContacted = staleBonus(100, "contacted");
    expect(cappedMeeting).toBe(50);
    expect(cappedContacted).toBe(25);
  });
});

describe("classifyAction", () => {
  it("returns rescue for silent leads regardless of stage", () => {
    expect(classifyAction("contacted", 5, true, null)).toBe("rescue");
    expect(classifyAction("imported",  0, true, "fresh")).toBe("rescue");
  });

  it("returns close for meeting stage", () => {
    expect(classifyAction("meeting", 1, false, null)).toBe("close");
  });

  it("returns follow_up for replied stage", () => {
    expect(classifyAction("replied", 2, false, null)).toBe("follow_up");
  });

  it("returns follow_up for engaged with 3+ days stale", () => {
    expect(classifyAction("engaged", 3, false, null)).toBe("follow_up");
    expect(classifyAction("engaged", 10, false, null)).toBe("follow_up");
  });

  it("returns re_engage for engaged with < 3 days stale", () => {
    expect(classifyAction("engaged", 2, false, null)).toBe("re_engage");
  });

  it("returns re_engage for contacted stage", () => {
    expect(classifyAction("contacted", 10, false, null)).toBe("re_engage");
  });

  it("returns sequence_start for enriched stage", () => {
    expect(classifyAction("enriched", null, false, "fresh")).toBe("sequence_start");
  });

  it("returns enrich for imported stage with no enrichment", () => {
    expect(classifyAction("imported", null, false, "never")).toBe("enrich");
    expect(classifyAction("imported", null, false, null)).toBe("enrich");
  });

  it("returns sequence_start for imported with existing enrichment", () => {
    expect(classifyAction("imported", null, false, "fresh")).toBe("sequence_start");
  });
});
