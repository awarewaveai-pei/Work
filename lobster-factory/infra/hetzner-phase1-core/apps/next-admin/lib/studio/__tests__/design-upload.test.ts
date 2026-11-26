// Codex 2026-11-26 F1: saveDesign to a picked organization must register under that organization, not the default one
// (the pending key is in the picked org's folder, so the register route refused it).
import { afterEach, expect, it, vi } from "vitest";
import { saveDesign } from "../design-upload";

afterEach(() => vi.unstubAllGlobals());

it("registers the upload under the organization it was uploaded to", async () => {
  const bodies: Array<{ url: string; body: Record<string, unknown> }> = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const body = init?.body && typeof init.body === "string" ? JSON.parse(init.body) : {};
    bodies.push({ url, body });
    if (url === "/api/tools/designs/upload-url") return new Response(JSON.stringify({ ok: true, key: "uploads/pending/org-b/x.png", putUrl: "https://r2/put", contentType: "image/png" }));
    if (url === "https://r2/put") return new Response(null, { status: 200 });
    return new Response(JSON.stringify({ ok: true, asset: { id: "a" } }));
  });
  const r = await saveDesign(new Blob(["x"], { type: "image/png" }), { source: "banner" }, { organizationId: "org-b" });
  expect(r.ok).toBe(true);
  expect(bodies.find((b) => b.url === "/api/tools/designs")?.body).toMatchObject({ organizationId: "org-b", source: "banner" });
});
