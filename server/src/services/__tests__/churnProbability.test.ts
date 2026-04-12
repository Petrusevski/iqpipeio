import { describe, it, expect } from "vitest";
import {
  computeAdvanceRates,
  computeWinProbabilities,
  churnFromWinProbability,
  MIN_SAMPLE,
} from "../churnProbabilityService";

describe("churnFromWinProbability", () => {
  it("returns 0 for 100% win probability", () => {
    expect(churnFromWinProbability(1)).toBe(0);
  });

  it("returns 1 for 0% win probability", () => {
    expect(churnFromWinProbability(0)).toBe(1);
  });

  it("returns 0.5 for 50% win probability", () => {
    expect(churnFromWinProbability(0.5)).toBe(0.5);
  });

  it("rounds to 3 decimal places", () => {
    const result = churnFromWinProbability(0.333333);
    expect(result.toString().split(".")[1]?.length ?? 0).toBeLessThanOrEqual(3);
  });
});

describe("computeAdvanceRates", () => {
  it("uses workspace data when sample >= MIN_SAMPLE", () => {
    const stageCounts = {
      imported:  100,
      enriched:  80,
      contacted: 50,
      engaged:   20,
      replied:   10,
      meeting:   5,
      won:       2,
    };
    const rates = computeAdvanceRates(stageCounts);
    // imported → enriched advance rate = 80/100 = 0.8
    expect(rates["imported"]).toBeCloseTo(0.8, 2);
  });

  it("falls back to prior when sample < MIN_SAMPLE", () => {
    const stageCounts = { imported: 3, enriched: 2 };
    const rates = computeAdvanceRates(stageCounts);
    // Only 3 imported — below MIN_SAMPLE, should use prior
    expect(rates["imported"]).toBeGreaterThan(0);
    expect(rates["imported"]).toBeLessThan(1);
  });

  it("advance rate is capped at 1.0", () => {
    const stageCounts = {
      imported: 100, enriched: 150,  // enriched > imported (data anomaly)
    };
    const rates = computeAdvanceRates(stageCounts);
    expect(rates["imported"]).toBeLessThanOrEqual(1);
  });

  it("sets won rate to 1", () => {
    const rates = computeAdvanceRates({ won: 5 });
    expect(rates["won"]).toBe(1);
  });
});

describe("computeWinProbabilities", () => {
  it("won stage has probability 1", () => {
    const advanceRates = {
      imported: 0.8, enriched: 0.6, contacted: 0.3,
      engaged: 0.3, replied: 0.2, meeting: 0.4, won: 1,
    };
    const probs = computeWinProbabilities(advanceRates);
    expect(probs["won"]).toBe(1);
  });

  it("earlier stages have lower win probability than later ones", () => {
    const advanceRates = {
      imported: 0.5, enriched: 0.5, contacted: 0.5,
      engaged: 0.5, replied: 0.5, meeting: 0.5, won: 1,
    };
    const probs = computeWinProbabilities(advanceRates);
    expect(probs["imported"]).toBeLessThan(probs["enriched"]!);
    expect(probs["enriched"]!).toBeLessThan(probs["contacted"]!);
    expect(probs["replied"]!).toBeLessThan(probs["meeting"]!);
  });

  it("all win probabilities are between 0 and 1", () => {
    const advanceRates = {
      imported: 0.1, enriched: 0.2, contacted: 0.3,
      engaged: 0.4, replied: 0.5, meeting: 0.6, won: 1,
    };
    const probs = computeWinProbabilities(advanceRates);
    for (const [, v] of Object.entries(probs)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
