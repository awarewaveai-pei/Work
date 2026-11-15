// Guard for the whole class: no PostgREST select embeds social_media into itself. The 0163 cover FK
// (social_media_cover_fk: (cover_media_id, organization_id, cover_kind) -> social_media(id, organization_id, kind)) is a
// COMPOSITE SELF-REFERENCING key; prod PostgREST v14.6 (measured 2026-11-15 with the service role) answers an embed of
// social_media hinted by that FK name with 400 PGRST200 "no matches were found", the same for every column hint
// (cover_media_id, cover_kind, organization_id), and without a hint it exposes only the reverse direction (image row ->
// the videos using it as a cover). The 400 emptied every media list in the app. Covers are resolved by a second plain
// query (lib/social/cover-rows.ts); this test fails the moment a select reaches for the embed again.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const APP = join(__dirname, "..", "..", "..");
const ROOTS = ["lib/social", "lib/content"].map((p) => join(APP, p));

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (name === "__tests__" || name === "node_modules") return [];
    if (statSync(full).isDirectory()) return sources(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

/** Matched on the file with all whitespace and string concatenation removed (postgrest-js strips unquoted spaces before
 *  sending a select, and a select may be built from `"..." +` lines): `social_media!<hint>` = an embed of social_media by
 *  an explicit hint; `cover_media_id(` / `cover_kind(` = an embed through the FK column, the other refused spelling. */
const SELF_EMBED = /social_media!|cover_media_id\(|cover_kind\(/g;
const squash = (text: string) => text.replace(/\s+/g, "").replace(/["'`]\+["'`]/g, "");
const hits = (text: string) => {
  const flat = squash(text);
  return [...flat.matchAll(SELF_EMBED)].map((m) => flat.slice(Math.max(0, m.index - 60), m.index + 60));
};

describe("no select embeds social_media into itself", () => {
  const files = ROOTS.flatMap(sources);
  it("scans a non-trivial set of files (the guard is not looking at an empty folder)", () => {
    expect(files.length).toBeGreaterThan(10);
  });
  it.each([
    '"cover:social_media!social_media_cover_fk(postiz_path)"',
    '"cover:social_media !social_media_cover_fk(postiz_path)"',
    '"id, cover:social_media" +\n  "!social_media_cover_fk(postiz_path)"',
    '"id, cover:cover_media_id(postiz_path)"',
    '"id, cover:cover_kind (postiz_path)"',
  ])("catches %j", (src) => {
    expect(hits(src)).not.toEqual([]);
  });
  it("does not flag a plain column list", () => {
    expect(hits('"id, kind, cover_media_id, uses:social_post_media(count)"')).toEqual([]);
  });
  it.each(files.map((f) => [relative(APP, f).replace(/\\/g, "/"), f]))("%s", (_rel, file) => {
    expect(hits(readFileSync(file, "utf8")), "self-referencing social_media embed; resolve covers with lib/social/cover-rows.ts instead").toEqual([]);
  });
});
