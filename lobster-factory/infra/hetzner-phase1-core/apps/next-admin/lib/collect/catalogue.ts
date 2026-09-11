// The source catalogue — what an operator can actually choose from, and whether it is usable here.
//
// Built from the registered blocks themselves (each declares `describe`), never from a hand-kept
// list: a separate "sources we support" array is a second place to forget, and the forgotten half is
// always the one a customer asks about.
//
// AVAILABILITY IS PART OF THE ANSWER. A source whose API key is missing must appear in the
// catalogue as present-but-unavailable, with the reason. Hiding it produces the worst version of
// this screen: the operator concludes the system cannot read academic papers, when in fact one
// environment variable is empty.

import type { CollectBlock, SourceDescriptor, SourceKind } from "@/lib/collect/types";
import { collectors } from "@/lib/collect/registry";

export interface CatalogueEntry extends SourceDescriptor {
  id: string;
  title: string;
  icon?: string;
  /** False when a required environment variable is missing; `missing` says which. */
  available: boolean;
  missing: string[];
}

export function describeBlock(
  block: CollectBlock,
  env: Record<string, string | undefined> = process.env,
): CatalogueEntry | null {
  if (!block.describe) return null;
  const missing = (block.describe.requires ?? []).filter((key) => !env[key]);
  // Any-of is satisfied by one key; only when NONE is set is the source unusable, and then all the
  // options are named so the operator can pick which account to open.
  const anyOf = block.describe.requiresAny ?? [];
  const anySatisfied = anyOf.length === 0 || anyOf.some((key) => Boolean(env[key]));
  const allMissing = anySatisfied ? missing : [...missing, ...anyOf];
  return {
    ...block.describe,
    id: block.id,
    title: block.title,
    icon: block.icon,
    available: missing.length === 0 && anySatisfied,
    missing: allMissing,
  };
}

/** Every operator-selectable source, in a stable order (kind first, then title). */
export function sourceCatalogue(env: Record<string, string | undefined> = process.env): CatalogueEntry[] {
  const order: SourceKind[] = ["web", "sitemap", "feed", "academic", "api", "video", "file", "rendered"];
  return collectors()
    .map((b) => describeBlock(b, env))
    .filter((e): e is CatalogueEntry => e !== null)
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.title.localeCompare(b.title));
}

/** One catalogue entry by block id. */
export function catalogueEntry(id: string, env: Record<string, string | undefined> = process.env): CatalogueEntry | null {
  const block = collectors().find((b) => b.id === id);
  return block ? describeBlock(block, env) : null;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

/**
 * Check one configured source against what its block declared.
 *
 * Refusing a bad configuration here is the difference between "this source was never set up
 * properly" and "this source silently collected nothing for six weeks" — and the second one is
 * indistinguishable from a site that simply stopped changing.
 */
export function validateSourceConfig(
  id: string,
  config: { entry?: string; options?: Record<string, unknown> },
  env: Record<string, string | undefined> = process.env,
): ValidationResult {
  const entry = catalogueEntry(id, env);
  if (!entry) return { ok: false, errors: [`unknown_source:${id}`] };

  const errors: string[] = [];
  if (!entry.available) errors.push(`unavailable:missing_${entry.missing.join(",")}`);

  const value = (config.entry ?? "").trim();
  if (!value) {
    errors.push(`missing_entry:${entry.entry}`);
  } else if (entry.entry === "url") {
    try {
      const u = new URL(value);
      if (u.protocol !== "https:" && u.protocol !== "http:") errors.push("entry_not_http");
    } catch {
      errors.push("entry_not_a_url");
    }
  }

  for (const opt of entry.options ?? []) {
    const given = config.options?.[opt.key];
    if (opt.required && (given === undefined || given === "")) {
      errors.push(`missing_option:${opt.key}`);
      continue;
    }
    if (given === undefined || given === "") continue;
    if (opt.type === "number" && Number.isNaN(Number(given))) errors.push(`option_not_a_number:${opt.key}`);
    if (opt.type === "boolean" && typeof given !== "boolean") errors.push(`option_not_a_boolean:${opt.key}`);
    if (opt.type === "select" && !(opt.choices ?? []).some((c) => c.value === given)) {
      errors.push(`option_not_a_choice:${opt.key}`);
    }
  }

  return { ok: errors.length === 0, errors };
}
