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
 * The newest migration that defines `public.<fn>`, and its text.
 * Throws rather than returning null: a function nothing defines means the caller is checking a
 * name that no longer exists, which must fail loudly instead of vacuously passing.
 */
export function definerOf(fn: string): { file: string; sql: string } {
  const hits = migrationFiles().filter((f) =>
    new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\s*\\(`).test(readFileSync(path.join(MIGRATIONS_DIR, f), "utf8")),
  );
  if (hits.length === 0) throw new Error(`no migration defines public.${fn}`);
  const file = hits[hits.length - 1];
  return { file, sql: readFileSync(path.join(MIGRATIONS_DIR, file), "utf8") };
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
  const start = sql.search(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\s*\\(`));
  const blocks = predicateBlocks(sql.slice(start));
  if (blocks.length === 0) throw new Error(`${file} defines ${fn} with no KB_VISIBILITY_PREDICATE block`);
  return blocks[0];
}
