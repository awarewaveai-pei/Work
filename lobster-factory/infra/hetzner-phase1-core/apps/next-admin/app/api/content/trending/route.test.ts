// T20: type=suggest and type=questions each fall back to a paid aiChat call when their free
// source (Google Autocomplete / prefix-expand) returns nothing -- a GET must never risk spending
// money (SameSite=Lax cookie + <img>/<script> can force a same-site page to send an authenticated
// GET; the CSRF guard only covers non-GET). GET now serves only type=trending (pure external/DB
// reads, no paid call); suggest/questions moved to POST. global.fetch is stubbed to fail fast so
// the Google-Suggest branch resolves to [] deterministically instead of hitting the real network
// (fetchGoogleSuggest catches and returns [] on any fetch rejection).
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ops-role", () => ({
  resolveOpsRole: () => ({ role: "operator" }),
  canCreateAiImageJob: () => true,
}));

const runTrending = vi.hoisted(() => vi.fn(async () => [{ title: "t", traffic: "1", category: "c", relatedQueries: [] }]));
const aiChat = vi.hoisted(() => vi.fn(async () => '["ai suggestion"]'));
vi.mock("@/lib/content/trending-sources", () => ({
  runTrending,
  aiChat,
  parseJsonStrings: (text: string) => JSON.parse(text) as string[],
  buildDbSearchBlocks: () => [],
}));

vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => null }));

const { GET, POST } = await import("./route");

const originalFetch = global.fetch;
beforeEach(() => {
  runTrending.mockClear();
  aiChat.mockClear();
  global.fetch = vi.fn(async () => { throw new Error("no network in this test"); }) as unknown as typeof fetch;
});
afterAll(() => {
  global.fetch = originalFetch;
});

function get(qs: string) {
  return GET(new Request(`http://localhost/api/content/trending?${qs}`));
}
function post(qs: string) {
  return POST(new Request(`http://localhost/api/content/trending?${qs}`, { method: "POST" }));
}

describe("GET /api/content/trending -- read-only surface", () => {
  it("type=trending: 200, runs the pure-read trending sources", async () => {
    const res = await get("type=trending&geo=TW");
    expect(res.status).toBe(200);
    expect(runTrending).toHaveBeenCalled();
    await expect(res.json()).resolves.toMatchObject({ ok: true });
  });

  it("type=suggest: 405, never reaches the paid aiChat fallback", async () => {
    const res = await get("type=suggest&q=hello");
    expect(res.status).toBe(405);
    expect(aiChat).not.toHaveBeenCalled();
  });

  it("type=questions: 405, never reaches the paid aiChat fallback", async () => {
    const res = await get("type=questions&q=hello");
    expect(res.status).toBe(405);
    expect(aiChat).not.toHaveBeenCalled();
  });
});

describe("POST /api/content/trending -- suggest/questions (may spend money)", () => {
  it("type=suggest: Google Suggest empty -> falls back to the paid aiChat", async () => {
    const res = await post("type=suggest&q=hello");
    expect(res.status).toBe(200);
    expect(aiChat).toHaveBeenCalledTimes(1);
    await expect(res.json()).resolves.toMatchObject({ ok: true, suggestions: ["ai suggestion"] });
  });

  it("type=questions: Google prefix-expand empty -> falls back to the paid aiChat", async () => {
    const res = await post("type=questions&q=hello");
    expect(res.status).toBe(200);
    expect(aiChat).toHaveBeenCalledTimes(1);
  });

  it("type=trending: still works via POST too", async () => {
    const res = await post("type=trending&geo=TW");
    expect(res.status).toBe(200);
    expect(runTrending).toHaveBeenCalled();
  });

  it("missing q for suggest/questions: 400, no aiChat call", async () => {
    const res = await post("type=suggest");
    expect(res.status).toBe(400);
    expect(aiChat).not.toHaveBeenCalled();
  });
});
