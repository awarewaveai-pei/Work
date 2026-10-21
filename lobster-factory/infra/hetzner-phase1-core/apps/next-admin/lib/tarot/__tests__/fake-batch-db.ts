/**
 * In-memory stand-in for the two 0115 tables + RPCs, held OUTSIDE the modules under test so a fresh module
 * instance (vi.resetModules = restart) sees the same rows. The RPC rules mirror 0115's SQL; the SQL itself is
 * proven on real Postgres by packages/db/scripts/0115_tarot_batch_jobs-local-verify.sh.
 */
type Row = Record<string, unknown>;

export interface FakeBatchDb {
  tables: { tarot_batch_jobs: Row[]; tarot_batch_cards: Row[] };
  client: unknown;
}

export function createFakeBatchDb(): FakeBatchDb {
  const tables = { tarot_batch_jobs: [] as Row[], tarot_batch_cards: [] as Row[] };
  const nowIso = () => new Date().toISOString();

  function from(name: keyof typeof tables) {
    const rows = tables[name];
    const filters: ((r: Row) => boolean)[] = [];
    let op: "select" | "update" | "delete" | "insert" = "select";
    let patch: Row = {};
    let returning = false;
    let order: { col: string; asc: boolean } | null = null;
    let limit = Infinity;
    let single = false;

    const run = (): { data: unknown; error: null } => {
      if (op === "insert") {
        rows.push({ status: "pending", error: null, run_id: null, created_at: nowIso(), updated_at: nowIso(), ...patch });
        return { data: null, error: null };
      }
      const hit = rows.filter((r) => filters.every((f) => f(r)));
      if (op === "delete") {
        for (const r of hit) rows.splice(rows.indexOf(r), 1);
        if (name === "tarot_batch_jobs") {
          const ids = new Set(hit.map((r) => r.id));
          tables.tarot_batch_cards = tables.tarot_batch_cards.filter((c) => !ids.has(c.job_id));
        }
        return { data: null, error: null };
      }
      if (op === "update") {
        for (const r of hit) Object.assign(r, patch);
        return { data: returning ? hit.map((r) => ({ ...r })) : null, error: null };
      }
      let out = hit.map((r) => ({ ...r }));
      if (order) {
        const { col, asc } = order;
        out.sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1));
      }
      out = out.slice(0, limit);
      return { data: single ? out[0] ?? null : out, error: null };
    };

    const b = {
      select(_cols?: string) { if (op === "update") returning = true; return b; },
      insert(obj: Row) { op = "insert"; patch = obj; return b; },
      update(obj: Row) { op = "update"; patch = obj; return b; },
      delete() { op = "delete"; return b; },
      eq(col: string, v: unknown) { filters.push((r) => r[col] === v); return b; },
      in(col: string, vs: unknown[]) { filters.push((r) => vs.includes(r[col])); return b; },
      lt(col: string, v: string) { filters.push((r) => String(r[col]) < v); return b; },
      order(col: string, o: { ascending: boolean }) { order = { col, asc: o.ascending }; return b; },
      limit(n: number) { limit = n; return b; },
      maybeSingle() { single = true; return b; },
      then(ok: (v: { data: unknown; error: null }) => unknown, bad?: (e: unknown) => unknown) {
        try { return Promise.resolve(run()).then(ok, bad); } catch (e) { return Promise.reject(e).then(ok, bad); }
      },
    };
    return b;
  }

  function rpc(fn: string, a: Row) {
    const cards = tables.tarot_batch_cards;
    const find = () => cards.find((c) => c.job_id === a.p_job_id && c.card_index === a.p_card_index);
    if (fn === "tarot_batch_claim_card") {
      if (!tables.tarot_batch_jobs.some((j) => j.id === a.p_job_id)) {
        return Promise.resolve({ data: [{ claim_outcome: "no_job", done_url: null }], error: null });
      }
      const c = find();
      if (!c) {
        cards.push({ job_id: a.p_job_id, card_index: a.p_card_index, card_name: a.p_card_name, status: "generating",
          url: null, error: null, attempts: 1, claimed_at: Date.now() });
        return Promise.resolve({ data: [{ claim_outcome: "claimed", done_url: null }], error: null });
      }
      const stale = c.status === "generating" && (c.claimed_at as number) < Date.now() - (a.p_lease_seconds as number) * 1000;
      if (c.status === "error" || stale) {
        Object.assign(c, { status: "generating", error: null, claimed_at: Date.now(), attempts: (c.attempts as number) + 1 });
        return Promise.resolve({ data: [{ claim_outcome: "claimed", done_url: null }], error: null });
      }
      return Promise.resolve({
        data: [c.status === "done" ? { claim_outcome: "done", done_url: c.url } : { claim_outcome: "in_progress", done_url: null }],
        error: null,
      });
    }
    if (fn === "tarot_batch_finish_card") {
      const c = find();
      if (c && c.status !== "done") {
        Object.assign(c, a.p_url != null
          ? { status: "done", url: a.p_url, error: null }
          : { status: "error", url: null, error: a.p_error ?? "unknown_error" });
      }
      return Promise.resolve({ data: c ? c.status : null, error: null });
    }
    return Promise.resolve({ data: null, error: { message: `unknown rpc ${fn}` } });
  }

  return { tables, client: { from, rpc } };
}
