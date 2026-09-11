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
    expect(definerOf("cs_match_chunks_keyword").sql).toContain("&@~");
    expect(definerOf("cs_match_chunks_keyword").sql).toContain("pgroonga_score");
  });
});
