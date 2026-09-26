// The one shape of a research collection run request (RESEARCH_LINES_MASTER_PLAN §12.7 I-a; the Trigger payload I-b
// and the execute body I-c are the same object). Shared by runs/route.ts and runs/execute/route.ts so the two hops
// cannot drift.
//
// A whitelist, not a blacklist: only these five keys pass. A grant token or a Cognitive OS address in the body is
// refused by construction -- the token must never enter a Trigger payload (plan K3) and the COS address comes from
// this server's env only (plan K5).

import type { SeedInput } from "@/lib/collect/orchestrator";

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
    if (!isPlainObject(seed) || typeof seed.uri !== "string") return { ok: false, error: "seed_invalid" };
    if (!seed.uri.startsWith("entity://") && !seed.uri.startsWith("https://")) return { ok: false, error: "seed_scheme_invalid" };
    if (Object.keys(seed).some((k) => k !== "uri" && k !== "meta")) return { ok: false, error: "seed_invalid" };
    const meta = seed.meta;
    if (meta === undefined) {
      cleanSeeds.push({ uri: seed.uri });
      continue;
    }
    if (!isPlainObject(meta) || Buffer.byteLength(JSON.stringify(meta), "utf8") > MAX_META_BYTES) return { ok: false, error: "seed_meta_invalid" };
    cleanSeeds.push({ uri: seed.uri, meta });
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
