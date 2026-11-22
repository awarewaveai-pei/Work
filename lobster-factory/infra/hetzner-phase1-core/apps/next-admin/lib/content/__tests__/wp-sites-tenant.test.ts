/**
 * resolveWpSite / listAccessibleWpSites 的租戶邊界測試。
 *
 * 這是 7 條 route 共用的唯一入口（video/embed-to-wp、content/wp-post 會**寫入**客戶站），
 * 所以規則錯了是 7 個地方一起錯。測 seam 本身而不是逐條 route，正是收斂成 seam 的理由。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { getSupabaseWriteClient } = vi.hoisted(() => ({ getSupabaseWriteClient: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient }));

import { resolveWpSite, listAccessibleWpSites } from "../wp-sites";
import { OrgAccessError, orgIdentity } from "@/lib/tenant-guard";

const ORG_A = "aaaaaaaa-0000-4000-8000-00000000000a";
const ORG_B = "bbbbbbbb-0000-4000-8000-00000000000b";

const ROWS = [
  { id: "site-a", name: "A 客戶", url: "https://a.example", token: "ta", color: "#111", username: "ua", organization_id: ORG_A },
  { id: "site-b", name: "B 客戶", url: "https://b.example", token: "tb", color: "#222", username: "ub", organization_id: ORG_B },
  { id: "site-x", name: "無主站", url: "https://x.example", token: "tx", color: "#333", username: "ux", organization_id: null },
];

function mockSites(rows = ROWS) {
  getSupabaseWriteClient.mockReturnValue({
    from: () => ({ select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: rows, error: null }) }) }) }),
  });
}

const req = (h: Record<string, string>) => new Request("http://localhost/x", { headers: h });
const staff = req({ "x-ops-user-kind": "staff" });
const clientA = req({ "x-ops-user-kind": "client", "x-ops-org-id": ORG_A });
const clientNoOrg = req({ "x-ops-user-kind": "client" });

describe("resolveWpSite — 租戶邊界", () => {
  beforeEach(() => { getSupabaseWriteClient.mockReset(); mockSites(); });

  it("staff 指定任一站 → 通過（full access）", async () => {
    const r = await resolveWpSite(staff, "site-b");
    expect(r?.site.id).toBe("site-b");
    expect(r?.authHeader).toContain("Basic ");
  });

  it("client 指定自己的站 → 通過", async () => {
    const r = await resolveWpSite(clientA, "site-a");
    expect(r?.site.id).toBe("site-a");
  });

  it("client 指定別人的站 → 拋 OrgAccessError（呼叫端轉 403）", async () => {
    await expect(resolveWpSite(clientA, "site-b")).rejects.toBeInstanceOf(OrgAccessError);
  });

  it("排程以客戶身分（orgIdentity）只能發到該客戶自己的站", async () => {
    expect((await resolveWpSite(orgIdentity(ORG_A), "site-a"))?.site.id).toBe("site-a");
    await expect(resolveWpSite(orgIdentity(ORG_A), "site-b")).rejects.toBeInstanceOf(OrgAccessError);
    await expect(resolveWpSite(orgIdentity(ORG_A), "site-x")).rejects.toBeInstanceOf(OrgAccessError);
  });

  it("client 指定無主站（organization_id 為 null）→ 擋下，fail-closed", async () => {
    await expect(resolveWpSite(clientA, "site-x")).rejects.toBeInstanceOf(OrgAccessError);
  });

  it("K6 未指定 siteId：staff → null，不再取第一個（員工的「第一個」＝某個別人的客戶）", async () => {
    expect(await resolveWpSite(staff, "")).toBeNull();
    expect(await resolveWpSite(staff, undefined)).toBeNull();
    expect(await resolveWpSite(staff, "   ")).toBeNull();
  });

  it("K6 未指定 siteId：單站客戶自動選自己的站（ADR 020），不是清單第一個", async () => {
    const clientB = req({ "x-ops-user-kind": "client", "x-ops-org-id": ORG_B });
    expect((await resolveWpSite(clientB, ""))?.site.id).toBe("site-b"); // 不是 site-a
    expect((await resolveWpSite(orgIdentity(ORG_A), null))?.site.id).toBe("site-a"); // 排程身分同規則
  });

  it("K6 未指定 siteId：多站客戶 → null（不猜哪一站）", async () => {
    mockSites([...ROWS, { id: "site-a2", name: "A 第二站", url: "https://a2.example", token: "ta2", color: "#444", username: "ua2", organization_id: ORG_A }]);
    expect(await resolveWpSite(clientA, "")).toBeNull();
    expect((await resolveWpSite(clientA, "site-a2"))?.site.id).toBe("site-a2"); // 指定仍照常
  });

  it("client 無 org 綁定 + 未指定 siteId → null（拿不到任何站）", async () => {
    expect(await resolveWpSite(clientNoOrg, "")).toBeNull();
  });

  it("siteId 不存在 → null（呼叫端回 404），與 403 分開", async () => {
    expect(await resolveWpSite(staff, "does-not-exist")).toBeNull();
  });

  it("回傳的 site 物件帶 organizationId，且 token 不混進 site", async () => {
    const r = await resolveWpSite(staff, "site-a");
    expect(r?.site.organizationId).toBe(ORG_A);
    expect(JSON.stringify(r?.site)).not.toContain("ta");
  });
});

describe("listAccessibleWpSites — 多站清單", () => {
  beforeEach(() => { getSupabaseWriteClient.mockReset(); mockSites(); });

  it("staff 取得全部（含無主站）", async () => {
    const { sites } = await listAccessibleWpSites(staff);
    expect(sites.map(s => s.id)).toEqual(["site-a", "site-b", "site-x"]);
  });

  it("client 只取得自己的，且 tokens/usernames 同步收斂", async () => {
    const { sites, tokens, usernames } = await listAccessibleWpSites(clientA);
    expect(sites.map(s => s.id)).toEqual(["site-a"]);
    expect(Object.keys(tokens)).toEqual(["site-a"]);   // 別人的 token 不得外流
    expect(Object.keys(usernames)).toEqual(["site-a"]);
  });
});
