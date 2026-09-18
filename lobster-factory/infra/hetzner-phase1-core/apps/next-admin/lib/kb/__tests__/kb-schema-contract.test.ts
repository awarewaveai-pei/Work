// Every column lib/kb/db.ts writes must actually exist in the migrations.
//
// This closes the one gap the other tests leave: the ingest path is exercised with the data-access
// layer mocked (kb-versioning.test.ts) and the retrieval predicates are exercised against a real
// Postgres with hand-written rows (packages/db/scripts/kb-local-verify.sh), so a column name typo
// in an insert payload would be caught by neither. In production it would not throw either —
// db.ts turns a Supabase error into `null` / `0`, so the symptom would be "ingest quietly does
// nothing", which is the failure mode this module is supposed to be free of.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { definerOf } from "./migration-source";

const NEXT_ADMIN = path.resolve(__dirname, "../../..");
const DB_PACKAGE = path.resolve(NEXT_ADMIN, "../../../../packages/db");

const dbSource = readFileSync(path.join(NEXT_ADMIN, "lib/kb/db.ts"), "utf8");
// Every migration that shapes these tables, in order. Leaving one out makes a column that exists
// look missing, and the test then fails for a reason that has nothing to do with the code.
const MIGRATIONS = [
  "migrations/0051_cs_core.sql",
  "migrations/0072_kb_versioning_and_retrieval_predicates.sql",
  "migrations/0075_kb_provenance_and_citation.sql",
  "migrations/0084_kb_source_body.sql",
  "migrations/0085_kb_folders.sql",
  "migrations/0086_kb_keyword_mode.sql",
  "migrations/0087_kb_cognitive_os_link.sql",
  "migrations/0088_kb_hci_link.sql",
];
const migrations = MIGRATIONS.map((f) => readFileSync(path.join(DB_PACKAGE, f), "utf8")).join("\n");
// The RPC signatures live in whichever migration created them last.
// The RPC signatures live in whichever migration created them last — located, not named, because
// the two halves are now defined in different files (0075 and 0076) and naming one was already wrong once.

/** Columns a CREATE TABLE / ALTER TABLE … ADD COLUMN grants to one table. */
function columnsOf(table: string): Set<string> {
  const cols = new Set<string>();

  const create = new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table} \\(([\\s\\S]*?)\\n\\);`).exec(migrations);
  if (create) {
    for (const line of create[1].split("\n")) {
      const m = /^\s{2}([a-z_]+)\s+[a-z]/.exec(line);
      if (m) cols.add(m[1]);
    }
  }

  const alter = new RegExp(`ALTER TABLE public\\.${table}([\\s\\S]*?);`, "g");
  for (const block of migrations.matchAll(alter)) {
    for (const m of block[1].matchAll(/ADD COLUMN IF NOT EXISTS\s+([a-z_]+)/g)) cols.add(m[1]);
  }
  return cols;
}

/**
 * snake_case keys written inside one exported function's body — those are column names; the
 * camelCase ones are the module's own input fields and are skipped by the pattern.
 * Scoped per function rather than per `.from("<table>")` call, because the chunk payload is built
 * in a `rows.map(...)` above the `.insert(payload)` call.
 */
function insertedColumns(fn: string): string[] {
  const start = dbSource.indexOf(`export async function ${fn}(`);
  expect(start, `${fn} not found in lib/kb/db.ts`).toBeGreaterThan(-1);
  const rest = dbSource.slice(start + 1);
  const end = rest.indexOf("\nexport ");
  const body = end === -1 ? rest : rest.slice(0, end);
  return [...new Set([...body.matchAll(/^\s{4,6}([a-z_]+):/gm)].map((m) => m[1]))];
}

describe("lib/kb/db.ts writes only columns that exist", () => {
  it("cs_knowledge_sources", () => {
    const known = columnsOf("cs_knowledge_sources");
    expect(known.size).toBeGreaterThan(10); // the parser found a real table, not an empty set
    const written = insertedColumns("insertSource");
    expect(written).toContain("doc_family_id"); // the K1 column the whole stage exists for
    expect(written).toContain("source_version");
    expect(written).toContain("space_id"); // the source owns the space; chunks must not copy it
    for (const col of written) expect([col, known.has(col)]).toEqual([col, true]);
  });

  it("cs_knowledge_chunks", () => {
    const known = columnsOf("cs_knowledge_chunks");
    expect(known.size).toBeGreaterThan(8);
    const written = insertedColumns("insertChunks");
    expect(written).toContain("doc_family_id");
    expect(written).not.toContain("space_id"); // one owner per fact — see migration 0072 header
    for (const col of written) expect([col, known.has(col)]).toEqual([col, true]);
  });

  it("passes the RPC parameter names the migration declares", () => {
    // A renamed parameter makes PostgREST fail to resolve the function; db.ts turns that into an
    // empty result, so retrieval returns nothing and nothing anywhere says why. Neither the mocked
    // unit tests nor the SQL harness (which calls the functions positionally) can see it.
    const declared = (fn: string): string[] => {
      const sig = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\(([\\s\\S]*?)\\)\\s*\\nRETURNS`).exec(definerOf(fn).sql);
      expect(sig, `signature of ${fn} not found in the K1 migration`).toBeTruthy();
      const names = [...sig![1].matchAll(/^\s*(p_[a-z_]+)\s/gm)].map((m) => m[1]);
      expect(names.length, `no parameters parsed out of ${fn}`).toBeGreaterThan(3);
      return [...names].sort();
    };

    // rpcArgs() supplies the six shared predicate arguments (migration 0083 added
    // p_include_sensitive as the sixth); each half adds its own.
    const shared = [...dbSource.matchAll(/^\s{4}(p_[a-z_]+): s\./gm)].map((m) => m[1]);
    const ownArgs = (fnName: string): string[] => {
      const start = dbSource.indexOf(`export async function ${fnName}(`);
      expect(start, `${fnName} not found in lib/kb/db.ts`).toBeGreaterThan(-1);
      const body = dbSource.slice(start, dbSource.indexOf("\nexport ", start + 1));
      return [...body.matchAll(/^\s{4}(p_[a-z_]+):/gm)].map((m) => m[1]);
    };
    const passed = (fnName: string) => [...new Set([...shared, ...ownArgs(fnName)])].sort();

    expect(shared.length).toBe(6);
    expect(passed("matchChunksVector")).toEqual(declared("cs_match_chunks"));
    expect(passed("matchChunksKeyword")).toEqual(declared("cs_match_chunks_keyword"));
  });

  it("reads and updates only columns that exist", () => {
    // .select("a,b,c") and .update({ … }) drift the same way an insert does.
    const selects = [...dbSource.matchAll(/\.select\("([a-z_,]+)"\)/g)].flatMap((m) => m[1].split(","));
    const updates = [...dbSource.matchAll(/\.update\(\{([^}]*)\}\)/g)].flatMap((m) =>
      [...m[1].matchAll(/([a-z_]+):/g)].map((k) => k[1]),
    );
    const all = new Set([...columnsOf("cs_knowledge_sources"), ...columnsOf("cs_knowledge_chunks")]);
    for (const col of [...selects, ...updates]) {
      if (col === "id") continue;
      expect([col, all.has(col)]).toEqual([col, true]);
    }
  });

  it("KB_UNFILED_FOLDER_ID stays 'unfiled' — ClientHubTabs.tsx duplicates this literal locally (a client component can't import lib/kb, which pulls in the service-role Supabase client), so a rename here would silently desync the folder filter unless this fails first", async () => {
    const { KB_UNFILED_FOLDER_ID } = await import("@/lib/kb/db");
    expect(KB_UNFILED_FOLDER_ID).toBe("unfiled");
  });
});
