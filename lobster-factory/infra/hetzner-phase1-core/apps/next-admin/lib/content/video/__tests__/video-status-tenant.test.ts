/**
 * /api/video/status 的租戶邊界測試。
 *
 * 為何測 route handler 本身而不是抽一個純函式出來測：這道閘的正確性有一半在**位置**
 * （必須早於第一個回傳資料的分支），純函式測不到位置。直接跑 handler 才會踩到真實的
 * 分支順序 —— 2026-08-26 原始 finding 指的位置（recordVideoAsset 之前）就是被這一點推翻的。
 *
 * job-store 被 mock：本檔驗授權決策，不驗 Supabase。
 *
 * T20: the handler moved from GET to POST (it finalizes the job -- media_assets insert + R2
 * cleanup -- on the done/error branches, which a GET must never risk). Calls below now go
 * through POST; a dedicated test confirms GET is no longer exported (Next.js then answers a raw
 * GET to this route 405 on its own -- outside what a handler-level unit test can exercise).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { getJob, finishJob } = vi.hoisted(() => ({ getJob: vi.fn(), finishJob: vi.fn() }));
vi.mock("@/lib/content/video/job-store", () => ({ getJob, finishJob }));

import { NextRequest } from "next/server";

// 明顯虛構的測試用 uuid：刻意不使用任何 prod org 衍生值。
const ORG_A = "aaaaaaaa-0000-4000-8000-00000000000a";
const ORG_B = "bbbbbbbb-0000-4000-8000-00000000000b";

/** middleware 注入的身分標頭（middleware.ts:118-122）。client 無 org 時該標頭不存在。 */
function req(headers: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/api/video/status?jobId=j1", { method: "POST", headers });
}
const staff = { "x-ops-claims-role": "operator", "x-ops-user-kind": "staff" };
const clientA = { "x-ops-claims-role": "operator", "x-ops-user-kind": "client", "x-ops-org-id": ORG_A };

async function POST(r: NextRequest) {
  const mod = await import("@/app/api/video/status/route");
  return mod.POST(r);
}

const doneJob = (organizationId?: string) => ({
  id: "j1",
  status: "done" as const,
  organizationId,
  video: { outputs: { "16x9": "https://cdn.example/video/x/16x9.mp4" }, out_dir: "x" },
  title: "機密標題",
  createdAt: Date.now(),
});

describe("/api/video/status — 租戶邊界", () => {
  beforeEach(() => { getJob.mockReset(); finishJob.mockReset(); });

  it("staff 讀任一 org 的 job → 200（staff = full access，tenant-guard.ts:92）", async () => {
    getJob.mockResolvedValue(doneJob(ORG_B));
    const res = await POST(req(staff));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, status: "done", title: "機密標題" });
  });

  it("client 讀自己 org 的 job → 200", async () => {
    getJob.mockResolvedValue(doneJob(ORG_A));
    const res = await POST(req(clientA));
    expect(res.status).toBe(200);
  });

  it("client 讀別的 org 的 job → 403，且**不得**洩漏 video/title", async () => {
    getJob.mockResolvedValue(doneJob(ORG_B));
    const res = await POST(req(clientA));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false });
    // 位置回歸測試：閘若補在 recordVideoAsset 之前（原始 finding 的位置），
    // done 分支會先 return，這兩個斷言就會失敗。
    expect(JSON.stringify(body)).not.toContain("機密標題");
    expect(JSON.stringify(body)).not.toContain("16x9.mp4");
  });

  it("client 讀自己**失敗**的 job（無 recordParams）→ 200 並看得到錯誤原因", async () => {
    // 這是 naive patch（assertOrgAccess(req, job.recordParams?.organizationId)）的回歸測試：
    // prepare 失敗時 generate/route.ts:142/:168 不寫 recordParams，那種寫法會永久 403。
    getJob.mockResolvedValue({
      id: "j1", status: "error", organizationId: ORG_A,
      error: "prepare 例外：Anthropic 429", statusCode: 500, createdAt: Date.now(),
      recordParams: undefined,
    });
    const res = await POST(req(clientA));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, status: "error", error: "prepare 例外：Anthropic 429" });
  });

  it("organizationId 為 null 的舊列：staff 放行、client 擋下（fail-closed）", async () => {
    getJob.mockResolvedValue(doneJob(undefined));
    expect((await POST(req(staff))).status).toBe(200);
    getJob.mockResolvedValue(doneJob(undefined));
    expect((await POST(req(clientA))).status).toBe(403);
  });

  it("viewer 在角色閘就被擋，租戶閘之前（getJob 不該被呼叫）", async () => {
    const res = await POST(req({ "x-ops-claims-role": "viewer", "x-ops-user-kind": "staff" }));
    expect(res.status).toBe(403);
    expect(getJob).not.toHaveBeenCalled();
  });

  it("job 不存在 → 404（租戶閘不改變這個既有行為）", async () => {
    getJob.mockResolvedValue(undefined);
    const res = await POST(req(staff));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ error: "job_not_found" });
  });

  it("T20: no GET is exported -- Next.js answers a raw GET to this route 405 on its own", async () => {
    const mod = await import("@/app/api/video/status/route");
    expect((mod as Record<string, unknown>).GET).toBeUndefined();
  });
});
