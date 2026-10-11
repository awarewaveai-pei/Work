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

/** Server-side only: the web container reaches the API directly (COS_API_ORIGIN), not through nginx. */
export async function loadCatalog(): Promise<Catalog> {
  const origin = process.env.COS_API_ORIGIN ?? "http://127.0.0.1:8420";
  // no Next data cache: the API caches the catalog and rebuilds it the moment a registry changes (mtime fingerprint)
  const response = await fetch(`${origin}/catalog`, { cache: "no-store" });
  if (!response.ok) throw new Error(`GET /catalog ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return (await response.json()) as Catalog;
}

/** A tool a person may be offered: not an engineering one (ENTRY_SLICE1_CHECKLIST.md item 5). Every list, count and
 *  recommendation a person sees goes through this or userGoals; a tool reached by its own address still opens. */
export const isUserTool = (catalog: Catalog, id: string): boolean => catalog.methods[id]?.block !== "INTERNAL";
export const userGoals = (catalog: Catalog): Goal[] => catalog.goals.filter((goal) => !goal.internal);
export const userToolCount = (catalog: Catalog): number => Object.keys(catalog.methods).filter((id) => isUserTool(catalog, id)).length;

/** tool id -> its name, for pages that show tools by id (next steps, 我的案子); without a catalog: none, the ids show. */
export function toolNames(catalog: Catalog | null): Record<string, string> {
  return catalog ? Object.fromEntries(Object.entries(catalog.methods).map(([key, method]) => [key, method.name_zh])) : {};
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
