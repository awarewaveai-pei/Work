import { describe, expect, it } from "vitest";
import { buildVideoOutName, parseOrgPrefixFromDir } from "../video-pipeline";

/**
 * out_name decides the R2 directory, which decides media_assets.object_key, which is the
 * identity of the asset row. Before 2026-08-25 it was the raw video title, so two tenants
 * rendering the same title overwrote each other's R2 objects and shadowed each other's rows.
 *
 * The load-bearing constraint these tests protect: EU video-service sanitises and TRUNCATES
 * to 40 chars (video-service/pipeline.py:687,718 `re.sub(r"[^\w一-鿿]", "_", out_name)[:40]`).
 * Anything unique placed after char 40 is silently discarded — which would look like a fix
 * while changing nothing.
 */

/** Mirror of the EU-side sanitiser, so these tests fail if the prefix stops surviving it. */
function euSanitise(outName: string): string {
  return outName.replace(/[^\w一-鿿]/g, "_").slice(0, 40) || "video";
}

const ORG = "2bf60452-1c3e-4a7b-8d91-a0f1e2c3d4b5";

describe("buildVideoOutName", () => {
  it("puts tenant + uniqueness in the first 20 chars so truncation cannot eat them", () => {
    const name = buildVideoOutName(ORG, "一個很長很長的中文影片標題會被截斷掉的那種");
    expect(name.slice(0, 20)).toMatch(/^[0-9a-f]{8}_[0-9a-f]{10}_$/);
    // Survives the real EU transform, which is the only thing that matters.
    expect(euSanitise(name).slice(0, 20)).toBe(name.slice(0, 20));
  });

  it("survives EU sanitisation intact (hex and underscore are \\w)", () => {
    const name = buildVideoOutName(ORG, "Title With Spaces & Symbols!");
    expect(parseOrgPrefixFromDir(euSanitise(name))).toBe("2bf60452");
  });

  it("is unique across repeated renders of the same title by the same org", () => {
    const names = new Set(Array.from({ length: 200 }, () => buildVideoOutName(ORG, "Weekly Update")));
    expect(names.size).toBe(200);
  });

  it("separates two orgs that render an identical title (the original cross-tenant bug)", () => {
    const other = "9a1b2c3d-1111-4222-8333-444455556666";
    const a = euSanitise(buildVideoOutName(ORG, "Weekly Update"));
    const b = euSanitise(buildVideoOutName(other, "Weekly Update"));
    expect(parseOrgPrefixFromDir(a)).not.toBe(parseOrgPrefixFromDir(b));
    expect(a).not.toBe(b);
  });

  it("marks an unknown tenant explicitly rather than silently borrowing one", () => {
    const name = buildVideoOutName(null, "Untitled");
    expect(name.startsWith("noorg_")).toBe(true);
    // Must NOT parse as a tenant prefix — reconcile has to fail closed on it.
    expect(parseOrgPrefixFromDir(euSanitise(name))).toBeNull();
  });

  it("lowercases the tenant prefix so the parser can read it back (critic M4)", () => {
    // resolveOrgId's uuid regex carries /i and accepts uppercase, but parseOrgPrefixFromDir
    // only matches [0-9a-f]. Without .toLowerCase() every video from an uppercase-uuid org
    // would parse as null and be counted as legacy backlog forever.
    const upper = ORG.toUpperCase();
    const name = buildVideoOutName(upper, "Title");
    expect(name.slice(0, 8)).toBe("2bf60452");
    expect(parseOrgPrefixFromDir(euSanitise(name))).toBe("2bf60452");
  });

  it("still produces a usable name when the title is empty", () => {
    expect(buildVideoOutName(ORG, "  ")).toMatch(/^[0-9a-f]{8}_[0-9a-f]{10}_video$/);
  });
});

describe("parseOrgPrefixFromDir", () => {
  it("extracts the prefix from a new-format directory", () => {
    expect(parseOrgPrefixFromDir("2bf60452_a1b2c3d4e5_My_Video")).toBe("2bf60452");
  });

  it("returns null for legacy title-only directories so the sweep refuses to guess", () => {
    // These are the shapes of the 142 rows already on EU prod.
    expect(parseOrgPrefixFromDir("Weekly_Update")).toBeNull();
    expect(parseOrgPrefixFromDir("AI_行銷_2026")).toBeNull();
  });

  it("does not accept a near-miss that would let a wrong tenant through", () => {
    expect(parseOrgPrefixFromDir("2bf6045_a1b2c3d4e5_x")).toBeNull();   // 7-char prefix
    expect(parseOrgPrefixFromDir("2bf60452_a1b2c3d4_x")).toBeNull();    // 8-char random
    expect(parseOrgPrefixFromDir("zzzzzzzz_a1b2c3d4e5_x")).toBeNull();  // non-hex
  });
});
