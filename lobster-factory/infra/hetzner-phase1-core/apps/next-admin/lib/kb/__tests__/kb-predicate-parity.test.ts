// Mechanical guard for the one invariant that cannot be tested by querying: the vector half and the
// keyword half of hybrid retrieval must apply the SAME visibility predicate.
//
// If they diverge, the symptom is not an error — it is "the vector search cannot see that document
// but the keyword search can", which is a cross-tenant / archived-content leak that only shows up
// when someone happens to phrase a query the wrong way. A row-level test can only prove the halves
// agree on the rows it happens to create; this test proves they agree by construction, for every
// row that will ever exist, by reading migration 0072 and comparing the two predicate blocks byte
// for byte.
//
// If a future migration redefines either function, point PREDICATE_SOURCE at that migration.

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { KB_DEFAULT_SPACE_ID } from "@/lib/kb/config";

const PREDICATE_SOURCE = path.resolve(
  __dirname,
  // __tests__ → kb → lib → next-admin → apps → hetzner-phase1-core → infra → lobster-factory
  // 0075 re-created both functions (it added the citation columns to their return shape), so this
  // is where the live definitions now live. The drift test below is what forced this update.
  "../../../../../../../packages/db/migrations/0075_kb_provenance_and_citation.sql",
);

function predicateBlocks(sql: string): string[] {
  const re = /-- >>> KB_VISIBILITY_PREDICATE\r?\n([\s\S]*?)-- <<< KB_VISIBILITY_PREDICATE/g;
  return [...sql.matchAll(re)].map((m) => m[1]);
}

describe("retrieval predicate parity", () => {
  const sql = readFileSync(PREDICATE_SOURCE, "utf8");
  const blocks = predicateBlocks(sql);

  it("finds exactly one predicate block per retrieval half", () => {
    expect(blocks).toHaveLength(2);
  });

  it("keeps both halves byte-identical", () => {
    expect(blocks[1]).toBe(blocks[0]);
  });

  it("carries all six dimensions", () => {
    const p = blocks[0];
    expect(p).toContain("c.organization_id = ANY(p_scope)"); // scope
    expect(p).toContain("s.space_id"); // space — read from the SOURCE, its only owner
    expect(p).toContain("s.status = 'active'"); // status
    expect(p).toContain("s.is_sensitive"); // sensitive
    expect(p).toContain("p_as_of"); // as_of
    expect(p).toContain("c.embed_model = p_model"); // embed_model
  });

  it("uses the same default-space uuid as the application", () => {
    expect(blocks[0]).toContain(`'${KB_DEFAULT_SPACE_ID}'::uuid`);
  });

  it("removes the unfiltered 0051 signature instead of leaving it as an overload", () => {
    // That drop belongs to 0072, where the six-predicate pair replaced the original function.
    const k1 = readFileSync(
      path.join(path.dirname(PREDICATE_SOURCE), "0072_kb_versioning_and_retrieval_predicates.sql"),
      "utf8",
    );
    expect(k1).toContain("DROP FUNCTION IF EXISTS public.cs_match_chunks(uuid, vector, integer);");
  });

  it("drops the previous signatures before re-creating them", () => {
    // A changed RETURN shape requires a DROP — CREATE OR REPLACE cannot change one — and leaving
    // the old signature alive would mean two retrieval functions, one of which returns no
    // provenance at all.
    expect(sql).toContain("DROP FUNCTION IF EXISTS public.cs_match_chunks(uuid[], uuid[], uuid, timestamptz, text, vector, int);");
    expect(sql).toContain("DROP FUNCTION IF EXISTS public.cs_match_chunks_keyword(uuid[], uuid[], uuid, timestamptz, text, text, int);");
  });

  it("is still reading the migration that defines the live functions", () => {
    // The check above compares text in ONE file. A later migration could redefine either half with
    // CREATE OR REPLACE and this suite would stay green while the two halves diverge in the
    // database — which is precisely the leak this test exists to prevent. So: fail loudly and make
    // whoever writes that migration point PREDICATE_SOURCE at it.
    const dir = path.dirname(PREDICATE_SOURCE);
    const later = readdirSync(dir)
      .filter((f) => f.endsWith(".sql") && /^\d{4}/.test(f) && Number(f.slice(0, 4)) > 75)
      .filter((f) => readFileSync(path.join(dir, f), "utf8").includes("FUNCTION public.cs_match_chunks"));
    expect(later, `these migrations redefine the retrieval RPCs — update PREDICATE_SOURCE`).toEqual([]);
  });
});
