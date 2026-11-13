// Card P6.16: a theme save tells video-workbench to drop its cached copy; a failed notice never fails the save.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({ saved: [] as unknown[] }));
vi.mock("../../../lib/theme/store", () => ({
  getThemeConfig: async () => ({ tokens: {}, layout: null }),
  saveThemeConfig: async (tokens: unknown) => { store.saved.push(tokens); },
  revalidateThemeCache: () => {},
}));
vi.mock("../../../lib/ops-role", () => ({ resolveOpsRole: () => ({ role: "owner" }), canWriteTenantConfig: () => true }));
import { POST } from "./route";

const save = () => POST(new Request("http://next-admin:3000/api/theme", { method: "POST", body: JSON.stringify({ tokens: { "--body-bg": "#123456" } }) }));
const fetchMock = vi.fn();

beforeEach(() => {
  store.saved = [];
  vi.stubEnv("VW_SERVICE_URL", "http://video-workbench:4178/");
  vi.stubEnv("VW_INTERNAL_TOKEN", "right-token");
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("POST /api/theme -> video-workbench notice", () => {
  it("after the save, POSTs the invalidate route with the internal bearer", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const res = await save();
    expect(res.status).toBe(200);
    expect(store.saved).toEqual([{ "--body-bg": "#123456" }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://video-workbench:4178/api/internal/theme/invalidate");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer right-token");
  });

  it("video down or answering 404 (not deployed yet): the save still succeeds", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const answer of [() => Promise.reject(new Error("ECONNREFUSED")), () => Promise.resolve(new Response("Not found", { status: 404 }))]) {
      fetchMock.mockImplementationOnce(answer);
      const res = await save();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, updated: 1 });
    }
    expect(store.saved).toHaveLength(2);
  });
});
