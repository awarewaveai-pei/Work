// Which migration currently defines a given function — computed, not remembered.
//
// The parity and schema-contract tests used to name a migration file in a constant, with a comment
// telling whoever wrote the next migration to update it. 0076 redefined one of the two retrieval
// functions and the reminder fired as designed — but a guard that needs hand-editing every time is
// a guard that will eventually be edited wrong, and the two halves of hybrid retrieval now live in
// different files (vector in 0075, keyword in 0076), so there is no single file to point at.

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

export const MIGRATIONS_DIR = path.resolve(
  __dirname,
  // __tests__ → kb → lib → next-admin → apps → hetzner-phase1-core → infra → lobster-factory
  "../../../../../../../packages/db/migrations",
);

/** Numbered migrations, oldest first. `*.down.sql` siblings are not migrations. */
export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{4}_.*\.sql$/.test(f) && !f.endsWith(".down.sql"))
    .sort();
}

/**
 * `CREATE FUNCTION` or `CREATE OR REPLACE FUNCTION` for the given name. Widened from
 * `CREATE OR REPLACE` only (the original form here) after a critic review pointed out that a
 * migration using plain `CREATE FUNCTION` — nothing stops one from doing that — would leave
 * `hits.length` at whatever it was before, silently: not zero (so the "no migration defines" guard
 * never fires), just stale. A guard that fails open on a spelling variant is worse than no guard,
 * because it still looks like it is checking something.
 */
export function creates(fn: string): RegExp {
  return new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\.${fn}\\s*\\(`);
}

/**
 * Pure core of `definerOf`, taking `{file, text}` pairs instead of reading the filesystem — so the
 * two paths that a hand-rolled regex-and-fs test would otherwise need real migration files to hit
 * (plain `CREATE FUNCTION`, and "dropped without a replacement") can be exercised with a two-line
 * fixture instead. `files` must already be oldest-first, the order `migrationFiles()` returns.
 */
export function findDefiner(fn: string, files: Array<{ file: string; text: string }>): { file: string; sql: string } {
  const createRe = creates(fn);
  const hits = files.filter((f) => createRe.test(f.text));
  if (hits.length === 0) throw new Error(`no migration defines public.${fn}`);
  const winner = hits[hits.length - 1];

  // A later migration that drops this function WITHOUT also re-creating it means the function no
  // longer exists in any real database; returning the stale file here would let a caller compare a
  // predicate that nothing live actually runs.
  const dropRe = new RegExp(`DROP FUNCTION[^;]*\\bpublic\\.${fn}\\s*\\(`);
  const winnerIdx = files.indexOf(winner);
  for (const later of files.slice(winnerIdx + 1)) {
    if (dropRe.test(later.text) && !createRe.test(later.text)) {
      throw new Error(`${later.file} drops public.${fn} without redefining it -- it no longer exists`);
    }
  }

  return { file: winner.file, sql: winner.text };
}

/**
 * The newest migration that defines `public.<fn>`, and its text.
 * Throws rather than returning null: a function nothing defines means the caller is checking a
 * name that no longer exists, which must fail loudly instead of vacuously passing.
 */
export function definerOf(fn: string): { file: string; sql: string } {
  const files = migrationFiles().map((file) => ({ file, text: readFileSync(path.join(MIGRATIONS_DIR, file), "utf8") }));
  return findDefiner(fn, files);
}

/** The visibility-predicate blocks inside one migration's text. */
export function predicateBlocks(sql: string): string[] {
  const re = /-- >>> KB_VISIBILITY_PREDICATE\r?\n([\s\S]*?)-- <<< KB_VISIBILITY_PREDICATE/g;
  return [...sql.matchAll(re)].map((m) => m[1]);
}

/**
 * The predicate block belonging to one function, in the migration that currently defines it.
 * A migration may define several functions, so the block is taken from the slice that starts at
 * this function's CREATE — taking the file's first block would silently compare the wrong one.
 */
export function predicateOf(fn: string): string {
  const { file, sql } = definerOf(fn);
  const start = sql.search(creates(fn));
  const blocks = predicateBlocks(sql.slice(start));
  if (blocks.length === 0) throw new Error(`${file} defines ${fn} with no KB_VISIBILITY_PREDICATE block`);
  return blocks[0];
}
