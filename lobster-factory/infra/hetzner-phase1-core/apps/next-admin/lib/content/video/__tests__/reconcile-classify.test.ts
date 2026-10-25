/**
 * reconcile 的分類正確性測試。
 *
 * 釘住兩件事：
 *  1. **順序**：存在性檢查必須在「判定為孤兒」之前。舊版先 `skippedLegacy++` 再查，於是
 *     「舊格式但早就在畫廊裡」的影片被永久計成 skipped（實測 EU prod 就是這個形狀）。
 *  2. **窮盡**：checked === recorded + alreadyRecorded + orphanUnattributable + noPrimary
 *     + probeFailed + recordFailed。少一條 continue 分支就會被這條抓到。
 *
 * `videoObjectKey` / `pickPrimaryOutput` / `parseOrgPrefixFromDir` 刻意用真的（它們是 SSOT，
 * 假掉就等於沒測到「兩個呼叫端導出同一個 object_key」這件事）；只把 recordVideoAsset 換掉。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { recordVideoAsset, getSupabaseWriteClient } = vi.hoisted(() => ({
  recordVideoAsset: vi.fn(),
  getSupabaseWriteClient: vi.fn(),
}));

vi.mock("../../blocks/video-pipeline", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../blocks/video-pipeline")>()),
  recordVideoAsset,
}));
vi.mock("../../../supabase-server", () => ({ getSupabaseWriteClient }));

const ORG = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const ORG_PREFIX = ORG.replace(/-/g, "").slice(0, 8); // aaaaaaaa
const BASE = "https://cdn.example";

/** 記錄每次 media_assets 探測用到的 filter，讓測試能斷言 scope。 */
let probes: Array<Record<string, string>> = [];

function fakeSupabase(existingKeys: Set<string>, opts: { probeError?: boolean; orgs?: string[] } = {}) {
  return {
    from(table: string) {
      if (table === "organizations") {
        // reconcile asks per prefix for the uuid range [<pfx>-0000…, <pfx>-ffff…] (uuid order = lowercase hex order)
        const range: { lo: string; hi: string } = { lo: "", hi: "" };
        const oq = {
          gte(_c: string, v: string) { range.lo = v; return oq; },
          lte(_c: string, v: string) { range.hi = v; return oq; },
          limit: (n: number) => Promise.resolve({
            data: (opts.orgs ?? [ORG]).filter((id) => id >= range.lo && id <= range.hi).slice(0, n).map((id) => ({ id })), error: null,
          }),
        };
        return { select: () => oq };
      }
      const filters: Record<string, string> = {};
      const q: Record<string, unknown> = {
        eq(col: string, val: string) { filters[col] = val; return q; },
        limit() {
          probes.push({ ...filters });
          if (opts.probeError) return Promise.resolve({ data: null, error: { message: "boom" } });
          const hit = existingKeys.has(filters.object_key);
          return Promise.resolve({ data: hit ? [{ id: "row" }] : [], error: null });
        },
      };
      return { select: () => q };
    },
  };
}

function mockR2(keys: string[]) {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true,
    json: async () => ({ result: keys.map((key) => ({ key })), result_info: { is_truncated: false } }),
  })));
}

/** 分類必須窮盡且互斥 —— 每個案例都跑這條。 */
function expectExhaustive(r: Awaited<ReturnType<typeof import("../reconcile")["reconcileVideos"]>>) {
  const sum = r.recorded + r.alreadyRecorded + r.orphanUnattributable
    + r.noPrimary + r.probeFailed + r.recordFailed;
  expect(sum).toBe(r.checked);
  expect(r.orphanUnattributable).toBe(
    r.unattributableByMissingPrefix + r.unattributableByUnresolvedPrefix,
  );
}

async function run() {
  const { reconcileVideos } = await import("../reconcile");
  return reconcileVideos();
}

describe("reconcileVideos — 分類", () => {
  beforeEach(() => {
    probes = [];
    recordVideoAsset.mockReset().mockResolvedValue(undefined);
    process.env.R2_API_TOKEN = "t";
    process.env.R2_ACCOUNT_ID = "a";
    process.env.R2_VIDEO_PUBLIC_BASE = BASE;
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("舊格式但已在畫廊 → alreadyRecorded，不是孤兒（本次修正的核心回歸測試）", async () => {
    mockR2(["video/舊標題直接當目錄/16x9.mp4"]);
    getSupabaseWriteClient.mockReturnValue(
      fakeSupabase(new Set(["video/%E8%88%8A%E6%A8%99%E9%A1%8C%E7%9B%B4%E6%8E%A5%E7%95%B6%E7%9B%AE%E9%8C%84/16x9.mp4"])),
    );
    const r = await run();
    expect(r.alreadyRecorded).toBe(1);
    expect(r.orphanUnattributable).toBe(0); // 舊版這裡會是 1
    expect(recordVideoAsset).not.toHaveBeenCalled();
    expectExhaustive(r);
  });

  it("舊格式且不在畫廊 → orphanUnattributable（唯一該告警的數字）", async () => {
    mockR2(["video/沒人認領的舊影片/4x5.mp4"]);
    getSupabaseWriteClient.mockReturnValue(fakeSupabase(new Set()));
    const r = await run();
    expect(r.orphanUnattributable).toBe(1);
    expect(r.unattributableByMissingPrefix).toBe(1);
    expect(recordVideoAsset).not.toHaveBeenCalled(); // 擁有者未知 → 絕不猜
    expectExhaustive(r);
  });

  it("擁有者未知時的探測不帶 org；擁有者已知時必須帶 org", async () => {
    mockR2([`video/${ORG_PREFIX}_0123456789_新片/16x9.mp4`, "video/舊片/16x9.mp4"]);
    getSupabaseWriteClient.mockReturnValue(fakeSupabase(new Set()));
    await run();
    const scoped = probes.filter((p) => p.organization_id === ORG);
    const unscoped = probes.filter((p) => p.organization_id === undefined);
    expect(scoped).toHaveLength(1);   // 新格式 → 帶 org（不可被別租戶同名 key 擋掉）
    expect(unscoped).toHaveLength(1); // 舊格式 → 不帶 org（純分類，永不寫入）
  });

  it("新格式 + 擁有者可解 + 不在畫廊 → 補記", async () => {
    mockR2([`video/${ORG_PREFIX}_0123456789_新片/16x9.mp4`]);
    getSupabaseWriteClient.mockReturnValue(fakeSupabase(new Set()));
    const r = await run();
    expect(r.recorded).toBe(1);
    expect(recordVideoAsset).toHaveBeenCalledTimes(1);
    expect(recordVideoAsset.mock.calls[0][0]).toMatchObject({ organizationId: ORG });
    expectExhaustive(r);
  });

  it("前綴解得出但對不到 org → unattributableByUnresolvedPrefix，不猜", async () => {
    mockR2(["video/ffffffff_0123456789_他人的/16x9.mp4"]);
    getSupabaseWriteClient.mockReturnValue(fakeSupabase(new Set()));
    const r = await run();
    expect(r.unattributableByUnresolvedPrefix).toBe(1);
    expect(recordVideoAsset).not.toHaveBeenCalled();
    expectExhaustive(r);
  });

  it("兩個 org 共用前綴（撞碼）→ unattributableByUnresolvedPrefix，絕不記到其中一個", async () => {
    const TWIN = "aaaaaaaa-0000-4000-8000-000000000001";   // same first segment as ORG
    mockR2([`video/${ORG_PREFIX}_0123456789_撞碼片/16x9.mp4`]);
    getSupabaseWriteClient.mockReturnValue(fakeSupabase(new Set(), { orgs: [TWIN, ORG] }));
    const r = await run();
    expect(r.unattributableByUnresolvedPrefix).toBe(1);
    expect(recordVideoAsset).not.toHaveBeenCalled();
    expectExhaustive(r);
  });

  it("探測查詢失敗 → 進 probeFailed，不得偽裝成任何「知道」的分類", async () => {
    mockR2(["video/某片/16x9.mp4"]);
    getSupabaseWriteClient.mockReturnValue(fakeSupabase(new Set(), { probeError: true }));
    const r = await run();
    expect(r.probeFailed).toBe(1);
    expect(r.alreadyRecorded).toBe(0);
    expect(r.orphanUnattributable).toBe(0);
    expectExhaustive(r);
  });

  it("補記拋出 → 進 recordFailed，不算成功也不消失", async () => {
    mockR2([`video/${ORG_PREFIX}_0123456789_新片/16x9.mp4`]);
    getSupabaseWriteClient.mockReturnValue(fakeSupabase(new Set()));
    recordVideoAsset.mockRejectedValue(new Error("db down"));
    const r = await run();
    expect(r.recordFailed).toBe(1);
    expect(r.recorded).toBe(0);
    expectExhaustive(r);
  });

  it("EU prod 現況重現：1 個已入庫 + 1 個真孤兒（舊版會回 skippedLegacy=2）", async () => {
    mockR2([
      "video/三個習慣_創業人也能一覺到天亮/16x9.mp4",
      "video/三個習慣_創業人也能一覺到天亮/9x16.mp4",
      "video/蒙古旅遊___熱情分享型主持人稿/4x5.mp4",
    ]);
    getSupabaseWriteClient.mockReturnValue(
      fakeSupabase(new Set([`video/${encodeURIComponent("三個習慣_創業人也能一覺到天亮")}/16x9.mp4`])),
    );
    const r = await run();
    expect(r.checked).toBe(2);
    expect(r.alreadyRecorded).toBe(1);
    expect(r.orphanUnattributable).toBe(1);
    expectExhaustive(r);
  });
});
