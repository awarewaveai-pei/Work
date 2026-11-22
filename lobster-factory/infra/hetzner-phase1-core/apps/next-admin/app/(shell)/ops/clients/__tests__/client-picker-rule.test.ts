// R10 (operator 2026-11-21): every page that picks a client uses the client block (OrgPicker.tsx: search + one row per
// client, first NAV_FIRST then server search). Enforced here: a file that gets a client list -- fetches a client-list
// endpoint, or reads a first page of organizations -- must hand it to the block (render <OrgPicker>/<OrgUrlPicker> or a
// component whose own file does), and a file that hands a list to the block (orgs={x}) may not .map that same x itself.
// Rule body: OrgPicker.tsx file header. Inventory: agency-os/handoffs/2026-11-16-video-unify-supervisor/R10-client-picker-inventory.md.
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { ROOT, posix, sources } from "@/lib/portal/__tests__/code-scan";

/** Where a client list comes from in page code (matched on space-joined tokens, see code()). */
const CLIENT_LISTS: readonly RegExp[] = [
  /\/api\/ops\/org-search/,
  /\/api\/video\/workbench\/bootstrap/,
  /\/api\/ops\/clients(?![\w/-])/,                                                   // the list route, not /api/ops/clients/<slug>/…
  /from\s*\(\s*["']organizations["']\s*\)[^;]*limit\s*\(\s*NAV_FIRST\s*\)/,         // a server page's first page of clients
];

/** Files that get a client list without being a picker, one reason each. Empty today: shrink, never grow it to quiet
 *  the test -- a new entry needs a reason a reviewer can check. */
const NOT_A_PICKER: Readonly<Record<string, string>> = {
  "app/video/(wb)/schedule/ScheduleWorkbench.tsx": "reads the current client's name for the empty-queue line (?first=1&include=); draws no menu",
  "app/(shell)/ops/clients/page.tsx": "reads the nav's first page of clients only to answer which of them have a content problem (loadClientProblems); lists the problem ones as links, no client menu (the layout's nav is the picker)",
};

/** The source's tokens without comments (a comment may name a route): the parsed tree's leaves, so a "/*" inside a
 *  string or regex stays what it is; JSDoc nodes are skipped. Joined with a space; the patterns allow it. */
function code(file: string, src: string): string {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const parts: string[] = [];
  const walk = (n: ts.Node) => {
    if (ts.isJSDoc(n)) return;
    const kids = n.getChildren(sf);
    if (kids.length) kids.forEach(walk);
    else parts.push(n.getText(sf));
  };
  walk(sf);
  return parts.join(" ");
}
const files = ["app", "components"].flatMap((d) => sources(path.join(ROOT, d)))
  .map((f) => ({ f: posix(f), src: code(f, readFileSync(f, "utf8")) }))
  .filter(({ f }) => !f.startsWith("app/api/") && !f.includes("/__tests__/") && !/\.test\.tsx?$/.test(f));

const rendersTag = (src: string, tag: string) => new RegExp(`<\\s*${tag}\\b`).test(src);

/** The block's tags, plus every component exported from a file that renders the block (ClientPanelNav, OrgSwitcher …). */
function blockTags(): Set<string> {
  const tags = new Set(["OrgPicker", "OrgUrlPicker"]);
  for (const { src } of files) {
    if (!rendersTag(src, "OrgPicker") && !rendersTag(src, "OrgUrlPicker")) continue;
    for (const m of src.matchAll(/export\s+(?:default\s+)?function\s+([A-Z]\w*)/g)) tags.add(m[1]);
  }
  return tags;
}

/** The list a file hands the block (`orgs={x}` / `orgs={a.b}` on a block tag), as space-free expressions. */
function handedLists(src: string, tags: Set<string>): string[] {
  const out: string[] = [];
  for (const t of tags) {
    for (const m of src.matchAll(new RegExp(`<\\s*${t}\\b[\\s\\S]{0,400}?\\borgs\\s*=\\s*\\{\\s*([\\w$]+(?:\\s*\\.\\s*[\\w$]+)*)\\s*\\}`, "g"))) out.push(m[1].replace(/\s+/g, ""));
  }
  return out;
}

/** A file that uses the block may not also draw that same list itself: the expression it hands as `orgs` is never
 *  `.map`ped in the file (the block draws the rows; one list, one drawing). */
const drawsBeside = (src: string, tags: Set<string>) => handedLists(src, tags).some((e) =>
  new RegExp(`${e.split(".").map((p) => p.replace(/\$/g, "\\$")).join("\\s*\\.\\s*")}\\s*\\.\\s*map\\s*\\(`).test(src));

function offenders(list: { f: string; src: string }[], tags: Set<string>): string[] {
  return list.filter(({ f, src }) => !(f in NOT_A_PICKER)
    && ((CLIENT_LISTS.some((re) => re.test(src)) && ![...tags].some((t) => rendersTag(src, t))) || drawsBeside(src, tags)))
    .map(({ f }) => f);
}

describe("R10 client picker rule", () => {
  const tags = blockTags();

  it("every file that gets a client list hands it to the client block", () => {
    expect(offenders(files, tags)).toEqual([]);
  });

  it("the whitelist names only files that still get a client list", () => {
    for (const f of Object.keys(NOT_A_PICKER)) expect(files.some((x) => x.f === f && CLIENT_LISTS.some((re) => re.test(x.src))), f).toBe(true);
  });

  it("catches a page that draws its own menu from the client list, also beside the block; a comment naming the route is not a fetch", () => {
    const f = "app/(shell)/x/page.tsx";
    const src = 'const g = "app/*"; fetch(`${base}/api/ops/clients`).then(r=>r.json()).then(j=>setOrgs(j.orgs)); const el = <div>{orgs.map(o=><button>{o.name}</button>)}</div>;';
    expect(offenders([{ f, src: code("x.tsx", src) }], tags)).toEqual([f]);
    // using the block does not excuse drawing the same list beside it
    expect(offenders([{ f, src: code("x.tsx", `${src} const p = <OrgPicker searchPath="/api/ops/org-search" onPick={(o) => go(o)} orgs={orgs} />;`) }], tags)).toEqual([f]);
    expect(offenders([{ f, src: code("x.tsx", 'fetch("/api/ops/org-search").then(r=>r.json()).then(j=>setOrgs(j.orgs)); const p = <OrgPicker orgs={first.orgs} />; const n = first.orgs.length;') }], tags)).toEqual([]);
    expect(offenders([{ f, src: code("x.tsx", 'const p = <OrgPicker orgs={first.orgs} />; const q = first.orgs.map((o) => <a>{o.name}</a>);') }], tags)).toEqual([f]);
    expect(offenders([{ f, src: code("x.tsx", "foo(); // see /api/ops/org-search\n") }], tags)).toEqual([]);
  });
});
