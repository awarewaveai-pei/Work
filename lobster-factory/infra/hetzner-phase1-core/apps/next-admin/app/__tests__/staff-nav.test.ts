// The sidebar shows a restricted staff member only the tools ticked for them (agency-os/handoffs/2026-10-24-staff-tool-grants C3).
import { describe, expect, it } from "vitest";
import { DEFAULT_SECTIONS, visibleSections } from "../sidebar-sections";
import { toolsFor } from "@/lib/portal/staff-tools";
import { staffGrantOf, staffMayOpen, staffUnrestricted, type StaffGrant } from "@/lib/staff-access";

const links = DEFAULT_SECTIONS.flatMap((s) => s.items).flatMap((i) => (i.type === "link" ? [i.href] : []));

describe("sidebar x staff tools", () => {
  it("every sidebar link belongs to a tool or to every staff member", () => {
    expect(links.filter((h) => toolsFor(h) === null)).toEqual([]);
  });

  it("a person with only 社群發文 ticked sees the dashboard and Social Posts, nothing else, no empty section", () => {
    const grant: StaffGrant = { role: "operator", tools: ["social"] };
    for (const mode of ["shadow", "enforce"] as const) {
      const shown = visibleSections(DEFAULT_SECTIONS, (h) => staffMayOpen(grant, h, mode));
      expect(shown.map((s) => [s.id, s.items.map((i) => (i.type === "link" ? i.href : i.label))]), mode)
        .toEqual([["overview", ["/"]], ["marketing", ["/tools/social"]]]);
    }
  });

  it("the owner and (shadow only) a person never set see everything", () => {
    expect(staffUnrestricted({ role: "owner", tools: [] }, "enforce")).toBe(true);
    expect(staffUnrestricted({ role: "viewer", tools: null }, "shadow")).toBe(true);
    expect(staffUnrestricted({ role: "viewer", tools: null }, "enforce")).toBe(false);
    expect(staffUnrestricted({ role: "viewer", tools: [] }, "shadow")).toBe(false);
  });

  it("reads the grant from middleware's headers; a customer or no identity is not a staff grant", () => {
    expect(staffGrantOf(new Headers({ "x-ops-claims-role": "admin", "x-ops-tools": "social,bogus" }))).toEqual({ role: "admin", tools: ["social"] });
    expect(staffGrantOf(new Headers({ "x-ops-claims-role": "admin" }))).toEqual({ role: "admin", tools: null });
    expect(staffGrantOf(new Headers({ "x-ops-claims-role": "operator", "x-ops-user-kind": "client" }))).toBeNull();
    expect(staffGrantOf(new Headers())).toBeNull();
  });
});
