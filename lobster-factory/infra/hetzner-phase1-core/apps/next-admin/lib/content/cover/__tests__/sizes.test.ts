// K29: the one table of cover sizes per platform, and how a draft with several channels picks one.
import { describe, expect, it } from "vitest";
import { SITE_COVER_SIZE, baseRatioFor, coverSizeFor, draftCoverSize, extraBaseRatios } from "../sizes";

describe("K29 cover sizes per platform", () => {
  it("each listed platform's size; an unknown one gets the website's 1200x900", () => {
    for (const p of ["facebook", "instagram", "instagram-standalone", "bluesky", "threads", "linkedin", "linkedin-page"])
      expect(coverSizeFor(p)).toEqual({ width: 1080, height: 1350 });
    expect(coverSizeFor("x")).toEqual({ width: 1200, height: 675 });
    expect(coverSizeFor("pinterest")).toEqual({ width: 1000, height: 1500 });
    expect(coverSizeFor("mastodon")).toEqual({ width: 1200, height: 900 });
    expect(SITE_COVER_SIZE).toEqual({ width: 1200, height: 900 });
  });

  it("the picture area's ratio: website 16:9, portrait ~1:1 -- one extra base for all the portrait sizes", () => {
    expect(baseRatioFor(SITE_COVER_SIZE)).toBe("16:9");
    expect(baseRatioFor({ width: 1080, height: 1350 })).toBe("1:1");
    expect(extraBaseRatios([{ width: 1080, height: 1350 }, { width: 1080, height: 1350 }, SITE_COVER_SIZE])).toEqual(["1:1"]);
    expect(extraBaseRatios([])).toEqual([]);
  });

  it("a shared draft of mixed channels: the size most need; a tie goes to the portrait; the others are named", () => {
    expect(draftCoverSize(["bluesky", "threads", "x"])).toEqual({ size: { width: 1080, height: 1350 }, mismatched: ["x"] });
    expect(draftCoverSize(["x", "pinterest", "bluesky"])).toEqual({ size: { width: 1080, height: 1350 }, mismatched: ["x", "pinterest"] });
    expect(draftCoverSize(["x", "x", "bluesky"])).toEqual({ size: { width: 1200, height: 675 }, mismatched: ["bluesky"] });
  });
});
