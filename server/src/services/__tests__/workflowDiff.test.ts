import { describe, it, expect } from "vitest";
import { computeStructureHash, diffApps } from "../workflowDiffService";

describe("computeStructureHash", () => {
  it("returns a 16-char hex string", () => {
    const hash = computeStructureHash([{ type: "n8n-nodes-base.apollo", name: "Apollo" }]);
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("same nodes → same hash", () => {
    const nodes = [
      { type: "n8n-nodes-base.hubspot", name: "HubSpot" },
      { type: "n8n-nodes-base.apollo",  name: "Apollo"  },
    ];
    expect(computeStructureHash(nodes)).toBe(computeStructureHash(nodes));
  });

  it("is order-independent", () => {
    const a = [{ type: "n8n-nodes-base.hubspot" }, { type: "n8n-nodes-base.apollo" }];
    const b = [{ type: "n8n-nodes-base.apollo"  }, { type: "n8n-nodes-base.hubspot" }];
    expect(computeStructureHash(a)).toBe(computeStructureHash(b));
  });

  it("different nodes → different hash", () => {
    const a = [{ type: "n8n-nodes-base.hubspot" }];
    const b = [{ type: "n8n-nodes-base.slack"   }];
    expect(computeStructureHash(a)).not.toBe(computeStructureHash(b));
  });

  it("empty node list returns a hash", () => {
    const hash = computeStructureHash([]);
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("adding a node changes the hash", () => {
    const before = [{ type: "n8n-nodes-base.hubspot" }];
    const after  = [...before, { type: "n8n-nodes-base.apollo" }];
    expect(computeStructureHash(before)).not.toBe(computeStructureHash(after));
  });
});

describe("diffApps", () => {
  it("returns null when apps are identical", () => {
    expect(diffApps(["HubSpot", "Apollo"], ["Apollo", "HubSpot"])).toBeNull();
  });

  it("reports added apps", () => {
    const summary = diffApps(["HubSpot"], ["HubSpot", "Slack"]);
    expect(summary).toContain("Added: Slack");
  });

  it("reports removed apps", () => {
    const summary = diffApps(["HubSpot", "Slack"], ["HubSpot"]);
    expect(summary).toContain("Removed: Slack");
  });

  it("reports both added and removed", () => {
    const summary = diffApps(["HubSpot", "Slack"], ["HubSpot", "Apollo"]);
    expect(summary).toContain("Added: Apollo");
    expect(summary).toContain("Removed: Slack");
  });

  it("handles empty prev and next", () => {
    expect(diffApps([], [])).toBeNull();
  });

  it("handles empty prev with new apps", () => {
    const summary = diffApps([], ["HubSpot"]);
    expect(summary).toContain("Added: HubSpot");
  });
});
