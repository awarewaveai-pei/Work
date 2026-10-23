import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { DEFAULT_SECTIONS, applyLayout, itemKey } from "../SidebarNav";

// A built page nobody can click to is a page nobody uses: every static page under app/(shell) is
// linked from the sidebar, or listed here with the page that links to it.
const REACHED_ELSEWHERE: Record<string, string> = {
  "/outreach/settings/service-profiles": "tab of /outreach/settings",
  "/outreach/settings/suppression": "tab of /outreach/settings",
  "/tools/social/ads": "social app side nav (tools/social/routes.ts)",
  "/tools/social/analytics": "social app side nav (tools/social/routes.ts)",
  "/tools/social/compose/new": "social app compose button",
  "/tools/social/inbox": "social app side nav (tools/social/routes.ts)",
  "/tools/social/reporting": "social app side nav (tools/social/routes.ts)",
  "/tools/social/smartlinks": "social app side nav (tools/social/routes.ts)",
};

const SHELL = path.resolve(__dirname, "../(shell)");

function staticPages(dir: string, route: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isFile() && e.name === "page.tsx") out.push(route || "/");
    if (!e.isDirectory() || e.name.startsWith("[") || e.name === "__tests__") continue;
    const seg = e.name.startsWith("(") ? "" : `/${e.name}`; // route groups add no path segment
    out.push(...staticPages(path.join(dir, e.name), route + seg));
  }
  return out;
}

const linked = DEFAULT_SECTIONS.flatMap((s) => s.items.filter((i) => i.type === "link").map((i) => itemKey(i)));

describe("sidebar coverage", () => {
  it("every static (shell) page is in the sidebar or reached from a named page", () => {
    const orphans = staticPages(SHELL, "").filter((p) => !linked.includes(p) && !(p in REACHED_ELSEWHERE));
    expect(orphans).toEqual([]);
  });

  it("every sidebar link and allowlist entry is a page that exists", () => {
    const pages = new Set(staticPages(SHELL, ""));
    expect(linked.filter((h) => !pages.has(h))).toEqual([]);
    expect(Object.keys(REACHED_ELSEWHERE).filter((h) => !pages.has(h))).toEqual([]);
  });

  it("a saved order from an older sidebar shape is ignored; one saved against this shape applies", () => {
    // shape of the app_theme row saved before the 2026-10-23 regroup
    const stale = {
      sectionOrder: ["overview", "content-tools", "cold-outreach", "customer-service", "system", "knowledge-data", "build-onboard", "clients-ops", "repair-control", "external"],
      itemOrders: { "repair-control": ["/ops/repairs", "/ops/approvals", "/ops/system-modes"] },
    };
    expect(applyLayout(DEFAULT_SECTIONS, stale)).toEqual(DEFAULT_SECTIONS);

    const ids = DEFAULT_SECTIONS.map((s) => s.id).reverse();
    const ext = DEFAULT_SECTIONS.find((s) => s.id === "external")!.items.map((i) => itemKey(i)).reverse();
    const out = applyLayout(DEFAULT_SECTIONS, { sectionOrder: ids, itemOrders: { external: ext } });
    expect(out.map((s) => s.id)).toEqual(ids);
    expect(out[0].items.map((i) => itemKey(i))).toEqual(ext);

    // a dragged disabled item keeps its key, so a section holding one round-trips too
    const design = DEFAULT_SECTIONS.find((s) => s.id === "design-studio")!.items.map(itemKey).reverse();
    const out2 = applyLayout(DEFAULT_SECTIONS, { itemOrders: { "design-studio": design } });
    expect(out2.find((s) => s.id === "design-studio")!.items.map(itemKey)).toEqual(design);
  });

  it("sidebar labels are English only (operator 2026-10-23: no mixed languages; Chinese goes in title)", () => {
    const labels = DEFAULT_SECTIONS.flatMap((s) => [s.label, ...s.items.map((i) => i.label)]);
    expect(labels.filter((l) => /[^\x20-\x7E]/.test(l))).toEqual([]);
  });

  it("item keys are unique within every section", () => {
    for (const s of DEFAULT_SECTIONS) {
      const keys = s.items.map(itemKey);
      expect(keys.length, s.id).toBe(new Set(keys).size);
    }
  });

  it("no page is linked twice and section ids are unique", () => {
    expect(linked.length).toBe(new Set(linked).size);
    const ids = DEFAULT_SECTIONS.map((s) => s.id);
    expect(ids.length).toBe(new Set(ids).size);
  });
});
