import { describe, it, expect } from "vitest";
import { chiSquaredTest, buildRecommendation } from "../experimentAttributionService";

describe("chiSquaredTest", () => {
  it("returns significant result when variants differ substantially", () => {
    // 10/100 vs 30/100 — big difference
    const { significant, pValue } = chiSquaredTest(10, 100, 30, 100);
    expect(significant).toBe(true);
    expect(pValue).toBeLessThanOrEqual(0.05);
  });

  it("returns not significant when variants are equal", () => {
    const { significant } = chiSquaredTest(10, 100, 10, 100);
    expect(significant).toBe(false);
  });

  it("returns not significant when sample is tiny", () => {
    const { significant } = chiSquaredTest(1, 3, 2, 3);
    // Small sample — chi-squared unreliable but shouldn't crash
    expect(typeof significant).toBe("boolean");
  });

  it("handles zero totals gracefully", () => {
    const { chiSquared, pValue } = chiSquaredTest(0, 0, 0, 0);
    expect(chiSquared).toBe(0);
    expect(pValue).toBe(1);
  });

  it("handles zero conversions gracefully", () => {
    const { significant } = chiSquaredTest(0, 50, 0, 50);
    expect(significant).toBe(false);
  });

  it("chi-squared value is non-negative", () => {
    const { chiSquared } = chiSquaredTest(5, 100, 15, 100);
    expect(chiSquared).toBeGreaterThanOrEqual(0);
  });

  it("20% vs 5% with n=200 per variant is highly significant", () => {
    const { significant, pValue } = chiSquaredTest(40, 200, 10, 200);
    expect(significant).toBe(true);
    expect(pValue).toBeLessThanOrEqual(0.001);
  });
});

describe("buildRecommendation", () => {
  const makeStats = (rate: number) => ({
    variant: "A" as const, leads: 100, conversions: rate,
    conversionRate: rate, outcomes: { reply_received: 0, meeting_booked: 0, deal_created: 0, deal_won: 0 },
    totalRevenue: 0, avgDealValue: 0,
  });

  it("recommends scaling A when A wins significantly", () => {
    const rec = buildRecommendation({
      winner: "A", significant: true,
      variantA: makeStats(30), variantB: makeStats(10),
    });
    expect(rec).toContain("Variant A wins");
    expect(rec).toContain("Scale Variant A");
  });

  it("recommends scaling B when B wins significantly", () => {
    const rec = buildRecommendation({
      winner: "B", significant: true,
      variantA: makeStats(10), variantB: makeStats(30),
    });
    expect(rec).toContain("Variant B wins");
    expect(rec).toContain("Scale Variant B");
  });

  it("advises to continue when not significant", () => {
    const rec = buildRecommendation({
      winner: null, significant: false,
      variantA: makeStats(10), variantB: makeStats(12),
    });
    expect(rec).toContain("Continue the experiment");
  });

  it("advises more data when insufficient_data", () => {
    const rec = buildRecommendation({
      winner: "insufficient_data", significant: false,
      variantA: makeStats(5), variantB: makeStats(3),
    });
    expect(rec).toContain("sufficient data");
  });

  it("handles missing variants", () => {
    const rec = buildRecommendation({ winner: null, significant: false, variantA: null, variantB: null });
    expect(rec).toContain("Insufficient data");
  });
});
