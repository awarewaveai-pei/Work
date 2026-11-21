import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory tables: upsert by the onConflict column; ignoreDuplicates = insert-or-skip (Postgres ON CONFLICT DO NOTHING).
const tables = vi.hoisted(() => new Map<string, Map<string, Record<string, unknown>>>());
const sb = vi.hoisted(() => ({
  // systems_apply_registry (migration 0174): one transaction; here, record the systems by id
  rpc(_fn: string, args: Record<"p_systems" | "p_phases" | "p_features", Array<Record<string, unknown>>>) {
    // the NOT NULL columns of 0174: a row missing one would make the real function roll back the whole ingest
    const required = { p_systems: ["id", "slug", "name", "type", "position"], p_phases: ["id", "system_id", "slug", "name", "position"], p_features: ["id", "system_id", "phase_id", "slug", "name", "position"] } as const;
    for (const [arg, cols] of Object.entries(required)) for (const row of args[arg as keyof typeof required]) for (const c of cols) if (row[c] == null) return Promise.resolve({ data: null, error: { message: `${arg}.${c} is null` } });
    const t = tables.get("systems") ?? new Map<string, Record<string, unknown>>();
    tables.set("systems", t);
    for (const s of args.p_systems) t.set(String(s.id), { ...s, in_registry: true });
    return Promise.resolve({ data: null, error: null });
  },
  from(table: string) {
    const t = tables.get(table) ?? new Map<string, Record<string, unknown>>();
    tables.set(table, t);
    const done = (data: unknown) => ({ select: () => Promise.resolve({ data, error: null }), then: (ok: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(ok) });
    return {
      upsert(rows: Array<Record<string, unknown>>, opts: { onConflict: string; ignoreDuplicates?: boolean }) {
        const written: unknown[] = [];
        for (const r of rows) {
          const key = String(r[opts.onConflict]);
          if (t.has(key) && opts.ignoreDuplicates) continue;
          t.set(key, { ...t.get(key), ...r });
          written.push(r);
        }
        return done(written);
      },
    };
  },
}));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => sb }));

const { POST } = await import("./route");

const TOKEN = "systems-ingest-token-long-enough";
const SYS = "11111111-1111-4111-8111-111111111111";
const body = (events: unknown[] = []) => ({
  registry: { version: 1, shared_paths: [], ignore_paths: [], systems: [{
    id: SYS, slug: "outbound-os", name: "外送系統", aliases: [], type: "product", purpose: "x", product_key: null,
    source_paths: ["lobster-factory/"], phases: [{ id: "22222222-2222-4222-8222-222222222222", slug: "p1", name: "階段", legacy_source_path: null }],
    features: [{ id: "33333333-3333-4333-8333-333333333333", slug: "c1-send", name: "寄信", phase: "p1" }],
  }] },
  events,
});
const event = (key: string) => ({
  event_key: key, system_slug: "outbound-os", phase_slug: null, feature_slug: null, event_type: "activity", source: "agent",
  commit_sha: "abc123", occurred_at: "2026-11-21T00:00:00Z", payload: { subject: "s", files: 1 }, evidence: null,
});
const req = (payload: unknown, auth: string | null = `Bearer ${TOKEN}`) =>
  new Request("http://localhost/api/internal/systems/ingest", {
    method: "POST",
    headers: auth ? { authorization: auth, "content-type": "application/json" } : { "content-type": "application/json" },
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
  });

beforeEach(() => {
  tables.clear();
  process.env.SYSTEMS_INGEST_TOKEN = TOKEN;
});

describe("POST /api/internal/systems/ingest", () => {
  it("no token or a wrong token is 401 and writes nothing", async () => {
    expect((await POST(req(body([event("git:abc123:0")]), null))).status).toBe(401);
    expect((await POST(req(body([event("git:abc123:0")]), "Bearer wrong"))).status).toBe(401);
    delete process.env.SYSTEMS_INGEST_TOKEN;
    expect((await POST(req(body([event("git:abc123:0")]), `Bearer ${TOKEN}`))).status).toBe(401);
    expect(tables.size).toBe(0);
  });

  it("resending the same event_key does not add it twice", async () => {
    const first = await POST(req(body([event("git:abc123:0"), event("git:abc123:1")])));
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ ok: true, inserted: 2, skipped: 0 }); // no run record of its own: the importer sends it last
    const again = await POST(req(body([event("git:abc123:0"), event("git:abc123:1")])));
    expect(await again.json()).toMatchObject({ ok: true, inserted: 0, skipped: 2 });
    expect(tables.get("system_updates")!.size).toBe(2);
    expect(tables.get("system_updates")!.get("git:abc123:0")!.system_id).toBe(SYS);
  });

  it("a body that breaks the contract is 400 and writes nothing", async () => {
    expect((await POST(req("{not json"))).status).toBe(400);
    const bad = body([{ ...event("git:abc123:0"), event_type: "status_change" }]);
    expect((await POST(req(bad))).status).toBe(400);
    const r = await POST(req(body([{ ...event("git:abc123:0"), occurred_at: "yesterday" }])));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/occurred_at/);
    expect(tables.size).toBe(0);
  });
});
