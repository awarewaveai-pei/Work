// A supabase-js query builder is lazy: the request is sent only by then()/await. A statement that starts a
// `.from(...)` chain and neither awaits, returns, assigns nor .then()s it never touches the database —
// seven routes' ops_audit_events inserts and the video job TTL cleanup were silently dead that way
// (WORKLOG 2026-10-15). This scans app/ and lib/ for such statements.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const SKIP = new Set(["node_modules", ".next", "__tests__"]);

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

/** True when `.then(` belongs to the chain itself (bracket depth 0), not to an argument inside it. */
function thenAtTopLevel(stmt: string): boolean {
  let depth = 0;
  for (let i = 0; i < stmt.length; i++) {
    const c = stmt[i];
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (depth === 0 && stmt.startsWith(".then(", i)) return true;
  }
  return false;
}

/** The statement starting at `start`: up to the first `;` at bracket depth 0. */
function statementAt(src: string, start: number): string {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === ";" && depth <= 0) return src.slice(start, i);
  }
  return src.slice(start);
}

// A line that begins a bare (or `void`) expression statement on a client: `sb.from(`, `supabase.from(`,
// `getSupabaseWriteClient()?.from(`. Array.from / Buffer.from are not clients.
const BARE_CHAIN = /^[ \t]*(?:void[ \t]+)?(?!Array\b|Buffer\b|Object\b|Uint8Array\b)[A-Za-z_$][\w$]*(?:\(\))?\??\.from\(/gm;

export function unexecutedBuilders(src: string): string[] {
  const hits: string[] = [];
  for (const m of src.matchAll(BARE_CHAIN)) {
    // Only a statement of its own: an array element / argument (`Promise.all([sb.from(...), …])`) is
    // awaited by its parent. A statement follows `;`, `{`, `}` or starts the file.
    const before = src.slice(0, m.index!).replace(/\/\/[^\n]*$/gm, "").trimEnd();
    if (before && !/(?:[;{})]|\belse)$/.test(before)) continue;
    const stmt = statementAt(src, m.index!);
    if (!thenAtTopLevel(stmt)) hits.push(stmt.trim().split("\n")[0]);
  }
  return hits;
}

describe("supabase builders are executed", () => {
  it("detects the dead shapes and passes the live ones", () => {
    expect(unexecutedBuilders(`  void getSupabaseWriteClient()?.from("t").insert({ a: 1 });`)).toHaveLength(1);
    expect(unexecutedBuilders(`  sb.from("t").update({ a: 1 }).eq("id", 1);`)).toHaveLength(1);
    expect(unexecutedBuilders(`  void sb.from("t").delete().then(({ error }) => {});`)).toHaveLength(0);
    expect(unexecutedBuilders(`  const { error } = await sb.from("t").insert({});\n  return sb.from("t").select();`)).toHaveLength(0);
    expect(unexecutedBuilders(`  const parts = Array.from(set);`)).toHaveLength(0);
    expect(unexecutedBuilders(`  if (enabled)\n    void sb.from("t").delete();`)).toHaveLength(1);
    expect(unexecutedBuilders(`  void sb.from("t").insert({ v: getValue().then((v) => v) });`)).toHaveLength(1);
    expect(unexecutedBuilders(`  const [a, b] = await Promise.all([
    sb.from("t").select("id"),
    sb.from("u").select("id"),
  ]);`)).toHaveLength(0);
  });

  it("no statement in app/ or lib/ starts a builder without awaiting, returning, assigning or then()-ing it", () => {
    const found: string[] = [];
    for (const f of [...files(path.join(ROOT, "app")), ...files(path.join(ROOT, "lib"))]) {
      for (const hit of unexecutedBuilders(readFileSync(f, "utf8"))) found.push(`${path.relative(ROOT, f)}: ${hit}`);
    }
    expect(found).toEqual([]);
  });
});
