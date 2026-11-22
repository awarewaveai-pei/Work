// Card SF-J: creating a client site writes metadata.host_slug, is idempotent on siteId, refuses a second site on the
// same host code, and never pushes an environment the steps moved on back to "pending".
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSiteFlow, parseCreateSiteBody } from "../create-site";

type Row = Record<string, unknown>;

function fakeDb(seed: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = { ...seed };
  let n = 0;
  const from = (table: string) => {
    const rows = (tables[table] ??= []);
    const filters: ((r: Row) => boolean)[] = [];
    let patch: Row | null = null;
    let inserted: Row | null = null;
    const val = (r: Row, c: string) => (c.includes("->>") ? (r[c.split("->>")[0]] as Row | undefined)?.[c.split("->>")[1]] : r[c]);
    const matching = () => rows.filter((r) => filters.every((f) => f(r)));
    const q: Record<string, unknown> = {
      select: () => q,
      eq: (c: string, v: unknown) => (filters.push((r) => val(r, c) === v), q),
      neq: (c: string, v: unknown) => (filters.push((r) => val(r, c) !== v), q),
      order: () => q,
      limit: () => q,
      maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
      single: async () => ({ data: inserted ?? matching()[0] ?? null, error: null }),
      insert: (row: Row) => {
        inserted = { id: row.id ?? `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`, status: "active", created_at: "2026-11-22T00:00:00Z", metadata: {}, ...row };
        rows.push(inserted);
        return q;
      },
      update: (p: Row) => ((patch = p), q),
      then: (resolve: (v: { data: Row[]; error: null }) => void) => {
        if (patch) for (const r of matching()) Object.assign(r, patch);
        resolve({ data: matching(), error: null });
      },
    };
    return q;
  };
  return { db: { from } as unknown as SupabaseClient, tables };
}

const SITE_ID = "6f1e2d3c-4b5a-4978-8a6b-5c4d3e2f1a0b";
const input = { siteId: SITE_ID, clientName: "算命站", domain: "oracle.aware-wave.com", locale: "zh-TW" as const, packs: ["base" as const] };

describe("createSiteFlow", () => {
  it("writes the environment with host_slug, base_url and the production type", async () => {
    const { db, tables } = fakeDb();
    const r = await createSiteFlow(db, input);
    expect(r.ok).toBe(true);
    const env = tables.environments[0];
    expect(env).toMatchObject({ environment_type: "production", hosting_provider: "ks-aw-01-docker", base_url: "https://oracle.aware-wave.com", status: "pending" });
    expect((env.metadata as Row).host_slug).toBe("oracle-aware-wave-com");
    expect((env.metadata as Row).ingress).toBe("host-vhost");
  });

  it("pressing twice (same siteId) makes one site, one environment, and keeps a moved-on status", async () => {
    const { db, tables } = fakeDb();
    await createSiteFlow(db, input);
    tables.environments[0].status = "ready";
    const again = await createSiteFlow(db, input);
    expect(again.ok).toBe(true);
    expect(tables.sites).toHaveLength(1);
    expect(tables.environments).toHaveLength(1);
    expect(tables.environments[0].status).toBe("ready");
  });

  it("another site on the same host code is refused", async () => {
    const { db } = fakeDb({ environments: [{ id: "e1", site_id: "11111111-1111-4111-8111-111111111111", status: "ready", metadata: { host_slug: "oracle-aware-wave-com" } }] });
    expect(await createSiteFlow(db, input)).toMatchObject({ ok: false, error: "host_slug_taken" });
  });

  it("an unknown siteId never adopts a client whose slug already exists (another client's)", async () => {
    const { db, tables } = fakeDb({ organizations: [{ id: "o1", slug: "oracle-aware-wave-com", name: "舊客戶", type: "client", status: "active", created_at: "x", metadata: {} }] });
    expect(await createSiteFlow(db, input)).toMatchObject({ ok: false, error: "slug_taken" });
    expect(tables.sites ?? []).toHaveLength(0);
  });

  it("a known siteId sent with another domain is refused before anything is written", async () => {
    const { db, tables } = fakeDb();
    await createSiteFlow(db, input);
    const orgs = tables.organizations.length;
    expect(await createSiteFlow(db, { ...input, domain: "other.aware-wave.com" })).toMatchObject({ ok: false, error: "idempotency_key_reused" });
    expect(tables.organizations).toHaveLength(orgs);
  });
});

describe("parseCreateSiteBody", () => {
  const good = { ...input, packs: ["ecommerce"] };
  it("always includes the base pack", () => {
    const p = parseCreateSiteBody(good);
    expect(p.ok && p.input.packs).toEqual(["base", "ecommerce"]);
  });
  it.each([
    [{ ...good, domain: "no spaces here" }, "invalid_domain"],
    [{ ...good, clientName: " " }, "invalid_name"],
    [{ ...good, siteId: "x" }, "invalid_site_id"],
    [{ ...good, packs: ["nope"] }, "invalid_pack"],
    [{ ...good, locale: "fr" }, "invalid_locale"],
  ])("refuses %#", (body, code) => {
    expect(parseCreateSiteBody(body)).toMatchObject({ ok: false, error: code });
  });
});
