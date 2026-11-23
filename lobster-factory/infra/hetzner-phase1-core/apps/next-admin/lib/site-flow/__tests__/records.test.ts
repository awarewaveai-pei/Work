// lib/site-flow/records.ts against an in-memory table fake (the PostgREST chain shapes records.ts uses).
// Card SF-B acceptance: an existing organization's metadata survives a repeat create (old-data test);
// a repeated environment does not duplicate; invalid hosting_provider / ingress are refused.
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureEnvironment, ensureOrganization, mergeMetadataAddOnly, setEnvironmentStatus } from "../records";
import { patchEnvironmentMetadata } from "../steps/shared";

type Row = Record<string, unknown>;

function fakeDb(seed: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = { ...seed };
  let n = 0;
  const from = (table: string) => {
    const rows = (tables[table] ??= []);
    const filters: ((r: Row) => boolean)[] = [];
    let patch: Row | null = null;
    let inserted: Row | null = null;
    const matching = () => rows.filter((r) => filters.every((f) => f(r)));
    const q = {
      select: () => q,
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
      neq: (c: string, v: unknown) => (filters.push((r) => r[c] !== v), q),
      order: () => q,
      limit: () => q,
      maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
      single: async () => (inserted ? { data: inserted, error: null } : { data: matching()[0] ?? null, error: null }),
      insert: (row: Row) => {
        inserted = { id: `id-${++n}`, status: table === "environments" ? "pending" : "active", created_at: "2026-11-22T00:00:00Z", metadata: {}, ...row };
        rows.push(inserted);
        return q;
      },
      update: (p: Row) => ((patch = p), q),
      then: (resolve: (v: { error: null; data?: Row[] }) => void) => {
        const hit = matching();
        if (patch) for (const r of hit) Object.assign(r, patch);
        resolve({ error: null, data: hit.map((r) => ({ id: r.id })) });
      },
    };
    return q;
  };
  return { db: { from } as unknown as SupabaseClient, tables };
}

const ORG = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
const OTHER_ORG = "0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b";
const SITE = "6f1e2d3c-4b5a-4978-8a6b-5c4d3e2f1a0b";

describe("ensureOrganization", () => {
  it("an existing client's wp_update_latest, brand_colors and client_config survive a create with the same slug", async () => {
    const original = {
      wp_update_latest: { at: "2026-11-01T03:00:00Z", ok: true, plugins: ["fluentform"] },
      brand_colors: { primary: "#112233" },
      client_config: { platform: "wordpress", site_url: "https://soulful.example", ssh_host: "h", ssh_user: "u" },
    };
    const { db, tables } = fakeDb({
      organizations: [{ id: ORG, slug: "soulful", name: "Soulful", type: "client", status: "active", created_at: "x", metadata: structuredClone(original) }],
    });

    const r = await ensureOrganization(db, {
      slug: "soulful",
      name: "Soulful renamed",
      type: "client",
      metadata: { client_config: { platform: "wordpress", site_url: "https://typo.example", hosting_type: "hostinger" } },
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.id).toBe(ORG);
    expect(r.value.created).toBe(false);
    const meta = tables.organizations[0].metadata as typeof original & { client_config: Record<string, unknown> };
    expect(meta.wp_update_latest).toEqual(original.wp_update_latest);
    expect(meta.brand_colors).toEqual(original.brand_colors);
    expect(meta.client_config).toEqual({ ...original.client_config, hosting_type: "hostinger" });
    expect(r.value.keptKeys).toEqual(["client_config.site_url"]);
    expect(tables.organizations).toHaveLength(1);
    expect(tables.organizations[0].name).toBe("Soulful");
  });

  it("an existing slug under another id is refused", async () => {
    const { db } = fakeDb({ organizations: [{ id: ORG, slug: "acme", name: "Acme", metadata: {} }] });
    const r = await ensureOrganization(db, { slug: "acme", name: "Acme", id: OTHER_ORG });
    expect(r).toMatchObject({ ok: false, error: "slug_id_mismatch" });
  });

  it("createOnly: an existing slug is refused and left untouched (a new client never adopts another's org)", async () => {
    const { db, tables } = fakeDb({ organizations: [{ id: ORG, slug: "acme-1a2b3c", name: "Acme", metadata: { a: 1 } }] });
    const r = await ensureOrganization(db, { slug: "acme-1a2b3c", name: "Other", metadata: { b: 2 }, createOnly: true });
    expect(r).toMatchObject({ ok: false, error: "slug_taken" });
    expect(tables.organizations).toEqual([{ id: ORG, slug: "acme-1a2b3c", name: "Acme", metadata: { a: 1 } }]);
  });

  it("mergeMetadataAddOnly never replaces a value, even a falsy one", () => {
    const { merged, kept } = mergeMetadataAddOnly({ a: 0, b: { c: false } }, { a: 1, b: { c: true, d: 2 }, e: 3 });
    expect(merged).toEqual({ a: 0, b: { c: false, d: 2 }, e: 3 });
    expect(kept).toEqual(["a", "b.c"]);
  });
});

describe("ensureEnvironment", () => {
  const site = { id: SITE, organization_id: ORG, workspace_id: "ws-1" };
  const base = {
    organizationId: ORG,
    siteId: SITE,
    environmentType: "staging" as const,
    name: "Acme Staging",
    hostingProvider: "ks-aw-01-staging-subdir",
    baseUrl: "https://aware-wave.com/staging/acme-6f1e2d/",
  };

  it("a repeated call returns the same row instead of a second one; ingress defaults to host-vhost", async () => {
    const { db, tables } = fakeDb({ sites: [site] });
    const a = await ensureEnvironment(db, base);
    // pending (the column default) -> provisioning: an allowed move (records.ts ENVIRONMENT_STATUS_TRANSITIONS)
    const b = await ensureEnvironment(db, { ...base, status: "provisioning" });
    expect(a).toMatchObject({ ok: true, value: { created: true } });
    expect(b).toMatchObject({ ok: true, value: { created: false } });
    if (!a.ok || !b.ok) return;
    expect(b.value.id).toBe(a.value.id);
    expect(tables.environments).toHaveLength(1);
    expect(tables.environments[0]).toMatchObject({ organization_id: ORG, workspace_id: "ws-1", status: "provisioning", metadata: { ingress: "host-vhost" } });
  });

  it("an existing row keeps its ingress when the caller passes none", async () => {
    const { db, tables } = fakeDb({ sites: [site] });
    await ensureEnvironment(db, { ...base, metadata: { ingress: "product-gateway" } });
    await ensureEnvironment(db, base);
    expect((tables.environments[0].metadata as Row).ingress).toBe("product-gateway");
  });

  it.each([
    ["hosting_provider", { hostingProvider: "hostinger" }, "invalid_hosting_provider"],
    ["ingress", { metadata: { ingress: "public" } }, "invalid_ingress"],
  ])("an invalid %s is refused and nothing is written", async (_l, override, error) => {
    const { db, tables } = fakeDb({ sites: [site] });
    const r = await ensureEnvironment(db, { ...base, ...override });
    expect(r).toMatchObject({ ok: false, error });
    expect(tables.environments ?? []).toHaveLength(0);
  });

  it("another organization's site is refused", async () => {
    const { db, tables } = fakeDb({ sites: [site] });
    const r = await ensureEnvironment(db, { ...base, organizationId: OTHER_ORG });
    expect(r).toMatchObject({ ok: false, error: "site_scope_mismatch" });
    expect(tables.environments ?? []).toHaveLength(0);
  });
});

// SF-H item 3: status is a cache with a written rule (records.ts ENVIRONMENT_STATUS_TRANSITIONS).
describe("setEnvironmentStatus", () => {
  const ENV = "e-1";
  const at = (status: string) => fakeDb({ environments: [{ id: ENV, status }] });

  it("a failed environment comes back through provisioning to ready (the re-run path)", async () => {
    const { db, tables } = at("failed");
    expect(await setEnvironmentStatus(db, ENV, "ready")).toMatchObject({ ok: false, error: "invalid_transition" });
    expect(await setEnvironmentStatus(db, ENV, "provisioning")).toMatchObject({ ok: true });
    expect(await setEnvironmentStatus(db, ENV, "ready")).toMatchObject({ ok: true });
    expect(tables.environments[0].status).toBe("ready");
  });

  it("archived is never revived; pending cannot jump to ready; the same status is a no-op", async () => {
    const archived = at("archived");
    expect(await setEnvironmentStatus(archived.db, ENV, "provisioning")).toMatchObject({ ok: false, error: "invalid_transition" });
    expect(archived.tables.environments[0].status).toBe("archived");
    expect(await setEnvironmentStatus(at("pending").db, ENV, "ready")).toMatchObject({ ok: false, error: "invalid_transition" });
    expect(await setEnvironmentStatus(at("ready").db, ENV, "ready")).toMatchObject({ ok: true });
  });

  it("old callers unchanged: provision-staging's provisioning -> ready and provisioning -> failed", async () => {
    const a = at("provisioning");
    expect(await setEnvironmentStatus(a.db, ENV, "ready")).toMatchObject({ ok: true });
    expect(a.tables.environments[0].status).toBe("ready");
    const b = at("provisioning");
    expect(await setEnvironmentStatus(b.db, ENV, "failed")).toMatchObject({ ok: true });
    expect(b.tables.environments[0].status).toBe("failed");
  });

  it("ensureEnvironment on an existing row follows the same rule (re-provisioning a staging site that failed)", async () => {
    const site = { id: SITE, organization_id: ORG, workspace_id: "ws-1" };
    const base = { organizationId: ORG, siteId: SITE, environmentType: "staging" as const, name: "S", hostingProvider: "ks-aw-01-staging-subdir" };
    const { db, tables } = fakeDb({ sites: [site], environments: [{ id: "e-2", site_id: SITE, environment_type: "staging", status: "failed", hosting_provider: "ks-aw-01-staging-subdir", metadata: {} }] });
    expect(await ensureEnvironment(db, { ...base, status: "provisioning" })).toMatchObject({ ok: true });
    expect(tables.environments[0].status).toBe("provisioning");
    expect(await ensureEnvironment(db, { ...base, status: "pending" })).toMatchObject({ ok: false, error: "invalid_transition" });
  });
});

// Card SF-J2: ensureEnvironment and the steps' patchEnvironmentMetadata both read-merge-write environments.metadata
// through updateEnvironmentCas. Another writer landing between one's read and its write must not lose either key.
describe("environments.metadata under concurrent writes", () => {
  const ENV = "e0e0e0e0-e0e0-4e0e-8e0e-e0e0e0e0e0e0";
  /** environments + sites; reads return copies (a snapshot, like the wire); `between` runs once, after the first
   *  environments read that carries updated_at and before the write that follows it (the other request's commit). */
  function racingDb(between: (row: Row) => void) {
    const tables: Record<string, Row[]> = {
      sites: [{ id: SITE, organization_id: ORG, workspace_id: "w1" }],
      environments: [{ id: ENV, site_id: SITE, environment_type: "production", hosting_provider: "ks-aw-01-docker", status: "pending", updated_at: "2026-11-22T00:00:00.000000+00:00", metadata: { ingress: "host-vhost" } }],
    };
    let fired = false;
    const from = (table: string) => {
      const filters: ((r: Row) => boolean)[] = [];
      let patch: Row | null = null;
      let cols = "";
      const matching = () => tables[table].filter((r) => filters.every((f) => f(r)));
      const q = {
        select: (c = "") => ((cols = c), q),
        eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
        neq: (c: string, v: unknown) => (filters.push((r) => r[c] !== v), q),
        order: () => q,
        limit: () => q,
        maybeSingle: async () => {
          const row = matching()[0];
          const copy = row ? structuredClone(row) : null;
          if (table === "environments" && row && cols.includes("updated_at") && !fired) { fired = true; between(row); }
          return { data: copy, error: null };
        },
        update: (p: Row) => ((patch = p), q),
        then: (resolve: (v: { error: null; data: Row[] }) => void) => {
          const hit = matching();
          if (patch) for (const r of hit) Object.assign(r, patch);
          resolve({ error: null, data: hit.map((r) => ({ id: r.id })) });
        },
      };
      return q;
    };
    return { db: { from } as unknown as SupabaseClient, env: () => tables.environments[0] };
  }
  const commit = (row: Row, key: string, value: unknown) => {
    row.metadata = { ...(row.metadata as Row), [key]: value };
    row.updated_at = "2026-11-22T00:00:01.000Z";
  };

  it("create-site's ensureEnvironment keeps a bridge key the bridge step wrote between its read and its write", async () => {
    const bridge = { key_id: "aw-1", credential_id: "c1" };
    const { db, env } = racingDb((row) => commit(row, "bridge", bridge));
    const r = await ensureEnvironment(db, { organizationId: ORG, siteId: SITE, environmentType: "production", name: "production", hostingProvider: "ks-aw-01-docker", metadata: { host_slug: "oracle-aware-wave-com" } });
    expect(r.ok).toBe(true);
    expect(env().metadata).toMatchObject({ bridge, host_slug: "oracle-aware-wave-com", ingress: "host-vhost" });
  });

  it("the bridge step's patchEnvironmentMetadata keeps a host_slug written between its read and its write", async () => {
    const bridge = { key_id: "aw-1", credential_id: "c1" };
    const { db, env } = racingDb((row) => commit(row, "host_slug", "oracle-aware-wave-com"));
    expect(await patchEnvironmentMetadata(db, ENV, { bridge }, { credentials_ref: "c1" })).toEqual({ ok: true });
    expect(env().metadata).toMatchObject({ bridge, host_slug: "oracle-aware-wave-com", ingress: "host-vhost" });
    expect(env().credentials_ref).toBe("c1");
  });
});
