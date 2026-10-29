// ADR 017 4b-10 against a real Postgres + PostgREST: migration 0143's give / take through lib/entitlements/staff-grants.ts.
// Run by the entitlements real-db harness with 0143 applied (sets ENTITLEMENTS_REST); skipped otherwise. No production.
import type http from "node:http";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { giveProduct, staffGrantView, takeProduct, type StaffGrantChange } from "../staff-grants";
import { startRestProxy } from "./real-db";

const REST = process.env.ENTITLEMENTS_REST;
const GIFTED = "00000000-0000-4000-8000-0000000000d1";
const BRAND = "00000000-0000-4000-8000-0000000000d2";
const SOULFUL = "00000000-0000-4000-8000-0000000000f1";   // seeded by the harness; 0118 makes it an all-features account

describe.skipIf(!REST)("staff give / take against a real database (ADR 017 4b-10)", () => {
  let proxy: http.Server;
  let db: SupabaseClient;
  const change = (over: Partial<StaffGrantChange> = {}): StaffGrantChange =>
    ({ accountId: GIFTED, productKey: "social", kind: "use", actor: "ops:owner:e2e", actorRole: "owner", note: "e2e 試用", ...over });
  const live = async (org: string) => {
    const { data, error } = await db.from("organization_entitlements").select("feature_key, source, source_ref, status")
      .eq("organization_id", org).eq("status", "active").order("feature_key");
    if (error) throw new Error(error.message);
    return data ?? [];
  };
  // What the page would send back: the gifts staffGrantView shows for the product.
  const shown = async (org: string, kind: "use" | "resell" = "use") =>
    ((await staffGrantView(org, db)).find((p) => p.key === "social")!)[kind].gifts;
  const take = async (over: Partial<StaffGrantChange> = {}) =>
    takeProduct(change({ ...over, sourceRefs: over.sourceRefs ?? await shown(over.accountId ?? GIFTED, over.kind ?? "use") }), db);
  const audits = async (org: string) => {
    const { data, error } = await db.from("ops_audit_events").select("event_type, target_id, payload").eq("organization_id", org).order("created_at");
    if (error) throw new Error(error.message);
    return data ?? [];
  };

  beforeAll(async () => {
    proxy = await startRestProxy(REST!);
    db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const { error } = await db.from("organizations").insert([
      { id: GIFTED, type: "client", name: "Gifted", slug: "e2e-gifted", kind: "customer", org_level: "group" },
      { id: BRAND, type: "client", name: "Brand", slug: "e2e-brand", kind: "customer", org_level: "company", parent_organization_id: GIFTED },
    ]);
    if (error) throw new Error(error.message);
  });
  afterAll(async () => { proxy?.close(); });

  it("a gift writes one comp row per feature and one audit row; giving again adds nothing", async () => {
    expect(await giveProduct(change(), db)).toBe("given");
    const rows = await live(GIFTED);
    expect(rows.map((r) => r.feature_key)).toEqual(["social.ads", "social.auto-reply", "social.dispatch", "social.meta", "social.rewrite"]);
    expect(new Set(rows.map((r) => `${r.source}|${r.source_ref?.slice(0, 6)}`))).toEqual(new Set(["comp|staff:"]));
    const [audit] = await audits(GIFTED);
    expect(audit).toMatchObject({ event_type: "entitlement.staff_grant", target_id: rows[0].source_ref, payload: { actor: "ops:owner:e2e", note: "e2e 試用", kind: "use" } });
    expect(await giveProduct(change(), db)).toBe("already");
    expect(await audits(GIFTED)).toHaveLength(1);
  });

  it("the licence is its own gift: taking the product back leaves it, and the reverse", async () => {
    expect(await giveProduct(change({ kind: "resell" }), db)).toBe("given");
    const before = await shown(GIFTED);
    expect(await take()).toBe("taken");
    expect((await live(GIFTED)).map((r) => r.feature_key)).toEqual(["social.resell"]);
    expect(await take({ sourceRefs: before })).toBe("nothing_to_take");
    expect(await take({ kind: "resell" })).toBe("taken");
    expect(await live(GIFTED)).toEqual([]);
    expect((await audits(GIFTED)).map((a) => a.event_type)).toEqual(
      ["entitlement.staff_grant", "entitlement.staff_grant", "entitlement.staff_revoke", "entitlement.staff_revoke"]);
  });

  it("taking back ends only this page's rows: a contract row of the same product stays, and is not gifted over", async () => {
    const { error } = await db.from("organization_entitlements").insert(
      { organization_id: GIFTED, product_key: "social", feature_key: "social.ads", source: "contract", source_ref: "sub-e2e" });
    if (error) throw new Error(error.message);
    expect(await giveProduct(change(), db)).toBe("given");
    const ads = (await live(GIFTED)).filter((r) => r.feature_key === "social.ads");
    expect(ads).toEqual([{ feature_key: "social.ads", source: "contract", source_ref: "sub-e2e", status: "active" }]);
    const view = (await staffGrantView(GIFTED, db)).find((p) => p.key === "social")!;
    expect(view).toMatchObject({ use: { staff: 4, other: 1 }, resell: { staff: false, other: false } });
    expect(await take()).toBe("taken");
    expect(await live(GIFTED)).toEqual([{ feature_key: "social.ads", source: "contract", source_ref: "sub-e2e", status: "active" }]);
    await db.from("organization_entitlements").update({ status: "expired" }).eq("organization_id", GIFTED).eq("source_ref", "sub-e2e");
  });

  it("a row that starts later does not count as having the feature now (Codex 2026-10-29 #1)", async () => {
    const { error } = await db.from("organization_entitlements").insert({ organization_id: GIFTED, product_key: "social", feature_key: "social.meta",
      source: "contract", source_ref: "sub-later", starts_at: new Date(Date.now() + 86_400_000).toISOString() });
    if (error) throw new Error(error.message);
    expect(await giveProduct(change(), db)).toBe("given");
    expect((await live(GIFTED)).filter((r) => r.source === "comp").map((r) => r.feature_key)).toContain("social.meta");
    expect(await take()).toBe("taken");
  });

  it("a stale page's untick ends only the gift it showed, never one made since (Codex 2026-10-29 #2)", async () => {
    expect(await giveProduct(change(), db)).toBe("given");
    const pageA = await shown(GIFTED);              // staff A opens the page
    expect(await take()).toBe("taken");             // staff B takes it back ...
    expect(await giveProduct(change(), db)).toBe("given");   // ... and gives it again
    const regift = await shown(GIFTED);
    expect(await take({ sourceRefs: pageA })).toBe("nothing_to_take");   // A unticks on the old page
    expect(await shown(GIFTED)).toEqual(regift);
    expect(await take()).toBe("taken");
  });

  it("refuses non-owner/admin, a brand, and a use gift on an all-features account (whose licence may still be given)", async () => {
    expect(await giveProduct(change({ actorRole: "operator" }), db)).toBe("forbidden");
    expect(await giveProduct(change({ accountId: BRAND }), db)).toBe("not_a_customer_account");
    expect(await giveProduct(change({ accountId: SOULFUL }), db)).toBe("all_features_account");
    expect(await giveProduct(change({ accountId: SOULFUL, kind: "resell" }), db)).toBe("given");
    const view = (await staffGrantView(SOULFUL, db)).find((p) => p.key === "social")!;
    expect(view).toMatchObject({ use: { staff: 0, other: 0 }, resell: { staff: true, other: false } });   // all-features rows are not read
  });
});
