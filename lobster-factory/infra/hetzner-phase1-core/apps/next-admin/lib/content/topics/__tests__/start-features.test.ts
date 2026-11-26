// K30b: a topic starts only when its organization can use every paid feature its making asks (make.ts topicFeatures),
// checked before a daily slot or any money is used, on both starts: 「核准並開始」 (409 naming the feature) and the
// schedule (back to proposed). Real grantFor / runForOrg / can() over an in-memory entitlement store (enforce mode);
// the check writes no usage row.
import { generateKeyPairSync } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EntitlementRecord, GateDependencies, GateEvent } from "@/lib/entitlements/can";
import { PRODUCTS } from "@/lib/portal/products";
import type { Topic } from "../store";

const ORG = "11111111-1111-4111-8111-111111111111";
const pair = generateKeyPairSync("ed25519");
const productOf = new Map(PRODUCTS.flatMap((p) => p.features.map((f) => [f.feature_key, p.key] as const)));
const g = vi.hoisted(() => ({ owned: new Set<string>(), audit: [] as GateEvent[], started: [] as string[] }));
const gate: GateDependencies = {
  permit: async () => ({
    store: {
      async findActiveEntitlement({ organizationId, productKey, featureKey }): Promise<EntitlementRecord | null> {
        if (organizationId !== ORG || !g.owned.has(featureKey) || productOf.get(featureKey) !== productKey) return null;
        return { id: `ent-${featureKey}`, organizationId, productKey, featureKey, source: "contract", sourceRef: "c1",
          startsAt: 0, endsAt: null, status: "active", limits: {} };
      },
      getCreditBalance: async () => 0,
    },
    key: { kid: "k1", privateKey: pair.privateKey },
  }),
  publicKeys: () => ({ k1: pair.publicKey }),
  mode: () => "enforce",
  audit: async (e) => { g.audit.push(e); },
  debit: async () => { throw new Error("no debit expected"); },
  hold: async () => { throw new Error("no hold expected"); },
  settleHold: async () => 0,
};
vi.mock("@/lib/entitlements/runtime", () => ({ runtimeGateDependencies: () => gate }));
vi.mock("@/lib/entitlements/subject", async (orig) => ({
  ...(await orig<typeof import("@/lib/entitlements/subject")>()),
  resolveSubject: async () => ({ orgId: ORG, kind: "customer" }),
}));
// the route's own single withFeature is not what this card tests: pass straight to its work
vi.mock("@/lib/entitlements/grant", async (orig) => ({
  ...(await orig<typeof import("@/lib/entitlements/grant")>()),
  withFeature: () => (_req: Request, run: () => Promise<Response>) => run(),
}));
vi.mock("@/lib/content/brand-voice-store", () => ({
  loadSiteBrand: async (_sb: unknown, siteId: string) => ({ siteId, organizationId: ORG, name: "s", defaults: {} }),
}));
vi.mock("@/lib/social/store", async (orig) => ({
  ...(await orig<typeof import("@/lib/social/store")>()),
  listAccounts: async () => [{ id: "a-yt", platform: "youtube", status: "connected" }],
}));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => {} }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => ({}) }));
vi.mock("@/lib/schedules/store", () => ({
  listSchedules: async () => [{ jobKey: "content_pipeline", enabled: true }], storedDailyLimit: async () => 5, storedPerTopicCap: async () => null,
}));
const row = vi.hoisted(() => ({ topic: null as unknown }));
vi.mock("@/lib/content/topics/store", async (orig) => ({
  ...(await orig<typeof import("@/lib/content/topics/store")>()),
  topicById: async () => row.topic,
  orgTimeZone: async () => "Asia/Taipei",
  startTopic: async (_sb: unknown, t: Topic) => { g.started.push(t.id); return { ...t, status: "generating" }; },
}));

const { POST } = await import("@/app/api/content/topics/[id]/start/route");
const { topicDeps } = await import("../make");
const { tickTopics } = await import("../tick");

const topic = (formats: Topic["formats"]): Topic => ({
  id: "t1", organization_id: ORG, site_id: "s1", title: "題目", keyword: "k", angle: null, source: "manual", source_ref: {},
  month: "2026-11-01", scheduled_for: null, formats, status: "approved", review: null, artifacts: {},
  version: 2, last_error: null, started_on: null, created_by: "staff:x", created_at: "2026-11-26T00:00:00Z", updated_at: "2026-11-26T00:00:00Z",
});
const press = (t: Topic) => {
  row.topic = t;
  return POST(new Request("http://localhost/api/content/topics/t1/start", {
    method: "POST", headers: { "content-type": "application/json", "x-ops-claims-role": "operator", "x-ops-user-kind": "staff" },
    body: JSON.stringify({ version: 2 }),
  }), { params: Promise.resolve({ id: "t1" }) });
};
/** The schedule over one due topic: what it moved, and to what. */
async function schedule(t: Topic) {
  const moves: Array<{ to: string; last_error?: string | null }> = [];
  const d = { ...topicDeps({} as never, ORG, "schedule:content_pipeline", { capTwd: null, maker: "schedule" as const }),
    due: async () => [t], inStatus: async () => [],
    move: async (cur: Topic, to: Topic["status"], patch?: { last_error?: string | null }) => { moves.push({ to, last_error: patch?.last_error }); return { ...cur, status: to }; },
    make: async () => { throw new Error("making must not run"); } };
  await tickTopics(d, { cap: 5 });
  return moves;
}
const usage = () => g.audit.filter((e) => e.event === "entitlement.usage");

beforeEach(() => { g.owned = new Set(); g.audit = []; g.started = []; });

describe("K30b: every feature a topic uses is checked before it starts", () => {
  it("video only, without content.syndicate: the button answers 409 naming it, the schedule returns it, nothing spent", async () => {
    g.owned = new Set(["video.script"]);
    const res = await press(topic(["video"]));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("content.syndicate");
    expect(await schedule(topic(["video"]))).toEqual([{ to: "proposed", last_error: expect.stringContaining("content.syndicate") }]);
    expect(g.started).toEqual([]);
    expect(usage()).toEqual([]);
  });

  it("article + social + video, without video.script: the same", async () => {
    g.owned = new Set(["content.article", "content.syndicate"]);
    const res = await press(topic(["article", "social", "video"]));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("video.script");
    expect(await schedule(topic(["article", "social", "video"]))).toEqual([{ to: "proposed", last_error: expect.stringContaining("video.script") }]);
    expect(g.started).toEqual([]);
    expect(usage()).toEqual([]);
  });

  it("every feature owned: the button starts it and the check wrote no usage row", async () => {
    g.owned = new Set(["content.article", "content.syndicate", "video.script"]);
    const res = await press(topic(["article", "social", "video"]));
    expect(res.status).toBe(200);
    expect(g.started).toEqual(["t1"]);
    expect(usage()).toEqual([]);   // as before K30b: only a paid seam (Grant.recordUse) records use
  });
});
