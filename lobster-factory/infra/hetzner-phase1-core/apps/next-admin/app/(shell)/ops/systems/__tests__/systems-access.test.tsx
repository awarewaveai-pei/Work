import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const role = vi.hoisted(() => ({ value: "viewer" }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-ops-claims-role": role.value }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); } }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => ({}) }));
const SYS = "11111111-1111-4111-8111-111111111111";
const store = vi.hoisted(() => ({
  readDefinitions: vi.fn(),
  readImportRuns: vi.fn(),
  readRecentEvents: vi.fn(),
  readProjectionInput: vi.fn(),
  writeUserEvent: vi.fn(),
}));
vi.mock("@/lib/systems/store", () => store);

const { default: SystemsPage } = await import("../page");
const { setSystemStatus } = await import("../actions");

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

beforeEach(() => {
  vi.clearAllMocks();
  store.readDefinitions.mockResolvedValue({ systems: [{ id: SYS, slug: "outbound-os" }], phases: [], features: [] });
  store.readImportRuns.mockResolvedValue([]);
  store.readProjectionInput.mockResolvedValue({ events: [], history: [], capped: false });
  store.writeUserEvent.mockResolvedValue(undefined);
});

describe("/ops/systems is owner / admin only", () => {
  it("the page refuses a non-owner without reading anything", async () => {
    for (const r of ["viewer", "operator"]) {
      role.value = r;
      const html = renderToStaticMarkup(await SystemsPage({}));
      expect(html).toContain("只有擁有者或管理員能看");
      expect(store.readDefinitions).not.toHaveBeenCalled();
    }
    role.value = "owner";
    await SystemsPage({});
    expect(store.readDefinitions).toHaveBeenCalled();
  });

  it("the server action refuses a non-owner and writes no event", async () => {
    role.value = "operator";
    await expect(setSystemStatus(form({ system_id: SYS, slug: "outbound-os", status: "paused" }))).rejects.toThrow(/r=forbidden/);
    expect(store.writeUserEvent).not.toHaveBeenCalled();
    role.value = "owner";
    await expect(setSystemStatus(form({ system_id: SYS, slug: "outbound-os", status: "paused" }))).rejects.toThrow(/r=saved/);
    expect(store.writeUserEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: "status_change", payload: expect.objectContaining({ status: "paused" }) }));
  });
});
