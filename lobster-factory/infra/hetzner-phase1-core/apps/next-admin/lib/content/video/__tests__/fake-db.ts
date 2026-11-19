// In-memory stand-in for the PostgREST calls the cover code makes (lib/content/video/cover.ts, app/api/video/cover):
// eq / in / like / not(k, "is", null) / is filters, order (asc/desc, nulls last) and limit applied for real, so a test of
// the bounded cover queries fails when they would pick the wrong row. "metadata->>k" = the JSON text path.
type Row = Record<string, unknown>;
export type FakeLog = { updates: Array<{ table: string; id: unknown; patch: Row }>; inserts: Array<{ table: string; row: Row }>; reads: number };

const col = (r: Row, k: string) => { const at = k.indexOf("->>"); return at > 0 ? (r[k.slice(0, at)] as Row | undefined)?.[k.slice(at + 3)] ?? null : r[k] ?? null; };
const likeRe = (p: string) => new RegExp("^" + p.split("%").map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$", "s");

export function fakeDb(tables: () => Record<string, Row[]>, log: FakeLog = { updates: [], inserts: [], reads: 0 }) {
  return {
    log,
    from: (table: string) => {
      const tests: Array<(r: Row) => boolean> = [];
      const orders: Array<[string, boolean]> = [];
      let limit = Infinity, patch: Row | null = null, insertRow: Row | null = null;
      const rows = () => {
        const list = (tables()[table] ?? []).filter((r) => tests.every((t) => t(r)));
        list.sort((a, b) => {
          for (const [k, asc] of orders) {
            const x = col(a, k), y = col(b, k);
            if (x === y) continue;
            if (x === null) return 1;
            if (y === null) return -1;
            return (String(x) < String(y) ? -1 : 1) * (asc ? 1 : -1);
          }
          return 0;
        });
        return list.slice(0, limit);
      };
      // update().select().maybeSingle() applies the patch to the matched rows, then answers the first.
      const one = async () => {
        log.reads++;
        const hit = rows();
        if (patch) for (const row of hit) { log.updates.push({ table, id: row.id, patch }); Object.assign(row, patch); }
        return { data: hit[0] ?? null, error: null };
      };
      const q = {
        select: () => q,
        eq: (k: string, v: unknown) => { tests.push((r) => col(r, k) === v); return q; },
        in: (k: string, v: unknown[]) => { tests.push((r) => v.includes(col(r, k))); return q; },
        like: (k: string, p: string) => { tests.push((r) => typeof col(r, k) === "string" && likeRe(p).test(col(r, k) as string)); return q; },
        gte: (k: string, v: unknown) => { tests.push((r) => col(r, k) !== null && String(col(r, k)) >= String(v)); return q; },
        is: (k: string, v: unknown) => { tests.push((r) => col(r, k) === v); return q; },
        not: (k: string, op: string, v: unknown) => {
          if (op !== "is" || v !== null) throw new Error(`fake-db: not(${op}) unsupported`);
          tests.push((r) => col(r, k) !== null);
          return q;
        },
        order: (k: string, o?: { ascending?: boolean }) => { orders.push([k, o?.ascending !== false]); return q; },
        limit: (n: number) => { limit = n; return q; },
        update: (p: Row) => { patch = p; return q; },
        insert: (r: Row) => { insertRow = r; return q; },
        maybeSingle: one,
        single: async () => {
          if (!insertRow) return one(); // a read (or update) of one row
          const row = { id: `new-${log.inserts.length + 1}`, created_at: new Date().toISOString(), ...insertRow };
          log.inserts.push({ table, row });
          tables()[table]?.push(row);
          return { data: { id: row.id }, error: null };
        },
        then: (resolve: (v: unknown) => void) => {
          log.reads++;
          if (patch) {
            for (const row of rows()) { log.updates.push({ table, id: row.id, patch }); Object.assign(row, patch); }
            resolve({ error: null });
            return;
          }
          resolve({ data: rows(), error: null });
        },
      };
      return q;
    },
  };
}
