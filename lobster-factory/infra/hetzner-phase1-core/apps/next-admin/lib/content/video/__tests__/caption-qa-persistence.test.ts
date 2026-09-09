import { afterEach, describe, expect, it } from "vitest";
import { persistAutomaticCaptionQa } from "../caption-qa-persistence";

describe("persistAutomaticCaptionQa", () => {
  const previous = process.env.MEDIA_PRODUCTION_PERSISTENCE_ENABLED;
  afterEach(() => { process.env.MEDIA_PRODUCTION_PERSISTENCE_ENABLED = previous; });
  it("does not write evidence while the persistence gate is off", async () => {
    process.env.MEDIA_PRODUCTION_PERSISTENCE_ENABLED = "false";
    await expect(persistAutomaticCaptionQa({ organizationId: "org", candidateAssetId: "asset", candidateChecksum: "a".repeat(64), transcript: {} })).resolves.toBeNull();
  });
  it("rejects a non-SHA256 candidate identity before database access", async () => {
    process.env.MEDIA_PRODUCTION_PERSISTENCE_ENABLED = "true";
    await expect(persistAutomaticCaptionQa({ organizationId: "org", candidateAssetId: "asset", candidateChecksum: "short", transcript: {} })).resolves.toBeNull();
  });
});
