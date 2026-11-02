// An in-memory stand-in for the outreach database, enough for warm-leads.ts: co_leads with the two unique keys of 0149 and
// 0154, co_messages, co_timeline_events, and co_convert_to_warm mirroring 0152 (the SQL itself is tested in
// packages/db/tests/test_0152_sender_pool.py).
type Row = Record<string, unknown>;

export function fakeWarmDb() {
  const t: Record<string, Row[]> = { co_leads: [], co_messages: [], co_timeline_events: [] };
  let n = 0;
  const duplicate = (row: Row): boolean => t.co_leads.some((r) => r.organization_id === row.organization_id
    && ((!!row.email && String(r.email ?? "").toLowerCase() === String(row.email).toLowerCase())
      || (typeof row.source_url === "string" && row.source_url.startsWith("meta:leadgen/") && r.source_url === row.source_url)));
  const from = (table: string) => {
    const filters: Array<(r: Row) => boolean> = [];
    let op: "select" | "insert" | "update" = "select";
    let payload: Row = {};
    const run = (): { data: unknown; error: { code?: string; message: string } | null } => {
      if (op === "insert") {
        if (table === "co_leads" && duplicate(payload)) return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
        const row = { id: `${table}-${++n}`, status: "new", do_not_contact: false, fluentcrm_sync_status: "not_synced", website: null, ...payload };
        t[table].push(row);
        return { data: row, error: null };
      }
      const hit = t[table].filter((r) => filters.every((f) => f(r)));
      if (op === "update") for (const r of hit) Object.assign(r, payload);
      return { data: hit, error: null };
    };
    const q: Record<string, unknown> = {
      select: () => q,
      limit: () => q,
      eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return q; },
      is: (c: string, v: null) => { filters.push((r) => (r[c] ?? null) === v); return q; },
      // the code escapes % _ \ with a backslash: the fake compares the unescaped text, case-insensitively
      ilike: (c: string, p: string) => { filters.push((r) => String(r[c] ?? "").toLowerCase() === p.replace(/\\(.)/g, "$1").toLowerCase()); return q; },
      insert: (row: Row) => { op = "insert"; payload = row; return q; },
      update: (patch: Row) => { op = "update"; payload = patch; return q; },
      maybeSingle: async () => { const r = run(); return { data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: r.error }; },
      single: async () => run(),
      then: (ok: (v: unknown) => unknown) => ok(run()),
    };
    return q;
  };
  const rpc = async (fn: string, args: { p_lead_id: string; p_consent: Record<string, string> }) => {
    if (fn !== "co_convert_to_warm") return { data: null, error: { message: `unexpected rpc ${fn}` } };
    const lead = t.co_leads.find((r) => r.id === args.p_lead_id);
    if (!lead) return { data: null, error: null };
    Object.assign(lead, { status: "warm", consent_status: args.p_consent.status, consent_source: args.p_consent.source, consent_at: args.p_consent.at, next_followup_date: null });
    const skipped = t.co_messages.filter((m) => m.lead_id === args.p_lead_id && ["draft", "approved", "drafted"].includes(String(m.status)));
    for (const m of skipped) m.status = "skipped";
    return { data: skipped.length, error: null };
  };
  return { from, rpc, tables: t };
}
