// A tarot background-batch card is saved to My Designs every time the studio presses 「載入批次結果」; the (job, card)
// pair must add one row, not one per load.
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG = "aaaaaaaa-0000-4000-8000-000000000001";
const JOB = "c8fbba27-61dc-4b2b-b344-3ecb0b89c658";

const db = vi.hoisted(() => ({ rows: [] as Array<{ id: string; organization_id: string; metadata: Record<string, unknown> }>, puts: 0 }));

vi.mock("sharp", () => ({ default: () => ({ metadata: async () => ({ format: "png" }) }) }));
vi.mock("../../../../lib/ops-role", () => ({ resolveOpsRole: () => ({ role: "operator", source: "test" }), canCreateAiImageJob: () => true }));
vi.mock("../../../../lib/tenant-guard", () => ({
  effectiveOrgId: (_req: Request, org: string | null) => org,
  assertOrgAccess: () => undefined,
  resolveTenant: () => ({ userKind: "staff" }),
  OrgAccessError: class extends Error {},
  toOrgAccessResponse: () => new Response(null, { status: 403 }),
}));
vi.mock("../../../../lib/content/r2-delete-guard", () => ({ deleteUnreferencedAsset: vi.fn() }));
vi.mock("../../../../lib/studio/designs-list", () => ({ decodeCursor: vi.fn(), listDesigns: vi.fn() }));
vi.mock("../../../../lib/storage/r2", () => ({
  isR2Configured: () => true,
  buildDesignKey: () => "designs/x.png",
  parseImageDataUrl: () => ({ mime: "image/png", buffer: Buffer.from("png") }),
  putDesignObject: async (key: string) => {
    db.puts++;
    return { ok: true, objectKey: key, publicUrl: `https://r2.test/${key}`, byteSize: 3, checksumSha256: "x" };
  },
}));
vi.mock("../../../../lib/supabase-server", () => ({
  getSupabaseReadClient: () => null,
  getSupabaseWriteClient: () => ({
    from: (table: string) => {
      if (table === "ops_audit_events") return { insert: async () => ({ error: null }) };
      const filters: Array<[string, string]> = [];
      const q = {
        select: () => q,
        eq: (c: string, v: string) => (filters.push([c, v]), q),
        limit: () => q,
        maybeSingle: async () => ({
          data: db.rows.find((r) => filters.every(([c, v]) =>
            c.startsWith("metadata->>") ? String(r.metadata[c.slice(11)]) === v : (r as Record<string, unknown>)[c] === v)) ?? null,
          error: null,
        }),
        insert: (row: { organization_id: string; metadata: Record<string, unknown> }) => {
          const saved = { id: `row-${db.rows.length + 1}`, ...row };
          db.rows.push(saved);
          return { select: () => ({ single: async () => ({ data: saved, error: null }) }) };
        },
      };
      return q;
    },
  }),
}));

import { POST } from "./route";

const save = (extra: Record<string, unknown>) =>
  POST(new Request("http://localhost/api/tools/designs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ image: "data:image/png;base64,cG5n", source: "tarot", organizationId: ORG, cardName: "THE FOOL", ...extra }),
  }));

describe("POST /api/tools/designs batch card", () => {
  beforeEach(() => {
    vi.stubEnv("POD_DESIGNS_ENABLED", "true");
    db.rows = [];
    db.puts = 0;
  });

  it("saves a batch card once per (job, card) and returns the first row on a repeat", async () => {
    const first = await (await save({ batchJobId: JOB, cardIndex: 0 })).json();
    expect(first.ok).toBe(true);
    expect(db.rows[0].metadata).toMatchObject({ batch_job_id: JOB, card_index: "0" });
    const again = await (await save({ batchJobId: JOB, cardIndex: 0 })).json();
    expect(again).toMatchObject({ ok: true, reused: true, asset: { id: first.asset.id } });
    expect(db.rows).toHaveLength(1);
    expect(db.puts).toBe(1);
    await save({ batchJobId: JOB, cardIndex: 1 });
    expect(db.rows).toHaveLength(2);
  });

  it("keeps saving a plain design every time", async () => {
    await save({});
    await save({});
    expect(db.rows).toHaveLength(2);
    expect(db.rows[0].metadata).not.toHaveProperty("batch_job_id");
  });
});
