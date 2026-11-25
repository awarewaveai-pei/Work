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
  readPending: vi.fn(),
  requestRefresh: vi.fn(),
  proposeSystem: vi.fn(),
  closeProposal: vi.fn(),
  BadInput: class BadInput extends Error {},
  ProposalNotFound: class ProposalNotFound extends Error {},
  writeUserEvent: vi.fn(),
}));
vi.mock("@/lib/systems/store", () => store);

const { default: SystemsPage } = await import("../page");
const { default: BlocksPage } = await import("../blocks/page");
const { setSystemStatus, requestSystemsRefresh, proposeNewSystem, withdrawProposal } = await import("../actions");

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
  store.readPending.mockResolvedValue({ refresh: false, requestedAt: null, proposals: [] });
  store.requestRefresh.mockResolvedValue(undefined);
  store.proposeSystem.mockResolvedValue(undefined);
  store.closeProposal.mockResolvedValue(undefined);
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

describe("overview writes (立即更新 / 新增系統) are owner / admin only", () => {
  const redirectedTo = async (run: () => Promise<void>) => {
    try { await run(); } catch (e) { return String((e as Error).message); }
    return "";
  };
  it("a non-owner is refused and nothing is written", async () => {
    for (const r of ["viewer", "operator"]) {
      role.value = r;
      expect(await redirectedTo(() => requestSystemsRefresh())).toBe("REDIRECT /ops/systems?r=forbidden");
      expect(await redirectedTo(() => proposeNewSystem(form({ name: "新系統", type: "product", purpose: "做事" })))).toBe("REDIRECT /ops/systems?r=forbidden");
    }
    expect(store.requestRefresh).not.toHaveBeenCalled();
    expect(store.proposeSystem).not.toHaveBeenCalled();
  });
  it("an owner queues a refresh once and a proposal is written", async () => {
    role.value = "owner";
    expect(await redirectedTo(() => requestSystemsRefresh())).toBe("REDIRECT /ops/systems?r=refresh_queued");
    expect(store.requestRefresh).toHaveBeenCalledTimes(1);
    store.readPending.mockResolvedValue({ refresh: true, requestedAt: new Date().toISOString(), proposals: [] });
    expect(await redirectedTo(() => requestSystemsRefresh())).toBe("REDIRECT /ops/systems?r=refresh_pending");
    expect(store.requestRefresh).toHaveBeenCalledTimes(1);
    expect(await redirectedTo(() => proposeNewSystem(form({ name: "新系統", type: "product", purpose: "做事" })))).toBe("REDIRECT /ops/systems?r=proposed");
    expect(store.proposeSystem).toHaveBeenCalledTimes(1);
  });
});

describe("撤回待登記 is owner / admin only", () => {
  it("refused for a non-owner, written for an owner", async () => {
    const run = async () => { try { await withdrawProposal(form({ event_key: "user:abc", reason: "重複" })); } catch (e) { return String((e as Error).message); } return ""; };
    role.value = "operator";
    expect(await run()).toBe("REDIRECT /ops/systems?r=forbidden");
    expect(store.closeProposal).not.toHaveBeenCalled();
    role.value = "owner";
    expect(await run()).toBe("REDIRECT /ops/systems?r=withdrawn");
    expect(store.closeProposal).toHaveBeenCalledTimes(1);
  });
});

describe("撤回 error codes and the stale refresh lock", () => {
  it("named store errors map to their own codes", async () => {
    role.value = "owner";
    const run = async () => { try { await withdrawProposal(form({ event_key: "user:abc", reason: "重複" })); } catch (e) { return String((e as Error).message); } return ""; };
    store.closeProposal.mockRejectedValueOnce(new store.ProposalNotFound("x"));
    expect(await run()).toBe("REDIRECT /ops/systems?r=proposal_not_found");
    store.closeProposal.mockRejectedValueOnce(new store.BadInput("x"));
    expect(await run()).toBe("REDIRECT /ops/systems?r=bad_withdraw");
  });
  it("a request unanswered for 15 minutes no longer blocks 立即更新", async () => {
    role.value = "owner";
    store.readPending.mockResolvedValue({ refresh: true, requestedAt: new Date(Date.now() - 16 * 60000).toISOString(), proposals: [] });
    try { await requestSystemsRefresh(); } catch (e) { expect(String((e as Error).message)).toBe("REDIRECT /ops/systems?r=refresh_queued"); }
    expect(store.requestRefresh).toHaveBeenCalledTimes(1);
  });
});

describe("/ops/systems/blocks", () => {
  it("refuses a non-owner without reading anything", async () => {
    role.value = "operator";
    const html = renderToStaticMarkup(await BlocksPage({}));
    expect(html).toContain("只有擁有者或管理員能看");
    expect(store.readDefinitions).not.toHaveBeenCalled();
  });

  it("shows the numbered catalog to an owner even when the system read fails", async () => {
    role.value = "owner";
    store.readDefinitions.mockRejectedValue(new Error("db down"));
    const html = renderToStaticMarkup(await BlocksPage({}));
    expect(html).toContain("讀不到系統進度");
    expect(html).toContain("B-001");
    expect(html).toContain("＋ 新增系統");
  });
});
