// The workbench's organization picker: a customer gets only its own organization (ADR 018 §2 開門規則 2).
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ ids: [] as unknown[] }));
vi.mock("@/lib/supabase-server", () => {
  const q = { select: () => q, order: () => q, limit: () => q, eq: (c: string, v: unknown) => { if (c === "id") db.ids.push(v); return q; },
    then: (ok: (v: unknown) => unknown) => ok({ data: [], error: null }) };
  return { getSupabaseWriteClient: () => ({ from: () => q }) };
});
import { GET } from "./route";

const ORG = "11111111-1111-4111-8111-111111111111";
const at = "https://video.aware-wave.com/api/video/workbench/bootstrap";
beforeEach(() => { db.ids = []; });

describe("GET /api/video/workbench/bootstrap", () => {
  it("a customer lists only its own organization", async () => {
    expect((await GET(new Request(at, { headers: { "x-ops-user-kind": "client", "x-ops-org-id": ORG } }))).status).toBe(200);
    expect(db.ids).toEqual([ORG]);
  });
  it("staff list every active organization", async () => {
    expect((await GET(new Request(at, { headers: { "x-ops-user-kind": "staff", "x-ops-claims-role": "operator" } }))).status).toBe(200);
    expect(db.ids).toEqual([]);
  });
});
