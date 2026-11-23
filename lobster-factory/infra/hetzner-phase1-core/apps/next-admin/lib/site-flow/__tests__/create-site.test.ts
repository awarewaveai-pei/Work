// Card SF-J: creating a client site writes metadata.host_slug, is idempotent on siteId, refuses a second site on the
// same host code, and never pushes an environment the steps moved on back to "pending".
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSiteFlow, parseCreateSiteBody } from "../create-site";

type Row = Record<string, unknown>;

/** In-memory tables with the database's unique keys (0001 slug/id/workspace, 0176 one live env per site+type, 0179 one
 *  live env per host_slug unless `hostSlugIndex: false`); a violated key answers 23505 like PostgREST. Every call
 *  yields once, so two flows run with Promise.all interleave at each await like two requests. */
function fakeDb(seed: Record<string, Row[]> = {}, opts: { hostSlugIndex?: boolean } = {}) {
  const tables: Record<string, Row[]> = { ...seed };
  let n = 0;
  const live = (r: Row) => r.status !== "archived";
  const slugOf = (r: Row) => (r.metadata as Row | undefined)?.host_slug;
  const KEYS: Record<string, ((a: Row, b: Row) => boolean)[]> = {
    organizations: [(a, b) => a.id === b.id, (a, b) => a.slug === b.slug],
    workspaces: [(a, b) => a.organization_id === b.organization_id && a.slug === b.slug],
    sites: [(a, b) => a.id === b.id],
    projects: [(a, b) => a.id === b.id],
    environments: [
      (a, b) => live(a) && live(b) && a.site_id === b.site_id && a.environment_type === b.environment_type,
      ...(opts.hostSlugIndex === false ? [] : [(a: Row, b: Row) => live(a) && live(b) && slugOf(a) != null && slugOf(a) === slugOf(b)]),
    ],
  };
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const from = (table: string) => {
    const rows = (tables[table] ??= []);
    const filters: ((r: Row) => boolean)[] = [];
    let patch: Row | null = null;
    let inserted: Row | null = null;
    let insertError: { code: string; message: string } | null = null;
    let del = false;
    const val = (r: Row, c: string) => (c.includes("->>") ? (r[c.split("->>")[0]] as Row | undefined)?.[c.split("->>")[1]] : r[c]);
    const matching = () => rows.filter((r) => filters.every((f) => f(r)));
    const q: Record<string, unknown> = {
      select: () => q,
      eq: (c: string, v: unknown) => (filters.push((r) => val(r, c) === v), q),
      neq: (c: string, v: unknown) => (filters.push((r) => val(r, c) !== v), q),
      order: () => q,
      limit: () => q,
      maybeSingle: async () => (await tick(), { data: matching()[0] ?? null, error: null }),
      single: async () => (await tick(), insertError ? { data: null, error: insertError } : { data: inserted ?? matching()[0] ?? null, error: null }),
      insert: (row: Row) => {
        const r = { id: row.id ?? `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`, status: table === "environments" ? "pending" : "active", created_at: "2026-11-22T00:00:00Z", updated_at: "2026-11-22T00:00:00.000Z", metadata: {}, ...row };
        if ((KEYS[table] ?? []).some((same) => rows.some((o) => same(o, r)))) insertError = { code: "23505", message: "duplicate key value violates unique constraint" };
        else { inserted = r; rows.push(r); }
        return q;
      },
      update: (p: Row) => ((patch = p), q),
      delete: () => ((del = true), q),
      then: (resolve: (v: { data: Row[]; error: null }) => void) => {
        void tick().then(() => {
          const hit = matching();   // the rows the filters matched BEFORE the write (PostgREST returns the updated rows)
          if (patch) for (const r of hit) Object.assign(r, patch);
          if (del) for (const r of hit) rows.splice(rows.indexOf(r), 1);
          resolve({ data: hit, error: null });
        });
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

describe("createSiteFlow under an existing client (SF-J2)", () => {
  const ORG = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
  const SECOND = "7a7a7a7a-7a7a-4a7a-8a7a-7a7a7a7a7a7a";
  const soulful = () => ({
    organizations: [{
      id: ORG, slug: "soulful", name: "Soulful", type: "client", status: "active", created_at: "x", updated_at: "2026-10-01T00:00:00Z",
      metadata: { wp_update_latest: { at: "2026-11-01T03:00:00Z", ok: true }, brand_colors: { primary: "#112233" }, client_config: { platform: "wordpress", site_url: "https://soulful.example", ssh_host: "h" } },
    }],
  });
  const existing = { siteId: SECOND, clientName: "", organizationId: ORG, domain: "shop.soulful.example", locale: "zh-TW" as const, packs: ["base" as const] };

  it("a second site goes under the picked client, and the client row is not changed at all (old data)", async () => {
    const { db, tables } = fakeDb(soulful());
    const before = structuredClone(tables.organizations[0]);
    expect((await createSiteFlow(db, { ...input, organizationId: ORG, clientName: "" })).ok).toBe(true);
    const r = await createSiteFlow(db, existing);
    expect(r).toMatchObject({ ok: true, value: { organization: { id: ORG, created: false }, siteCreated: true, keptKeys: [] } });
    expect(tables.organizations).toEqual([before]);
    expect(tables.sites.map((s) => s.organization_id)).toEqual([ORG, ORG]);
    expect(tables.sites.map((s) => s.name)).toEqual(["oracle.aware-wave.com", "shop.soulful.example"]);
    expect(tables.projects).toHaveLength(1);
    expect(tables.environments.map((e) => (e.metadata as Row).host_slug)).toEqual(["oracle-aware-wave-com", "shop-soulful-example"]);
  });

  it("an unknown client id is refused before anything is written", async () => {
    const { db, tables } = fakeDb(soulful());
    expect(await createSiteFlow(db, { ...existing, organizationId: "0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c" })).toMatchObject({ ok: false, error: "client_not_found" });
    expect(tables.sites ?? []).toHaveLength(0);
  });

  it("a repeat of the same siteId sent with another client choice is refused", async () => {
    const { db } = fakeDb(soulful());
    await createSiteFlow(db, existing);
    expect(await createSiteFlow(db, { ...existing, organizationId: undefined, clientName: "別人" })).toMatchObject({ ok: false, error: "idempotency_key_reused" });
  });
});

describe("createSiteFlow under concurrency (SF-J2)", () => {
  it("the same address sent twice at once (one form, two presses) makes one client, site and environment", async () => {
    const { db, tables } = fakeDb();
    const [a, b] = await Promise.all([createSiteFlow(db, input), createSiteFlow(db, input)]);
    expect(a.ok && b.ok).toBe(true);
    expect([tables.organizations, tables.workspaces, tables.sites, tables.environments].map((t) => t.length)).toEqual([1, 1, 1, 1]);
    // projects has no unique key: the losing insert stays empty (never deleted, sites cascade), the site is under the oldest
    expect(tables.sites[0].project_id).toBe(tables.projects[0].id);
    expect(a.ok && b.ok && a.value.environmentId === b.value.environmentId).toBe(true);
  });

  it("two forms adding the same address to an existing client at once: one site, the other is told it is taken", async () => {
    const ORG = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
    const { db, tables } = fakeDb({ organizations: [{ id: ORG, slug: "soulful", name: "Soulful", type: "client", status: "active", created_at: "x", metadata: {} }] });
    const one = { ...input, clientName: "", organizationId: ORG };
    const rs = await Promise.all([
      createSiteFlow(db, { ...one, siteId: "1a1a1a1a-1a1a-4a1a-8a1a-1a1a1a1a1a1a" }),
      createSiteFlow(db, { ...one, siteId: "2b2b2b2b-2b2b-4b2b-8b2b-2b2b2b2b2b2b" }),
    ]);
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    expect(rs.find((r) => !r.ok)).toMatchObject({ ok: false, error: "host_slug_taken" });
    expect(tables.environments).toHaveLength(1);
  });
});

describe("parseCreateSiteBody", () => {
  it("existing-client mode needs an organization id and no name", () => {
    const base = { siteId: SITE_ID, domain: "oracle.aware-wave.com", locale: "zh-TW", packs: [] };
    const ORG = "0A0A0A0A-0A0A-4A0A-8A0A-0A0A0A0A0A0A";
    expect(parseCreateSiteBody({ ...base, clientMode: "existing", organizationId: ORG })).toMatchObject({ ok: true, input: { organizationId: ORG.toLowerCase(), clientName: "" } });
    expect(parseCreateSiteBody({ ...base, clientMode: "existing" })).toMatchObject({ ok: false, error: "invalid_client" });
    expect(parseCreateSiteBody({ ...base, clientMode: "merge", clientName: "x" })).toMatchObject({ ok: false, error: "invalid_client" });
    expect(parseCreateSiteBody({ ...base, clientName: "新客戶" })).toMatchObject({ ok: true, input: { clientName: "新客戶" } });
  });
});

describe("parseCreateSiteBody (SF-J)", () => {
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
