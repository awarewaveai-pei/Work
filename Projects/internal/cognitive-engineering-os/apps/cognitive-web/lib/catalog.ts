// The display catalog (API GET /catalog = ai_lego/platform/catalog/display_catalog.py, the loader the mocks are
// checked with) and the pure helpers the pages list tools and workflows with. Mirrors docs/mockups/mockkit.py's
// renderers (only the result page has a rendered-HTML gate so far, check-mocks.py --page result; the rest: TASKS).

// block: the block the tool belongs to (blocks.FAMILY_BLOCK, sent by the API); "INTERNAL" = engineering, never in a
// person's menu. internal: the goal holds only such tools. The web keeps no copy of the family -> block map.
export type Method = { name_zh: string; name_en: string; abbr?: string | null; blurb_zh: string; url?: string; family: string; block: string; goal: string; next: string[] };
export type Goal = { id: string; title_zh: string; short_zh: string; blurb_zh: string; icon: string; families: string[]; featured: string[]; internal: boolean };
export type Popular = { id: string; shape: string; line_zh: string };
export type Recipe = { id: string; name: string; steps: string[]; audience: "user" | "internal"; goal: string; name_zh: string; blurb_zh: string };
export type Family = { name_zh: string; name_en: string; blurb_zh: string };
export type Catalog = {
  counts: { tools: number; user_workflows: number; internal_workflows: number };
  methods: Record<string, Method>;
  families: Record<string, Family>;
  goals: Goal[];
  popular: Popular[];
  prompts: string[];
  recipes: Recipe[];
  glyphs: Record<string, string>;
  shapes: Record<string, string>;
};

/** The kept copy: the parsed catalog, the API's ETag for it, when it was last confirmed current. One per web process. */
type Kept = { etag: string; catalog: Catalog; checkedAt: number };
export const CATALOG_RECHECK_MS = 2000;   // same rhythm as the API's own fingerprint recheck (main.py _CATALOG_RECHECK_SECONDS): a registry edit shows within it

/** A loader that parses the 392 KB catalog once and then asks the API only "still this one?" (If-None-Match -> 304), at most
 *  every CATALOG_RECHECK_MS and with one question in flight at a time -- a page render used to download and parse it every time
 *  (1000 people's navigations = ~390 MB/s of JSON). A failed recheck serves the kept copy and waits out one window before asking again: the registry is static content,
 *  a blip must not blank every page, and a down API must not be asked once per render; with nothing kept the error still reaches the page. fetchImpl/now are injected for the test. */
export function makeCatalogLoader(fetchImpl: typeof fetch = fetch, now: () => number = Date.now) {
  let kept: Kept | null = null;
  let asking: Promise<Catalog> | null = null;
  async function ask(): Promise<Catalog> {
    const origin = process.env.COS_API_ORIGIN ?? "http://127.0.0.1:8420";
    // cache: "no-store" keeps Next's data cache out; the freshness check is the ETag above
    const response = await fetchImpl(`${origin}/catalog`, { cache: "no-store", headers: kept ? { "If-None-Match": kept.etag } : {} });
    if (response.status === 304 && kept) {
      kept = { ...kept, checkedAt: now() };
      return kept.catalog;
    }
    if (!response.ok) throw new Error(`GET /catalog ${response.status}: ${(await response.text()).slice(0, 300)}`);
    const catalog = (await response.json()) as Catalog;
    const etag = response.headers.get("etag");
    kept = etag ? { etag, catalog, checkedAt: now() } : null;   // no ETag (an older API): nothing to revalidate with, fetch every time
    return catalog;
  }
  return async function load(): Promise<Catalog> {
    if (kept && now() - kept.checkedAt < CATALOG_RECHECK_MS) return kept.catalog;
    if (!asking) {
      const held = kept;
      asking = ask().catch((error) => {
        if (held && kept === held) { kept = { ...held, checkedAt: now() }; return held.catalog; }   // serve it, and do not ask again for one window
        throw error;
      }).finally(() => { asking = null; });
    }
    return asking;
  };
}

/** Server-side only: the web container reaches the API directly (COS_API_ORIGIN), not through nginx. */
export const loadCatalog: () => Promise<Catalog> = makeCatalogLoader();

/** A tool a person may be offered: not an engineering one (ENTRY_SLICE1_CHECKLIST.md item 5). Every list, count and
 *  recommendation a person sees goes through this or userGoals; a tool reached by its own address still opens. */
export const isUserTool = (catalog: Catalog, id: string): boolean => catalog.methods[id]?.block !== "INTERNAL";

/** What 先說你卡在哪 (components/StuckBox) reads, and all the browser gets of the catalog there: the example situations
 *  and each tool a person may be offered, with only the words it is matched on (B8: the whole catalog, ~384 KB, went to
 *  the browser on every 直接分析). Built on the server; a field StuckBox starts reading is added here, not the catalog. */
export type StuckTool = { id: string; name_zh: string; name_en: string; blurb_zh: string };
export type StuckCatalog = { prompts: string[]; tools: StuckTool[] };
export const stuckCatalog = (catalog: Catalog): StuckCatalog => ({
  prompts: catalog.prompts,
  tools: Object.entries(catalog.methods).filter(([id]) => isUserTool(catalog, id)).map(([id, m]) => ({ id, name_zh: m.name_zh, name_en: m.name_en, blurb_zh: m.blurb_zh })),
});
export const userGoals = (catalog: Catalog): Goal[] => catalog.goals.filter((goal) => !goal.internal);
export const userToolCount = (catalog: Catalog): number => Object.keys(catalog.methods).filter((id) => isUserTool(catalog, id)).length;

/** tool id -> its name, for pages that show tools by id (next steps, 我的案子); without a catalog: none (toolLabel then says so). */
export function toolNames(catalog: Catalog | null): Record<string, string> {
  return catalog ? Object.fromEntries(Object.entries(catalog.methods).map(([key, method]) => [key, method.name_zh])) : {};
}

const METHOD_ID_SHAPE = /^[a-z][a-z0-9_]*\.[a-z0-9_.]+$/;   // framing.problem_statement
/** What a person reads for a tool id or a lesson subject: the tool's Chinese name; a subject that is not an id (a package
 *  name) as it is; an id the catalog does not know is never shown (walk 2026-10-12 W16). */
export function toolLabel(names: Record<string, string>, id: string): string {
  return names[id] ?? (METHOD_ID_SHAPE.test(id) ? "（找不到名稱的工具）" : id);
}

export const ICEBERG_ID = "systems.iceberg_model";   // the one tool whose form fields are its layers (docs/mockups/iceberg-result-mock.html)

/** The family a tool belongs to, as the mock's tool line writes it: 系統思考 Systems Thinking; null without a catalog. */
export function familyLabel(catalog: Catalog | null, id: string): string | null {
  const family = catalog?.families?.[id.split(".")[0]];
  return family ? `${family.name_zh} ${family.name_en}` : null;
}
/** tool id -> its family label, for pages that learn the tool only in the browser. */
export function familyLabels(catalog: Catalog | null): Record<string, string> {
  return catalog ? Object.fromEntries(Object.keys(catalog.methods).flatMap((id) => { const label = familyLabel(catalog, id); return label ? [[id, label]] : []; })) : {};
}

/** The tool's own page; with a project, its 開始 button carries the project through (N-22: 先看它做什麼 must not drop it). */
export const toolHref = (id: string, project?: string) => `/methods/${encodeURIComponent(id)}${project ? `?project=${encodeURIComponent(project)}` : ""}`;
/** The run page; with a project, the analysis goes into that project instead of a new one. */
export const runHref = (id: string, project?: string) => `/methods/${encodeURIComponent(id)}/run${project ? `?project=${encodeURIComponent(project)}` : ""}`;
export const projectHref = (id: string) => `/projects/${encodeURIComponent(id)}`;
export const analysisHref = (project: string, analysis: string) => `${projectHref(project)}/analyses/${encodeURIComponent(analysis)}`;
/** Two analyses of one project side by side (到期重跑並比較). */
export const compareHref = (project: string, a: string, b: string) => `${projectHref(project)}/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`;
export const dirHref = (goalId: string) => `/methods#dir-${goalId}`;
export const workflowHref = (id: string) => `/workflows#wf-${id}`;

/** The tools of a goal, in catalog order (mockkit: every method whose family the goal lists). */
export function toolsOfGoal(catalog: Catalog, goal: Goal): string[] {
  return Object.keys(catalog.methods).filter((id) => goal.families.includes(id.split(".")[0]));
}

export function goalOf(catalog: Catalog, id: string): Goal {
  const found = catalog.goals.find((goal) => goal.id === catalog.methods[id]?.goal);
  if (!found) throw new Error(`method ${id} has no goal in the catalog`);
  return found;
}

/** The abbreviation beside a name, unless the name already says it (no "SCAMPER SCAMPER"). */
export function shownAbbr(method: Method): string {
  const abbr = method.abbr ?? "";
  return abbr && !method.name_zh.includes(abbr) && abbr !== method.name_en ? abbr : "";
}

/** Lower-cased search key of a tool row (mockkit render_directory data-q). */
export function toolSearchKey(id: string, method: Method): string {
  return [method.name_zh, method.name_en, method.abbr, id, method.blurb_zh].filter(Boolean).join(" ").toLowerCase();
}

/** Stations of a workflow: a tool id, or a run of capability steps collapsed into one count (mockkit _stations). */
export type Station = { tool: string } | { capabilities: number };
export function stations(steps: string[]): Station[] {
  const out: Station[] = [];
  let run = 0;
  for (const step of [...steps, null]) {
    if (step === "capability") { run += 1; continue; }
    if (run) { out.push({ capabilities: run }); run = 0; }
    if (step !== null) out.push({ tool: step });
  }
  return out;
}
