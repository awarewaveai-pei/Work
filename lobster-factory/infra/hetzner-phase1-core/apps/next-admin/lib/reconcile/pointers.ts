// Cross-product id reconciliation (lobster-factory/docs/operations/BACKUP_COVERAGE_PLAN.md B8).
//
// A pointer = an id this database stores for an object another product owns. Each check lists the ids
// we hold and the ids the owner says exist -- through its API, never its database (HCI ADR-0002) -- and
// reports those that point at nothing. After a restore the two sides come from dumps taken at different
// times (cognitive-db 02:17, supabase-db 02:30 UTC), so a project created in between dangles.
// backup-coverage-check.py calls /api/internal/reconcile daily; each check is one row there.
// Pointers not checked yet, and why: the B8 card.

import type { SupabaseClient } from "@supabase/supabase-js";
import { listAllIntegrations } from "@/lib/content/postiz";
import { isCognitiveOsConfigured, listCognitiveOsProjects } from "@/lib/cognitive-os/client";

export interface HeldPointer {
  where: string; // "<table> <row id>": where a person goes to fix it
  id: string;
}

export interface CheckResult {
  id: string;
  checked: number;
  dangling: HeldPointer[];
  error?: string;
}

interface PointerCheck {
  id: string;
  held(sb: SupabaseClient): Promise<HeldPointer[]>;
  live(): Promise<string[]>;
}

export function findDangling(held: HeldPointer[], live: Iterable<string>): HeldPointer[] {
  const ids = new Set(live);
  return held.filter((p) => !ids.has(p.id));
}

const PAGE = 1000; // PostgREST's default row cap: a single select would silently stop there

async function rows<T>(label: string, page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(`${label}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

export const CHECKS: PointerCheck[] = [
  {
    id: "postiz-integrations",
    async held(sb) {
      const list = await rows<{ id: string; postiz_integration_id: string }>("social_postiz_connections", (f, t) =>
        sb.from("social_postiz_connections").select("id, postiz_integration_id").order("id").range(f, t));
      return list.map((r) => ({ where: `social_postiz_connections ${r.id}`, id: r.postiz_integration_id }));
    },
    async live() {
      return (await listAllIntegrations()).map((i) => i.id);
    },
  },
  {
    id: "cognitive-os-projects",
    async held(sb) {
      const orgs = await rows<{ id: string; project: string }>("organizations", (f, t) =>
        sb.from("organizations").select("id, project:metadata->>cognitive_os_import_project_id")
          .not("metadata->>cognitive_os_import_project_id", "is", null).order("id").range(f, t));
      const out = orgs.map((r) => ({ where: `organizations ${r.id} metadata.cognitive_os_import_project_id`, id: r.project }));
      for (const table of ["cs_knowledge_sources", "cs_knowledge_folders"]) {
        const list = await rows<{ id: string; cognitive_os_project_id: string }>(table, (f, t) =>
          sb.from(table).select("id, cognitive_os_project_id").not("cognitive_os_project_id", "is", null).order("id").range(f, t));
        out.push(...list.map((r) => ({ where: `${table} ${r.id}`, id: r.cognitive_os_project_id })));
      }
      return out;
    },
    async live() {
      if (!isCognitiveOsConfigured()) throw new Error("Cognitive OS client not configured");
      const r = await listCognitiveOsProjects(); // the service identity's projects: the only ones this database points at
      if (r.ok === false) throw new Error(`Cognitive OS /projects: ${r.error}`); // `=== false`: strict is off, `!r.ok` does not narrow
      return r.value.map((p) => p.project_id);
    },
  },
];

/** Never throws: a check that cannot run is reported with its error, never as a clean pass. */
export async function runChecks(sb: SupabaseClient, checks: PointerCheck[] = CHECKS): Promise<CheckResult[]> {
  const out: CheckResult[] = [];
  for (const c of checks) {
    try {
      const held = await c.held(sb);
      out.push({ id: c.id, checked: held.length, dangling: findDangling(held, await c.live()) });
    } catch (e) {
      out.push({ id: c.id, checked: 0, dangling: [], error: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}
