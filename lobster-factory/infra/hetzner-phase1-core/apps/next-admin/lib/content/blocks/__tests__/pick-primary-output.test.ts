import { describe, expect, it } from "vitest";
import { pickPrimaryOutput, PRIMARY_OUTPUT_PRIORITY } from "../video-pipeline";

/**
 * pickPrimaryOutput is the single source of truth for which render output becomes
 * media_assets.object_key. /api/video/status and the reconcile sweep both call it;
 * if they can ever disagree, one video lands as two rows (or an orphan becomes
 * invisible to self-heal). These tests pin the properties that make that impossible.
 *
 * Regression origin: 2026-08-24 Codex review rounds 2 and 3.
 */
describe("pickPrimaryOutput", () => {
  it("honours the declared priority order, not object insertion order", () => {
    // 9x16 inserted first, but 16x9 outranks it.
    const outputs = { "9x16": "u/9x16.mp4", "16x9": "u/16x9.mp4" };
    expect(pickPrimaryOutput(outputs)).toBe("u/16x9.mp4");
  });

  // Property test over the WHOLE list, not hand-picked pairs. Round-4 review found
  // the earlier tests only touched 16x9 / 9x16 / 4x5, so reordering or dropping any
  // of the four trailing entries regressed object_key derivation while staying green.
  //
  // SCOPE, stated honestly: this test derives its pairs FROM the list, so it proves
  // "the function obeys whatever order is declared" — it is deliberately tautological
  // with respect to REORDERING and cannot catch it. The exact-list assertion below is
  // what pins the order itself. Neither test alone is sufficient; both are required.
  // Verified by mutation on 2026-08-25: demoting youtube_linkedin below 9x16 leaves
  // these pair cases green and fails only the exact-list assertion.
  it.each(
    PRIMARY_OUTPUT_PRIORITY.slice(0, -1).map((higher, i) => [higher, PRIMARY_OUTPUT_PRIORITY[i + 1]] as const),
  )("ranks %s above %s (adjacent pair, inserted in reverse)", (higher, lower) => {
    // Insert the LOWER-priority key first so a naive insertion-order pick would fail.
    const outputs = { [lower]: `u/${lower}.mp4`, [higher]: `u/${higher}.mp4` };
    expect(pickPrimaryOutput(outputs)).toBe(`u/${higher}.mp4`);
  });

  it("pins the exact priority list so a dropped or renamed format fails loudly", () => {
    // Every entry here is a format that exists in R2 today. Removing one from the
    // source list would silently change which URL becomes object_key for any video
    // group containing it — that must break a test, not ship quietly.
    expect(PRIMARY_OUTPUT_PRIORITY).toEqual([
      "16x9",
      "youtube_linkedin",
      "9x16",
      "4x5",
      "tiktok_reels",
      "instagram_facebook",
      "twitter_reddit_bluesky",
    ]);
  });

  it("is stable when the same set arrives in a different key order (round-2 finding 3)", () => {
    // The old code used Object.values(outputs)[0] as a fallback, so a subset render
    // without 16x9 resolved differently depending on serialization order.
    const a = { "4x5": "u/4x5.mp4", "9x16": "u/9x16.mp4" };
    const b = { "9x16": "u/9x16.mp4", "4x5": "u/4x5.mp4" };
    expect(pickPrimaryOutput(a)).toBe(pickPrimaryOutput(b));
    expect(pickPrimaryOutput(a)).toBe("u/9x16.mp4"); // 9x16 outranks 4x5
  });

  it("falls back deterministically for unknown formats, by sorted key (round-3 finding 2)", () => {
    const a = { "1x1": "u/1x1.mp4", "3x2": "u/3x2.mp4" };
    const b = { "3x2": "u/3x2.mp4", "1x1": "u/1x1.mp4" };
    expect(pickPrimaryOutput(a)).toBe("u/1x1.mp4");
    expect(pickPrimaryOutput(a)).toBe(pickPrimaryOutput(b));
  });

  it("prefers any known format over an unknown one", () => {
    const outputs = { "1x1": "u/1x1.mp4", "4x5": "u/4x5.mp4" };
    expect(pickPrimaryOutput(outputs)).toBe("u/4x5.mp4");
  });

  it("returns undefined for an empty set rather than throwing", () => {
    expect(pickPrimaryOutput({})).toBeUndefined();
  });

  it("priority list has no duplicates (a dup would make ordering ambiguous)", () => {
    expect(new Set(PRIMARY_OUTPUT_PRIORITY).size).toBe(PRIMARY_OUTPUT_PRIORITY.length);
  });
});
