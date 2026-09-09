import { describe, expect, it } from "vitest";
import { evaluateReleaseGate } from "../release-gate";

const base = { candidateAssetId: "asset-1", candidateChecksum: "sha-a", requiredKinds: ["technical", "caption"] as const };
const report = (kind: "technical" | "caption", status: "passed" | "warned" | "failed" = "passed", checksum = "sha-a") => ({ id: `${kind}-1`, kind, status, candidateAssetId: "asset-1", candidateChecksum: checksum, profileId: "default", profileVersion: "1" });

describe("release gate", () => {
  it("approves only when every required kind matches the candidate", () => {
    expect(evaluateReleaseGate({ ...base, reports: [report("technical"), report("caption")] }).ok).toBe(true);
    expect(evaluateReleaseGate({ ...base, reports: [report("technical")] }).code).toBe("missing_qa");
  });
  it("blocks stale, failed, and duplicate evidence", () => {
    expect(evaluateReleaseGate({ ...base, reports: [report("technical", "passed", "old"), report("caption")] }).code).toBe("stale_qa");
    expect(evaluateReleaseGate({ ...base, reports: [report("technical", "failed"), report("caption")] }).code).toBe("failed_qa");
    expect(evaluateReleaseGate({ ...base, reports: [report("technical", "warned"), report("caption")] }).code).toBe("failed_qa");
    expect(evaluateReleaseGate({ ...base, reports: [report("technical"), report("technical"), report("caption")] }).code).toBe("duplicate_kind");
  });
});
