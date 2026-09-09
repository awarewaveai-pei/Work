import { describe, expect, it } from "vitest";
import { automaticQaIssuance, hasAutomaticQaIssuance } from "../qa-issuance";

describe("server QA issuance", () => {
  it("accepts only the current server marker for the exact capability", () => {
    const issuance = automaticQaIssuance("video.qa.render");
    expect(hasAutomaticQaIssuance({ issuance }, "video.qa.render")).toBe(true);
    expect(hasAutomaticQaIssuance({ issuance }, "video.qa.caption")).toBe(false);
  });

  it("rejects browser-shaped and legacy report JSON", () => {
    expect(hasAutomaticQaIssuance({ status: "passed" }, "video.qa.render")).toBe(false);
    expect(hasAutomaticQaIssuance({ issuance: { issuer: "browser", boundaryVersion: "2.0.0", capabilityId: "video.qa.render" } }, "video.qa.render")).toBe(false);
  });
});
