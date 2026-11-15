// The one list of Replicate output hosts (lib/ai/replicate-output.ts): every reader in next-admin and video-workbench asks it.
import { describe, expect, it } from "vitest";
import { MAX_OUTPUT_REDIRECTS, ReplicateOutputError, fetchReplicateOutput, isReplicateOutputUrl } from "../replicate-output";

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

describe("fetchReplicateOutput", () => {
  const redirect = (to: string) => new Response(null, { status: 302, headers: { location: to } });
  it("follows a redirect to another allowed host, by hand", async () => {
    const seen: [string, RequestInit][] = [];
    const res = await fetchReplicateOutput("https://replicate.delivery/a.png", async (u, init) => {
      seen.push([u, init]);
      return u === "https://replicate.delivery/a.png" ? redirect("https://pbxt.replicate.delivery/b.png") : new Response("png");
    });
    expect(await res.text()).toBe("png");
    expect(seen.map(([u]) => u)).toEqual(["https://replicate.delivery/a.png", "https://pbxt.replicate.delivery/b.png"]);
    expect(seen.every(([, init]) => init.redirect === "manual")).toBe(true);
  });
  it("refuses a redirect off the list without fetching it", async () => {
    const seen: string[] = [];
    await expect(fetchReplicateOutput("https://replicate.delivery/a.png", async (u) => (seen.push(u), redirect("http://169.254.169.254/latest/meta-data/"))))
      .rejects.toMatchObject({ code: "output_url_not_allowed" });
    expect(seen).toEqual(["https://replicate.delivery/a.png"]);
  });
  it("refuses a first url off the list and a redirect chain longer than the limit", async () => {
    const seen: string[] = [];
    await expect(fetchReplicateOutput("https://evil.example/a.png", async (u) => (seen.push(u), new Response("x")))).rejects.toBeInstanceOf(ReplicateOutputError);
    expect(seen).toEqual([]);
    let n = 0;
    await expect(fetchReplicateOutput("https://replicate.delivery/0", async () => redirect("https://replicate.delivery/" + ++n)))
      .rejects.toMatchObject({ code: "output_redirects_exceeded" });
    expect(n).toBe(MAX_OUTPUT_REDIRECTS + 1);
  });
});
