// The one shape of a research collection run request (RESEARCH_LINES_MASTER_PLAN §12.7 I-a; the Trigger payload I-b
// and the execute body I-c are the same object). Shared by runs/route.ts and runs/execute/route.ts so the two hops
// cannot drift.
//
// A whitelist, not a blacklist: only these five keys pass. A grant token or a Cognitive OS address in the body is
// refused by construction -- the token must never enter a Trigger payload (plan K3) and the COS address comes from
// this server's env only (plan K5).

import type { SeedInput } from "@/lib/collect/orchestrator";
import { CLAIM_PROVIDERS } from "@/lib/collect/search/drivers";
import { CLAIM_ANGLES } from "@/lib/collect/search/query-plan";

/**
 * Exactly the two seed shapes of the collector wire v2 (Projects/internal/cognitive-engineering-os/specs/wire/
 * collector.v2.json seed_shapes, = the engine's _research_seeds): a claim, or an https URL with no meta or only
 * `pasted`. A name seed would reach the dossier's name search, which honours COLLECT_SEARCH_PROVIDER; a claim never
 * does — so a research run only ever searches the claim's own engines. Extra meta would be copied onto every page.
 */
function seedError(seed: { uri: string; meta?: unknown }): string | null {
  const meta = seed.meta;
  if (seed.uri.startsWith("https://")) {
    if (meta === undefined) return null;
    return isPlainObject(meta) && Object.keys(meta).join() === "pasted" && typeof meta.pasted === "boolean" ? null : "seed_meta_invalid";
  }
  if (!/^entity:\/\/claim\/[A-Za-z0-9_-]{1,64}$/.test(seed.uri)) return "seed_scheme_invalid";
  if (!isPlainObject(meta) || Buffer.byteLength(JSON.stringify(meta), "utf8") > MAX_META_BYTES) return "seed_meta_invalid";
  const keys = Object.keys(meta).sort().join();
  if (keys !== "angles,entityName,kind,languages,providers" || meta.kind !== "claim") return "seed_meta_invalid";
  if (typeof meta.entityName !== "string" || !meta.entityName.trim() || meta.entityName.length > 200) return "seed_meta_invalid";
  const lists: Array<[unknown, readonly string[]]> = [
    [meta.angles, CLAIM_ANGLES.map((a) => a.id)],
    [meta.languages, ["zh", "en"]],
    [meta.providers, CLAIM_PROVIDERS],
  ];
  for (const [values, allowed] of lists) {
    if (!Array.isArray(values) || !values.length || new Set(values).size !== values.length) return "seed_meta_invalid";
    if (!values.every((v) => typeof v === "string" && allowed.includes(v))) return "seed_meta_invalid";
  }
  return null;
}

export interface ResearchRunRequest {
  grant_ref: string;
  project_id: string;
  run_id: string;
  seeds: Array<Pick<SeedInput, "uri" | "meta">>;
  budget: { fetches: number };
}

const KEYS = new Set(["grant_ref", "project_id", "run_id", "seeds", "budget"]);
const GRANT_REF = /^[A-Za-z0-9_-]{8,128}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RUN_ID = /^[A-Za-z0-9_-]{1,80}$/; // = COS run_id rule
export const MAX_SEEDS = 10;
export const MAX_FETCHES = 200; // = lib/collect/run.ts DEFAULT_BUDGET.fetches
const MAX_META_BYTES = 4096;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function parseResearchRunRequest(body: unknown): { ok: true; value: ResearchRunRequest } | { ok: false; error: string } {
  if (!isPlainObject(body)) return { ok: false, error: "body_not_object" };
  const extra = Object.keys(body).filter((k) => !KEYS.has(k));
  if (extra.length) return { ok: false, error: `unexpected_keys:${extra.join(",")}` };
  const { grant_ref, project_id, run_id, seeds, budget } = body;
  if (typeof grant_ref !== "string" || !GRANT_REF.test(grant_ref)) return { ok: false, error: "grant_ref_invalid" };
  if (typeof project_id !== "string" || !UUID.test(project_id)) return { ok: false, error: "project_id_invalid" };
  if (typeof run_id !== "string" || !RUN_ID.test(run_id)) return { ok: false, error: "run_id_invalid" };
  if (!Array.isArray(seeds) || seeds.length < 1 || seeds.length > MAX_SEEDS) return { ok: false, error: "seeds_count_invalid" };
  const cleanSeeds: ResearchRunRequest["seeds"] = [];
  for (const seed of seeds) {
    if (!isPlainObject(seed) || typeof seed.uri !== "string" || seed.uri.length > 2048) return { ok: false, error: "seed_invalid" };
    if (Object.keys(seed).some((k) => k !== "uri" && k !== "meta")) return { ok: false, error: "seed_invalid" };
    if (cleanSeeds.some((kept) => kept.uri === seed.uri)) return { ok: false, error: "seed_repeated" };
    const error = seedError(seed as { uri: string; meta?: unknown });
    if (error) return { ok: false, error };
    cleanSeeds.push(seed.meta === undefined ? { uri: seed.uri } : { uri: seed.uri, meta: seed.meta as Record<string, unknown> });
  }
  let fetches = MAX_FETCHES;
  if (budget !== undefined) {
    if (!isPlainObject(budget) || Object.keys(budget).some((k) => k !== "fetches")) return { ok: false, error: "budget_invalid" };
    const f = budget.fetches;
    if (typeof f !== "number" || !Number.isInteger(f) || f < 1 || f > MAX_FETCHES) return { ok: false, error: "budget_invalid" };
    fetches = f;
  }
  return { ok: true, value: { grant_ref, project_id, run_id, seeds: cleanSeeds, budget: { fetches } } };
}
