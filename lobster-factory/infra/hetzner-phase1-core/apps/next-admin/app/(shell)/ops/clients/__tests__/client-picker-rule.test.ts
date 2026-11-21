// R10 (operator 2026-11-21): every page that picks a client uses the client block (OrgPicker.tsx: search + one row per
// client, first NAV_FIRST then server search). Enforced here: a file that gets a client list -- fetches a client-list
// endpoint, or reads a first page of organizations -- must hand it to the block (render <OrgPicker>/<OrgUrlPicker> or a
// component whose own file does). Anything else drawing its own client menu from that list is red.
// Rule body: OrgPicker.tsx file header. Inventory: agency-os/handoffs/2026-11-16-video-unify-supervisor/R10-client-picker-inventory.md.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT, posix, sources } from "@/lib/portal/__tests__/code-scan";

/** Where a client list comes from in page code. */
const CLIENT_LISTS: readonly RegExp[] = [
  /\/api\/ops\/org-search/,
  /\/api\/video\/workbench\/bootstrap/,
  /["'`]\/api\/ops\/clients["'`?]/,                                     // the list route itself, not /api/ops/clients/<slug>/…
  /from\(\s*["']organizations["']\s*\)[^;]*limit\(\s*NAV_FIRST\s*\)/,   // a server page's first page of clients ([^;] spans lines)
];

/** Files that get a client list without being a picker, one reason each. Empty today: shrink, never grow it to quiet
 *  the test -- a new entry needs a reason a reviewer can check. */
const NOT_A_PICKER: Readonly<Record<string, string>> = {};

const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const files = ["app", "components"].flatMap((d) => sources(path.join(ROOT, d)))
  .map((f) => ({ f: posix(f), src: code(readFileSync(f, "utf8")) }))
  .filter(({ f }) => !f.startsWith("app/api/") && !f.includes("/__tests__/") && !/\.test\.tsx?$/.test(f));

/** The block's tags, plus every component exported from a file that renders the block (ClientPanelNav, OrgSwitcher …). */
function blockTags(): Set<string> {
  const tags = new Set(["OrgPicker", "OrgUrlPicker"]);
  for (const { src } of files) {
    if (!/<(OrgPicker|OrgUrlPicker)\b/.test(src)) continue;
    for (const m of src.matchAll(/export\s+(?:default\s+)?function\s+([A-Z]\w*)/g)) tags.add(m[1]);
  }
  return tags;
}

export function offenders(list: { f: string; src: string }[], tags: Set<string>): string[] {
  const renders = (src: string) => [...tags].some((t) => new RegExp(`<${t}\\b`).test(src));
  return list.filter(({ f, src }) => !(f in NOT_A_PICKER) && CLIENT_LISTS.some((re) => re.test(src)) && !renders(src)).map(({ f }) => f);
}

describe("R10 client picker rule", () => {
  const tags = blockTags();

  it("every file that gets a client list hands it to the client block", () => {
    expect(offenders(files, tags)).toEqual([]);
  });

  it("the whitelist names only files that still get a client list", () => {
    for (const f of Object.keys(NOT_A_PICKER)) expect(files.some((x) => x.f === f && CLIENT_LISTS.some((re) => re.test(x.src))), f).toBe(true);
  });

  it("catches a page that draws its own menu from the client list", () => {
    const page = { f: "app/(shell)/x/page.tsx", src: 'fetch("/api/ops/org-search").then(r=>r.json()).then(j=>setOrgs(j.orgs));\n{orgs.map(o=><button>{o.name}</button>)}' };
    expect(offenders([page], tags)).toEqual(["app/(shell)/x/page.tsx"]);
    expect(offenders([{ ...page, src: `${page.src}<OrgPicker orgs={orgs} />` }], tags)).toEqual([]);
  });
});
