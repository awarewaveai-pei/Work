/**
 * `/api/content/sites` GET 的 active 預設值測試（2026-08-26）。
 *
 * 為什麼測這一條而不是測某個畫面：`active` 過濾原本散在消費端 —— `ScriptForge` 濾了、
 * `ContentStudio` 沒濾，於是三個已停用的死站仍出現在主要內容工具的下拉選單裡。規則搬到
 * 這條 route 的預設之後，「誰看得到停用站」只剩一個判斷點，所以測這個判斷點就等於測全部
 * 消費端。不變量：**不帶參數的呼叫者永遠拿不到 inactive 的站。**
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { getSupabaseWriteClient } = vi.hoisted(() => ({ getSupabaseWriteClient: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient }));
vi.mock("@/lib/ops-role", () => ({
  resolveOpsRole: () => ({ role: "operator", source: "claims" }),
  canCreateAiImageJob: () => true,
}));

import { GET } from "../route";

const ROWS = [
  { id: "live-1", name: "活站", url: "https://live.example", color: "#111", active: true,
    note: null, created_at: "2026-01-01", token: "t1", username: "u1", content_defaults: null, organization_id: null },
  { id: "dead-1", name: "死站", url: "https://dead.example", color: "#222", active: false,
    note: null, created_at: "2026-02-01", token: "t2", username: "u2", content_defaults: null, organization_id: null },
];

/** 記錄 .eq() 是否被呼叫，並照它實際過濾 —— 只斷言呼叫而不過濾，會讓「參數傳錯值」測不出來。 */
function mockSupabase() {
  const eqCalls: Array<[string, unknown]> = [];
  getSupabaseWriteClient.mockReturnValue({
    from(table: string) {
      if (table === "organizations") {
        return { select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) };
      }
      let rows = ROWS;
      const builder = {
        select: () => builder,
        eq(col: string, val: unknown) {
          eqCalls.push([col, val]);
          rows = rows.filter((r) => (r as unknown as Record<string, unknown>)[col] === val);
          return builder;
        },
        order: () => Promise.resolve({ data: rows, error: null }),
      };
      return builder;
    },
  });
  return eqCalls;
}

const call = async (qs = "") => {
  const res = await GET(new Request(`http://localhost/api/content/sites${qs}`, {
    headers: { "x-ops-user-kind": "staff" },
  }));
  return (await res.json()) as { ok: boolean; sites: Array<{ id: string }> };
};

describe("GET /api/content/sites — active 預設", () => {
  beforeEach(() => { getSupabaseWriteClient.mockReset(); });

  it("不帶參數 → 只回 active 的站（fail-safe 預設）", async () => {
    const eqCalls = mockSupabase();
    const body = await call();
    expect(eqCalls).toContainEqual(["active", true]);
    expect(body.sites.map((s) => s.id)).toEqual(["live-1"]);
  });

  it("?includeInactive=1 → 連停用的站一起回（站別管理頁明示 opt-in）", async () => {
    const eqCalls = mockSupabase();
    const body = await call("?includeInactive=1");
    expect(eqCalls).not.toContainEqual(["active", true]);
    expect(body.sites.map((s) => s.id)).toEqual(["live-1", "dead-1"]);
  });

  it("includeInactive 只認 \"1\"：其他值一律走安全的那一邊", async () => {
    for (const qs of ["?includeInactive=true", "?includeInactive=0", "?includeInactive=", "?includeinactive=1"]) {
      const eqCalls = mockSupabase();
      const body = await call(qs);
      expect(eqCalls, `${qs} 應仍套用 active 過濾`).toContainEqual(["active", true]);
      expect(body.sites.map((s) => s.id), `${qs} 應只剩活站`).toEqual(["live-1"]);
    }
  });
});
