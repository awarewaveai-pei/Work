// groupByFolder (ClientHubTabs.tsx) — K2j's grouping logic: "彙整" = collapse same-folder documents
// into one card (operator decision 2026-09-17), computed client-side over the current page's rows.
// No React needed here — the render itself (expand/collapse, headers) is simple boolean-gated JSX
// already covered by tsc; this is the one piece of new LOGIC worth its own proof.

import { describe, expect, it } from "vitest";
import { groupByFolder, UNFILED_GROUP_KEY } from "../ClientHubTabs";

describe("groupByFolder", () => {
  it("groups consecutive-or-not items sharing a folderId together, preserving each group's first-seen order", () => {
    const items = [
      { id: "a", folderId: "f1" },
      { id: "b", folderId: "f2" },
      { id: "c", folderId: "f1" },
    ];
    const groups = groupByFolder(items);
    expect(groups.map((g) => g.key)).toEqual(["f1", "f2"]);
    expect(groups[0].items.map((i) => i.id)).toEqual(["a", "c"]);
    expect(groups[1].items.map((i) => i.id)).toEqual(["b"]);
  });

  it("buckets null folderId under the unfiled sentinel key", () => {
    const items = [{ id: "a", folderId: null }, { id: "b", folderId: "f1" }];
    const groups = groupByFolder(items);
    expect(groups[0]).toMatchObject({ key: UNFILED_GROUP_KEY, items: [{ id: "a", folderId: null }] });
  });

  it("returns one group for an all-unfiled list — the caller uses group count to decide whether to show headers at all", () => {
    const items = [{ id: "a", folderId: null }, { id: "b", folderId: null }];
    expect(groupByFolder(items)).toHaveLength(1);
  });

  it("returns an empty array for an empty list", () => {
    expect(groupByFolder([])).toEqual([]);
  });
});
