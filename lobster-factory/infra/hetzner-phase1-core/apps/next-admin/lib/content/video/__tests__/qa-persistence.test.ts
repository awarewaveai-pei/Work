// No evidence is not a pass: a render whose outputs carry no worker QA reports writes nothing (it used to be stored as
// "passed" -- the 2026-09-10 merge 91fdfe31a had dropped the reports from video-service).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const insert = vi.fn();
const db = {
  from: () => ({
    select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }) }) }),
    insert: (row: { status: string }) => { insert(row); return { select: () => ({ single: async () => ({ data: { id: "r1", status: row.status }, error: null }) }) }; },
  }),
};
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => db }));
const { persistAutomaticTechnicalQa } = await import("../qa-persistence");

const base = { organizationId: "org", candidateAssetId: "asset", candidateChecksum: "a".repeat(64), outputs: { "16x9": "https://cdn/x.mp4" } };
const meta = (qa: Record<string, unknown>) => ({ "16x9": { width: 1920, height: 1080, ...qa } });

describe("persistAutomaticTechnicalQa", () => {
  const previous = process.env.MEDIA_PRODUCTION_PERSISTENCE_ENABLED;
  beforeEach(() => { process.env.MEDIA_PRODUCTION_PERSISTENCE_ENABLED = "true"; insert.mockReset(); });
  afterEach(() => { process.env.MEDIA_PRODUCTION_PERSISTENCE_ENABLED = previous; });

  it.each([
    ["no output meta", undefined],
    ["no reports", meta({})],
    ["technical only", meta({ technical_qa: { status: "passed" } })],
    ["unknown status", meta({ technical_qa: { status: "ok" }, signal_qa: { status: "passed" } })],
  ])("%s: records nothing", async (_name, outputMeta) => {
    await expect(persistAutomaticTechnicalQa({ ...base, outputMeta })).resolves.toBeNull();
    expect(insert).not.toHaveBeenCalled();
  });

  it("both reports present: records the worst status", async () => {
    const r = await persistAutomaticTechnicalQa({ ...base, outputMeta: meta({ technical_qa: { status: "passed" }, signal_qa: { status: "warned" } }) });
    expect(r).toEqual({ id: "r1", status: "warned" });
    expect(insert).toHaveBeenCalledTimes(1);
  });
});
