// The one list of Replicate output hosts (lib/ai/replicate-output.ts): every reader in next-admin and video-workbench asks it.
import { describe, expect, it } from "vitest";
import { isReplicateOutputUrl } from "../replicate-output";

describe("isReplicateOutputUrl", () => {
  it("accepts Replicate's delivery hosts and its pinned R2 output bucket, https only", () => {
    for (const u of ["https://replicate.delivery/a.png", "https://pbxt.replicate.delivery/a.png",
      "https://ai-gateway-outputs.0d37909e38d3e99c29fa2cd343ac421a.r2.cloudflarestorage.com/provider-outputs/a/b?X-Amz-Signature=x"])
      expect(isReplicateOutputUrl(u), u).toBe(true);
  });
  it("refuses any other host, another bucket account, http, a look-alike or a non-string", () => {
    for (const u of ["https://ai-gateway-outputs.deadbeef.r2.cloudflarestorage.com/x", "https://evil.r2.cloudflarestorage.com/x",
      "http://replicate.delivery/a", "https://replicate.delivery.evil.com/a", "https://xreplicate.delivery/a",
      "https://replicate.delivery:8443/a", "data:image/png;base64,AA", undefined, null])
      expect(isReplicateOutputUrl(u), String(u)).toBe(false);
  });
});
