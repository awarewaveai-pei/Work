import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { knownAddress, probe, RULES, ruleFor } from "./known-address";

// Every page address under app/(shell), as its route template ("/projects/[id]/govern"); route groups "(x)" are not in the address.
const SHELL = join(__dirname, "..", "app", "(shell)");
function pages(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return pages(join(dir, entry.name));
    if (entry.name !== "page.tsx") return [];
    const parts = relative(SHELL, dir).split(sep).filter((part) => part && !/^\(.*\)$/.test(part));
    return ["/" + parts.join("/")];
  });
}
// An address of the template: each [x] a made-up id, an optional catch-all left empty.
const sample = (template: string) => template.split("/").filter((part) => !part.startsWith("[[...")).map((part) => (part.startsWith("[") ? "made-up-id" : part)).join("/") || "/";

describe("known-address: every (shell) page with an id is decided before streaming", () => {
  it("a dynamic page falls under its own rule; a static page under none", () => {
    const all = pages(SHELL);
    expect(all.length).toBeGreaterThan(20);
    for (const template of all) {
      const found = ruleFor(sample(template));
      if (template.includes("[")) expect(found && template.startsWith(found.rule.route) ? template : `no rule for ${template}`).toBe(template);
      else expect(found ? `${found.rule.route} claims ${template}` : null).toBeNull();
    }
  });

  it("only the API's own not-found code says unknown: a missing route, an expired session, an error or no answer never makes a 404", async () => {
    const answer = (status: number, detail = "") => (async () => new Response(JSON.stringify({ detail }), { status })) as typeof fetch;
    const ask = (fetchImpl: typeof fetch) => probe("/projects/p", "", "PROJECT_NOT_FOUND", fetchImpl);
    expect(await ask(answer(200))).toBe(true);
    expect(await ask(answer(404, "PROJECT_NOT_FOUND: 'p'"))).toBe(false);
    expect(await ask(answer(404, "Not Found"))).toBeNull();   // no such route: COS_API_ORIGIN or the API version is off
    expect(await ask(answer(401))).toBeNull();
    expect(await ask(answer(503))).toBeNull();
    expect(await ask((async () => { throw new TypeError("fetch failed"); }) as typeof fetch)).toBeNull();
  });

  it("a static page's name is not an id at its own address only: /projects/new/<x> is a project route", () => {
    expect(ruleFor("/projects/new")).toBeNull();
    expect(ruleFor("/projects/new/act")?.rule.route).toBe("/projects/[id]");
  });

  it("no rule can hold a page load: a rule that never answers is null at the deadline", async () => {
    const rule = RULES.find((item) => item.route === "/learn/[id]")!;
    const kept = rule.known;
    rule.known = () => new Promise(() => undefined);   // the catalog API accepted the connection and went silent
    try {
      expect(await knownAddress("/learn/x", "", 20)).toBeNull();
    } finally {
      rule.known = kept;
    }
  });
});
