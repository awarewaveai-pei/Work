// B1 part 2: workbench cuts of one project are separate main rows (no variantOf); the ratios of a video are the project's newest cut of each ratio, whichever cut is opened. Old pipeline videos keep id + variantOf.
import { describe, expect, it } from "vitest";
import { fakeDb } from "./fake-db";
import { loadVideoRows } from "../ratio-rows";

const MP4 = "video/mp4";
const cut = (id: string, ratio: string, at: string, over: Record<string, unknown> = {}) => ({ id, organization_id: "org", mime_type: MP4, is_current: true, media_project_id: "proj", object_url: `https://r2/${id}.mp4`, checksum_sha256: "s" + id, metadata: { ratio }, created_at: at, ...over });
const db = (rows: Record<string, unknown>[]) => fakeDb(() => ({ media_assets: rows })) as unknown as Parameters<typeof loadVideoRows>[0];
const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

describe("loadVideoRows", () => {
  const rows = () => [
    cut("w169", "16x9", "2026-11-19T01:00:00Z"), cut("w45", "4x5", "2026-11-19T02:00:00Z"), cut("w916", "9x16", "2026-11-19T03:00:00Z"),
    cut("w169-old", "16x9", "2026-11-18T01:00:00Z", { is_current: false }),
    cut("w45-old", "4x5", "2026-11-18T02:00:00Z"),                                      // current but older: the newer 4:5 wins
    cut("other-proj", "1x1", "2026-11-19T04:00:00Z", { media_project_id: "proj-2" }),
    cut("foreign", "1x1", "2026-11-19T05:00:00Z", { organization_id: "other" }),        // same project id, another tenant
  ];
  it("from any cut of a project: the same newest cut of every ratio", async () => {
    for (const open of ["w169", "w45", "w916"]) expect(ids(await loadVideoRows(db(rows()), "org", open))).toEqual(["w169", "w45", "w916"]);
  });
  it("another tenant's rows never join, and another tenant's video id gives nothing (drop either organization_id condition -> red)", async () => {
    expect(ids(await loadVideoRows(db(rows()), "org", "w45"))).not.toContain("foreign");
    expect(await loadVideoRows(db(rows()), "org", "foreign")).toEqual([]);
  });
  it("an old-pipeline video (no project): itself plus the rows pointing at it with variantOf, nothing else", async () => {
    const old = [cut("main", "16x9", "2026-11-01T00:00:00Z", { media_project_id: null }), cut("v45", "4x5", "2026-11-01T00:01:00Z", { media_project_id: null, metadata: { ratio: "4x5", variantOf: "main" } }), cut("elsewhere", "1x1", "2026-11-01T00:02:00Z", { media_project_id: null })];
    expect(ids(await loadVideoRows(db(old), "org", "main"))).toEqual(["main", "v45"]);
  });
  it("an old-pipeline video attached to a project keeps its variantOf ratios the project has no cut of", async () => {
    const mixed = [cut("main", "16x9", "2026-11-01T00:00:00Z"), cut("v45", "4x5", "2026-11-01T00:01:00Z", { media_project_id: null, metadata: { ratio: "4x5", variantOf: "main" } }), cut("v916", "9x16", "2026-11-01T00:02:00Z", { media_project_id: null, metadata: { ratio: "9x16", variantOf: "main" } }), cut("new916", "9x16", "2026-11-19T00:00:00Z")];
    expect(ids(await loadVideoRows(db(mixed), "org", "main"))).toEqual(["main", "new916", "v45"]);   // 9:16: the project's newer cut wins over the variant
  });
});
