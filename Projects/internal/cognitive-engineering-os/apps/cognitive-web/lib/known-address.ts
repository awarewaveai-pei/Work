import { loadCatalog, toolOf } from "./catalog";
import { lessonOf } from "./lessons";
import { DEMO_FIXTURES, DEMOS, type DemoEntry } from "./toolsheets.generated";

// Whether an address under app/(shell) names something that exists, asked by middleware.ts BEFORE the page renders:
// (shell)/loading.tsx starts the response streaming, so a page's own notFound() still shows the not-found content but can
// no longer change the status from 200 (crawlers, caches and monitors then keep it as a real page). Each rule asks exactly
// what its page reads -- the same function, or the API's existence check for the same thing with the visitor's cookie
// (GET /exists/<kind>/<id>, blocks/exists.py: the read route's own guard, without reading the case). true = it exists; false = it
// does not (the middleware answers 404 and the page still renders its own not-found content); null = cannot tell here (API
// down or slow, the session not accepted, an address with no rule): the page decides, status as before.
// known-address.test.ts fails while a dynamic page under (shell) has no rule, or a rule would claim a static page.
export type Known = boolean | null;
type Params = Record<string, string[]>;
type Rule = { route: string; below?: boolean; except?: Record<string, string[]>; known: (params: Params, cookie: string) => Promise<Known> };

const DECIDE_TIMEOUT_MS = 800;   // every page load waits on this (the /exists check is one indexed lookup); past it the page answers as before

/** The demo a /projects/demo/<method>[/<domain>] address shows (the page and the rule ask this one function): no domain =
 *  the default domain's page, one domain = that domain's page; anything else, or a DEMOS entry without its fixture, = none. */
export function demoOf(method: string, domain: string[] = []): { entry: DemoEntry; load: () => Promise<{ default: unknown }> } | null {
  const base = `/projects/demo/${method}`;
  const list = Object.hasOwn(DEMOS, method) ? DEMOS[method] : [];
  const entry = list.find((item) => (domain.length === 1 ? item.domain === domain[0] && item.href !== base : !domain.length && item.href === base));
  const key = entry && `${method}.${entry.domain}`;
  return entry && key && Object.hasOwn(DEMO_FIXTURES, key) ? { entry, load: DEMO_FIXTURES[key] } : null;
}

/** GET <API>path with the visitor's cookie: a 404 carrying the API's own "no such record" code (`missing`, the prefix of its
 *  detail) = not there (or not theirs: the API answers the same to anyone else), 2xx = there; anything else (a bare 404 = no
 *  such route, i.e. COS_API_ORIGIN or the API version is off; 401 expired session; 5xx; timeout; unreachable) = cannot tell. */
export async function probe(path: string, cookie: string, missing: string, fetchImpl: typeof fetch = fetch): Promise<Known> {
  const origin = process.env.COS_API_ORIGIN ?? "http://127.0.0.1:8420";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DECIDE_TIMEOUT_MS);   // frees the connection; knownAddress bounds the wait
  try {
    const response = await fetchImpl(`${origin}${path}`, { cache: "no-store", headers: { cookie }, signal: controller.signal });
    if (response.status !== 404) {
      await response.body?.cancel();
      return response.ok ? true : null;
    }
    const detail = ((await response.json().catch(() => ({}))) as { detail?: unknown }).detail;
    return typeof detail === "string" && detail.startsWith(`${missing}:`) ? false : null;
  } catch {
    return null;   // the API is unreachable or slow: the page answers as it always did
  } finally {
    clearTimeout(timer);
  }
}

const one = (params: Params, name: string) => encodeURIComponent(params[name][0]);

// Order matters where Next's own does: a static folder wins over a [dynamic] sibling (projects/demo before projects/[id];
// /projects/new is a page of its own; /projects/new/<x> is not, Next gives it to projects/[id] -- so `except` holds only for
// the rule's exact address).
export const RULES: Rule[] = [
  { route: "/methods/[id]", known: async ({ id }) => { const catalog = await loadCatalog().catch(() => null); return catalog ? toolOf(catalog, id[0]) !== null : null; } },
  { route: "/methods/[id]/run", known: (params, cookie) => probe(`/exists/method/${one(params, "id")}`, cookie, "METHOD_RESOLUTION_BLOCKED") },   // RunPage reads the tool's form
  { route: "/learn/workflow/[id]", known: async ({ id }) => lessonOf(id[0], "workflow") !== null },
  { route: "/learn/[id]", known: async ({ id }) => lessonOf(id[0], "tool") !== null },
  { route: "/projects/demo/[method]/[[...domain]]", known: async ({ method, domain }) => demoOf(method[0], domain) !== null },
  { route: "/projects/[id]/analyses/[analysis]", known: (params, cookie) => probe(`/exists/interpretation/${one(params, "analysis")}`, cookie, "INTERPRETATION_NOT_FOUND") },   // AnalysisPage reads the analysis alone
  { route: "/projects/[id]", below: true, except: { id: ["new"] }, known: (params, cookie) => probe(`/exists/project/${one(params, "id")}`, cookie, "PROJECT_NOT_FOUND") },
  { route: "/groups/[id]", below: true, known: (params, cookie) => probe(`/exists/group/${one(params, "id")}`, cookie, "GROUP_NOT_FOUND") },
];

/** The parameters `route` takes from the decoded path segments `parts`, or null when it is not this route's address. */
function match(rule: Rule, parts: string[]): Params | null {
  const segments = rule.route.split("/").filter(Boolean);
  const params: Params = {};
  for (let i = 0; i < segments.length; i++) {
    const rest = /^\[\[\.\.\.(.+)\]\]$/.exec(segments[i]);
    if (rest) return { ...params, [rest[1]]: parts.slice(i) };
    if (i >= parts.length) return null;
    const name = /^\[(.+)\]$/.exec(segments[i])?.[1];
    if (name && parts.length === segments.length && rule.except?.[name]?.includes(parts[i])) return null;
    if (name) params[name] = [parts[i]];
    else if (segments[i] !== parts[i]) return null;
  }
  return parts.length === segments.length || rule.below ? params : null;
}

/** The rule an address falls under and its parameters (the pages decode their params the same way), or null. */
export function ruleFor(pathname: string): { rule: Rule; params: Params } | null {
  let parts: string[];
  try {
    parts = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  } catch {
    return null;   // a malformed %-escape: no page can name anything by it; Next answers it itself
  }
  for (const rule of RULES) {
    const params = match(rule, parts);
    if (params) return { rule, params };
  }
  return null;
}

/** The answer for an address, bounded for every rule (the catalog loader has no deadline of its own): too slow = null. */
export async function knownAddress(pathname: string, cookie: string, timeoutMs = DECIDE_TIMEOUT_MS): Promise<Known> {
  const found = ruleFor(pathname);
  if (!found) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), timeoutMs); });
  try {
    return await Promise.race([found.rule.known(found.params, cookie).catch(() => null), late]);
  } finally {
    clearTimeout(timer);
  }
}
