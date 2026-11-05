// video.aware-wave.com theme link: token deny paths fail closed; only gated saved overrides are emitted.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const saved = vi.hoisted(() => ({ tokens: {} as Record<string, string>, down: false }));
vi.mock("@/lib/theme/store", () => ({ loadThemeConfig: async () => { if (saved.down) throw Error("theme_read_timeout"); return { tokens: saved.tokens, layout: null }; } }));
import { GET } from "./route";

const get = (headers: Record<string, string> = { authorization: "Bearer right-token" }) =>
  GET(new Request("http://next-admin:3000/api/internal/theme/css", { headers }));

beforeEach(() => { vi.stubEnv("VW_INTERNAL_TOKEN", "right-token"); saved.tokens = { "--body-bg": "#112233" }; saved.down = false; });
afterEach(() => vi.unstubAllEnvs());

describe("/api/internal/theme/css", () => {
  it("VW_INTERNAL_TOKEN unset, no bearer or a wrong one: 401 and no theme", async () => {
    vi.stubEnv("VW_INTERNAL_TOKEN", "");
    expect((await get()).status).toBe(401);
    vi.stubEnv("VW_INTERNAL_TOKEN", "right-token");
    for (const h of [{}, { authorization: "Bearer wrong" }]) {
      const res = await get(h);
      expect(res.status).toBe(401);
      expect(await res.text()).not.toContain("#112233");
    }
  });

  it("emits saved overrides as :root, dropping unknown names and unsafe values", async () => {
    saved.tokens = { "--body-bg": "#112233", "--not-a-token": "#000", "--text-primary": "red;}body{x:y" };
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/css");
    expect(await res.text()).toBe(":root{--body-bg:#112233;}");
  });

  it("DB read failure: 503, not an empty :root that would wipe the caller's copy", async () => {
    saved.down = true;
    expect((await get()).status).toBe(503);
  });
});
