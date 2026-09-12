// Mechanical guard for the one invariant that cannot be tested by querying: the vector half and the
// keyword half of hybrid retrieval must apply the SAME visibility predicate.
//
// If they diverge, the symptom is not an error — it is "the vector search cannot see that document
// but the keyword search can", which is a cross-tenant / archived-content leak that only shows up
// when someone happens to phrase a query the wrong way. A row-level test can only prove the halves
// agree on the rows it happens to create; this proves they agree by construction, for every row
// that will ever exist, by comparing the two predicate blocks byte for byte.
//
// The halves no longer live in one file — vector was last defined in 0075, keyword in 0076 — so the
// blocks are located by which migration currently defines each function. Nothing here needs editing
// when the next migration redefines either one.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { KB_DEFAULT_SPACE_ID } from "@/lib/kb/config";
import { MIGRATIONS_DIR, definerOf, predicateOf } from "./migration-source";

describe("retrieval predicate parity", () => {
  const vector = predicateOf("cs_match_chunks");
  const keyword = predicateOf("cs_match_chunks_keyword");

  it("finds a predicate for each half", () => {
    expect(vector.length).toBeGreaterThan(100);
    expect(keyword.length).toBeGreaterThan(100);
  });

  it("keeps both halves byte-identical", () => {
    expect(keyword).toBe(vector);
  });

  it("carries all six dimensions", () => {
    expect(vector).toContain("c.organization_id = ANY(p_scope)"); // scope
    expect(vector).toContain("s.space_id"); // space — read from the SOURCE, its only owner
    expect(vector).toContain("s.status = 'active'"); // status
    expect(vector).toContain("s.is_sensitive"); // sensitive
    expect(vector).toContain("p_as_of"); // as_of
    expect(vector).toContain("c.embed_model = p_model"); // embed_model
  });

  it("uses the same default-space uuid as the application", () => {
    expect(vector).toContain(`'${KB_DEFAULT_SPACE_ID}'::uuid`);
  });

  it("removes the unfiltered 0051 signature instead of leaving it as an overload", () => {
    // That drop belongs to 0072, where the six-predicate pair replaced the original function.
    const k1 = readFileSync(path.join(MIGRATIONS_DIR, "0072_kb_versioning_and_retrieval_predicates.sql"), "utf8");
    expect(k1).toContain("DROP FUNCTION IF EXISTS public.cs_match_chunks(uuid, vector, integer);");
  });

  it("drops the previous signature before re-creating either half", () => {
    // A changed RETURN shape requires a DROP — CREATE OR REPLACE cannot change one — and leaving the
    // old signature alive would mean two retrieval functions, one of them without the new columns.
    for (const fn of ["cs_match_chunks", "cs_match_chunks_keyword"] as const) {
      const { file, sql } = definerOf(fn);
      expect([fn, file, sql.includes(`DROP FUNCTION IF EXISTS public.${fn}(`)]).toEqual([fn, file, true]);
    }
  });

  it("keeps the keyword half on a ranked matcher, not a substring scan", () => {
    // The regression this prevents has no error attached: `strpos(content, <the whole question>)`
    // matched nothing for any real query, so hybrid was vector-only and looked healthy.
    const sql = definerOf("cs_match_chunks_keyword").sql;
    // Checked against a comment-stripped body, not the whole file: the migration's own header
    // prose mentions "&@~" six times while explaining why it matters (caught in a second review
    // pass — the fast vitest gate would otherwise stay green even if the real WHERE clause below
    // dropped it entirely, which was the exact bug finding #1 exists to catch. The slow, docker-
    // based kb-local-verify.sh fullwidth fixture would still catch a full removal, but that isn't
    // the gate that runs on every commit).
    const withoutComments = sql.replace(/--[^\n]*/g, "");
    expect(withoutComments).toMatch(/AND\s+c\.content\s+&@~\s+btrim\(p_term\)/); // PGroonga does the matching
    expect(withoutComments).toMatch(/ORDER BY\s+hit\.n\s+DESC/); // and the ranking expression, not a comment
    // pgroonga_score() is explicitly banned, not merely absent: it only has a value for rows a
    // PGroonga index scan produced, and the local harness proved that on a table this size the
    // planner picks a sequential scan instead, silently scoring every row 0. Comments already
    // stripped above — the function body explains in prose why pgroonga_score() must not be
    // called, and a naive string check would fail on exactly that sentence (caught writing this).
    expect(withoutComments).not.toMatch(/pgroonga_score\s*\(/);
  });
});
