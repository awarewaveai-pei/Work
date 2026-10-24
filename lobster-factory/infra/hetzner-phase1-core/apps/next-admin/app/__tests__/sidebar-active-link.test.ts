import { describe, expect, it } from "vitest";
import { activeLink, type NavSection } from "../sidebar-sections";

// Operator 2026-10-25: --sidebar-text-active / --sidebar-active-bar never showed because no link
// carried .active. The current page's link is the longest href that is the path or its parent.
const sections = [
  { id: "a", label: "A", items: [{ type: "link", href: "/", label: "Home", icon: "" }] },
  { id: "b", label: "B", items: [
    { type: "link", href: "/tools", label: "Tools", icon: "" },
    { type: "link", href: "/tools/theme", label: "Theme", icon: "" },
  ] },
] as unknown as NavSection[];

describe("activeLink", () => {
  it("picks the longest matching href, not a shorter parent", () => {
    expect(activeLink(sections, "/tools/theme")).toEqual({ sectionId: "b", href: "/tools/theme" });
    expect(activeLink(sections, "/tools/theme/x")?.href).toBe("/tools/theme");
    expect(activeLink(sections, "/tools/other")?.href).toBe("/tools");
  });
  it("home matches only itself, and a look-alike prefix does not match", () => {
    expect(activeLink(sections, "/")?.href).toBe("/");
    expect(activeLink(sections, "/toolsx")).toBeNull();
  });
});

import fs from "fs";
import path from "path";

describe("SidebarNav marks the current link", () => {
  it("the link whose href is activeLink's gets .active and aria-current", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../SidebarNav.tsx"), "utf8");
    expect(src).toMatch(/item\.href === current\?\.href \? 'sidebar-link active' : 'sidebar-link'/);
    expect(src).toMatch(/aria-current=\{item\.href === current\?\.href \? 'page' : undefined\}/);
  });
});
