// Staff tools: the cells an owner ticks per employee (operator 2026-10-24; agency-os/handoffs/2026-10-24-staff-tool-grants).
// Every staff page and API belongs to one or more tools, or to every staff member (STAFF_PLATFORM); lib/portal/__tests__/
// staff-tools.test.ts fails a page or route that belongs to none. Cells come from the registry: one per product with
// staff pages, one per BACK_OFFICE / STAFF_UTILITIES page (an entry with `tool` shares that page's cell).
// Path patterns: "/a/b" covers itself and everything below it; "[x]" matches one segment; a trailing "$" = that path
// only. An API's tools = the products whose door serves it, plus the owners of the MOST specific STAFF_API_OWNERS
// pattern covering it (more segments wins; "$" beats a prefix of the same length). So a narrow row replaces a broad
// one: /api/ops/clients/[slug]/cs-knowledge is AI 客服's, not 客戶's. A product's API never gets a non-product owner
// here: a page calling another product's API needs that product ticked (staff-tools.test.ts NEEDS_OTHER_TOOL).
import { BACK_OFFICE, STAFF_UTILITIES, type StaffPage } from "./products";
import { PLATFORM_APIS, doorApis, nextAdminProducts } from "./doors";

export type StaffToolGroup = "product" | "utility" | "back_office";
// apis: a product cell's door APIs (its own and its dependsOn closure); staff-only APIs live in STAFF_API_OWNERS.
export interface StaffTool { key: string; name: string; group: StaffToolGroup; pages: readonly string[]; apis: readonly string[] }

/** Staff-only APIs (on no product door) and the tools whose pages call them. Door APIs come from the registry. */
export const STAFF_API_OWNERS: Readonly<Record<string, readonly string[]>> = {
  "/api/ops/clients": ["ops/clients"],
  "/api/ops/org-search": ["ops/clients", "design", "collect", "outreach", "ops/integrations"],   // names only: every client picker (OrgPicker.tsx)
  "/api/ops/clients/[slug]/collection-sources": ["collect"],
  "/api/ops/clients/[slug]/cognitive-os-import": ["collect"],
  "/api/ops/clients/[slug]/hci-import": ["collect"],
  "/api/ops/clients/[slug]/cs-config": ["cs"],
  "/api/ops/clients/[slug]/cs-eval-cases": ["cs"],
  "/api/ops/clients/[slug]/cs-intents": ["cs"],
  "/api/ops/clients/[slug]/cs-knowledge": ["cs"],
  "/api/ops/clients/[slug]/cs-knowledge-folders": ["cs"],
  "/api/ops/clients/[slug]/outreach-config": ["outreach"],
  "/api/ops/clients/[slug]/schedules": ["ops/schedules", "ops/clients"],
  "/api/ops/schedules": ["ops/schedules", "ops/clients"],
  "/api/cognitive-os/open": ["ops/clients", "collect", "cs"],
  "/api/ops/inbox": ["ops/inbox", "ops/repairs"],
  "/api/ops/repairs": ["ops/repairs", "ops/inbox"],
  "/api/ai": ["ops/inbox"],
  "/api/ops/approvals": ["ops/approvals"],
  "/api/ops/system-modes": ["ops/system-modes"],
  "/api/ops/integrations": ["ops/integrations"],
  "/api/ops/ai-image-jobs": ["ops-console"],
  "/api/ops/tenants": ["ops-console"],
  "/api/ops/workflow-runs": ["ops-console"],
  "/api/ops/audit-events": ["ops-console"],
  "/api/ops/organizations": ["onboard"],
  "/api/build/provision-services": ["onboard"],
  "/api/build/runs": ["build"],
  "/api/provision": ["build"],
  "/api/onboarding": ["ops/onboarding"],
  "/api/theme": ["tools/theme"],   // only the theme page calls it; POST changes every staff member's console
  "/api/tools/events/sync": ["content"],
  "/api/tools/publish": ["studio"],
  "/api/tools/printful": ["studio"],
  "/api/sentry-test": ["ops/repairs"],
  "/api/ops/staff": ["ops/staff"],
};

/** Pages and APIs every signed-in staff member may use, whatever is ticked. */
export const STAFF_PLATFORM: { pages: readonly string[]; apis: readonly string[] } = {
  pages: ["/$", "/no-access$"],   // /no-access: where the gate sends a page it refuses (a loop otherwise)
  apis: [...PLATFORM_APIS, "/api/ops/build-id", "/api/ops/analytics-context"],
};

/** The STAFF_API_OWNERS patterns that name `key`, as listed (toolsFor applies specificity). */
export const staffApisOf = (key: string): string[] =>
  Object.entries(STAFF_API_OWNERS).filter(([, keys]) => keys.includes(key)).map(([p]) => p);

function build(): StaffTool[] {
  const tools: StaffTool[] = [];
  for (const p of nextAdminProducts()) {
    if (p.staffPaths.length === 0) continue;
    const apis = doorApis(p).filter((a) => !PLATFORM_APIS.includes(a));
    tools.push({ key: p.key, name: p.name, group: "product", pages: [...new Set([...p.staffPaths.map((s) => `/${s}`), p.door.page])], apis });
  }
  for (const [group, table] of [["utility", STAFF_UTILITIES], ["back_office", BACK_OFFICE]] as const) {
    for (const [dir, page] of Object.entries(table) as Array<[string, StaffPage]>) {
      const key = page.tool ?? dir;
      const existing = tools.find((t) => t.key === key);
      if (existing) { (existing.pages as string[]).push(`/${dir}`); continue; }
      tools.push({ key, name: page.name, group, pages: [`/${dir}`], apis: [] });
    }
  }
  return tools;
}

/** Every cell, in the order the permission page shows them: products, then staff utilities, then back office. */
export const STAFF_TOOLS: readonly StaffTool[] = build();

const segs = (p: string) => p.split("/").filter(Boolean);
const bare = (pattern: string) => (pattern.endsWith("$") ? pattern.slice(0, -1) : pattern);

/** Does `pattern` cover `pathname` (see the header for the pattern rules)? */
export function covers(pattern: string, pathname: string): boolean {
  const exact = pattern.endsWith("$");
  const want = segs(bare(pattern));
  const have = segs(pathname.split(/[?#]/)[0]);
  if (exact ? have.length !== want.length : have.length < want.length) return false;
  return want.every((w, i) => (w.startsWith("[") && w.endsWith("]")) || w === have[i]);
}

const rank = (pattern: string) => segs(bare(pattern)).length * 2 + (pattern.endsWith("$") ? 1 : 0);

/** Which tools a staff path belongs to: "platform" (every staff member), the tool keys (any one of them suffices), or
 *  null when nothing claims it (the gate refuses it once enforced; the test keeps it from happening). */
export function toolsFor(pathname: string): "platform" | readonly string[] | null {
  const api = pathname === "/api" || pathname.startsWith("/api/");
  if ((api ? STAFF_PLATFORM.apis : STAFF_PLATFORM.pages).some((p) => covers(p, pathname))) return "platform";
  if (!api) {
    const keys = STAFF_TOOLS.filter((t) => t.pages.some((p) => covers(p, pathname))).map((t) => t.key);
    return keys.length ? keys : null;
  }
  const keys = new Set(STAFF_TOOLS.filter((t) => t.apis.some((p) => covers(p, pathname))).map((t) => t.key));
  const best = Object.keys(STAFF_API_OWNERS).filter((p) => covers(p, pathname)).sort((a, b) => rank(b) - rank(a))[0];
  for (const k of best ? STAFF_API_OWNERS[best] : []) keys.add(k);
  return keys.size ? [...keys] : null;
}
