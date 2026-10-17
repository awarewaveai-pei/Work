// The mock is the spec (SOCIAL_MANAGER_PLAN.md C19 output f): every screen the mock can open (its data-view values) must
// be a view or a route of the product, and the top bar and the plan tabs must be the mock's, in its order and words.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { COMPOSE, PLAN_TABS, SECTIONS, VIEWS } from "../routes";

const MOCK = path.resolve(__dirname, "../../../../../../../../../docs/social/mockups/social-manager-mock.html");
const html = readFileSync(MOCK, "utf8");
const navOf = (id: string) => {
  const nav = html.match(new RegExp(`<nav [^>]*id="${id}"[^>]*>([\\s\\S]*?)</nav>`))?.[1] ?? "";
  return [...nav.matchAll(/data-view="([^"]+)"[^>]*>(?:<b>)?([^<]+)/g)].map((m) => ({ key: m[1], label: m[2] }));
};

describe("the product matches the mock's screens", () => {
  it("every data-view in the mock is a product view or route", () => {
    const mock = new Set([...html.matchAll(/data-view="([a-z]+)"/g)].map((m) => m[1]));
    expect(mock.size).toBeGreaterThan(10);   // the mock was read, not an empty file
    const product = new Set<string>([...VIEWS, ...SECTIONS.map((s) => s.key), COMPOSE]);
    expect([...mock].filter((v) => !product.has(v))).toEqual([]);
  });

  it("the top bar is the mock's six sections", () => {
    expect(SECTIONS.map(({ key, label }) => ({ key, label }))).toEqual(navOf("top"));
  });

  it("every section but the plan root has a page, on the staff path and on the product door", () => {
    const app = path.resolve(__dirname, "../../../..");
    const missing = SECTIONS.filter((s) => s.key !== "plan").flatMap((s) => ["(shell)/tools/social", "social"].map((root) => `${root}/(sections)/${s.key}/page.tsx`))
      .filter((p) => !existsSync(path.join(app, p)));
    expect(missing).toEqual([]);
  });

  it("貼文排程 has the mock's six tabs", () => {
    expect(PLAN_TABS.map(({ key, label }) => ({ key, label }))).toEqual(navOf("tabs"));
  });
});
