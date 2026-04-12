import { describe, it, expect } from "vitest";
import { percentile, computePercentileRank, buildBand } from "../benchmarkService";

describe("percentile", () => {
  it("returns 0 for empty array", () => {
    expect(percentile([], 50)).toBe(0);
  });

  it("returns the only element for single-element array", () => {
    expect(percentile([42], 50)).toBe(42);
    expect(percentile([42], 0)).toBe(42);
    expect(percentile([42], 100)).toBe(42);
  });

  it("returns correct median for odd-length sorted array", () => {
    expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3);
  });

  it("returns correct median for even-length sorted array", () => {
    expect(percentile([1, 2, 3, 4], 50)).toBe(2.5);
  });

  it("returns min for p0", () => {
    expect(percentile([1, 5, 10, 20], 0)).toBe(1);
  });

  it("returns max for p100", () => {
    expect(percentile([1, 5, 10, 20], 100)).toBe(20);
  });

  it("correctly computes p25 and p75", () => {
    const data = [2, 4, 6, 8, 10, 12, 14, 16];
    expect(percentile(data, 25)).toBeLessThan(percentile(data, 75));
  });
});

describe("computePercentileRank", () => {
  it("returns 50 for empty distribution", () => {
    expect(computePercentileRank(5, [])).toBe(50);
  });

  it("returns 0 for the minimum value", () => {
    expect(computePercentileRank(1, [1, 2, 3, 4, 5])).toBe(0);
  });

  it("returns 80 for value above 80% of data", () => {
    // 4 values below 5 out of 5 total → 80th percentile
    expect(computePercentileRank(5, [1, 2, 3, 4, 5])).toBe(80);
  });

  it("higher values get higher percentile ranks", () => {
    const data = [1, 2, 3, 4, 5].sort((a, b) => a - b);
    expect(computePercentileRank(3, data)).toBeGreaterThan(computePercentileRank(2, data));
  });
});

describe("buildBand", () => {
  it("returns zeros for empty array", () => {
    const band = buildBand([]);
    expect(band.p25).toBe(0);
    expect(band.median).toBe(0);
    expect(band.p75).toBe(0);
    expect(band.sample).toBe(0);
  });

  it("p25 <= median <= p75", () => {
    const band = buildBand([1, 3, 5, 7, 9, 11, 13]);
    expect(band.p25).toBeLessThanOrEqual(band.median);
    expect(band.median).toBeLessThanOrEqual(band.p75);
  });

  it("sample count matches input length", () => {
    const band = buildBand([1, 2, 3, 4, 5]);
    expect(band.sample).toBe(5);
  });

  it("all three percentiles are equal for constant array", () => {
    const band = buildBand([5, 5, 5, 5, 5]);
    expect(band.p25).toBe(5);
    expect(band.median).toBe(5);
    expect(band.p75).toBe(5);
  });

  it("sorts input before computing (order-independent)", () => {
    const bandUnsorted = buildBand([9, 1, 5, 3, 7]);
    const bandSorted   = buildBand([1, 3, 5, 7, 9]);
    expect(bandUnsorted).toEqual(bandSorted);
  });
});
