// Card U9 (video-unify-plan-20261116 §4 U9): 製作聖經 <-> Story Bible. Apply then save again: no field either side does
// not know is lost, and the saved document is one the story-bibles route accepts.
import { describe, expect, it } from "vitest";
import { productionFromStoryBible, storyBibleFromProduction } from "../story-bible-production";
import { prepareStoryBibleDraft } from "../story-bible-persistence";

const ORG = "123e4567-e89b-42d3-a456-426614174001";
const A1 = "123e4567-e89b-42d3-a456-4266141740a1", A2 = "123e4567-e89b-42d3-a456-4266141740a2";
const bible = {
  schemaVersion: "1.0.0", organizationId: ORG, seriesId: "series_1", revision: 3, state: "approved",
  characters: [{ id: "char_1", name: "小美", role: "主角", referenceAssetIds: [A1], rightsNote: "本人授權" }, { id: "char_9", name: "只在聖經", referenceAssetIds: [] }],
  locations: [{ id: "loc_1", name: "豆花店", role: "主場景", referenceAssetIds: [] }], props: [],
  continuity: { currentState: ["受傷"], prohibitions: ["短髮不可變長"], openThreads: [] },
  episode: { episodeId: "ep_3", premise: "p", hook: "h", beats: ["b"], stateDelta: { mood: "low" } },
  provenance: { capabilityVersion: "1.0.0", sourceArtifactIds: [A2] },
};
const production = {
  character: [{ id: "c1", key: "char_1", name: "舊名", descr: "專案自己的外觀描述", refs: ["/generated/own.png"], extra: 7 }, { id: "c2", name: "只在專案", refs: [] }],
  scene: [{ id: "s1", name: "雨夜小巷", time: "夜晚", refs: [] }],
  prop: [],
  unrelated: { kept: true },
};
const urls: Record<string, string> = { [A1]: "/generated/a1.jpg" };
const ids: Record<string, string> = { "/generated/a1.jpg": A1, "/generated/own.png": A2 };

describe("製作聖經 <-> Story Bible", () => {
  it("套用 then 存: the Bible's unknown-to-the-workbench fields and the workbench's own fields both survive", () => {
    let n = 0;
    const applied = productionFromStoryBible(bible, production, (id) => urls[id], () => `new-${++n}`);
    const c1 = applied.character!.find((c) => c.id === "c1")!;
    expect(c1).toMatchObject({ key: "char_1", name: "小美", role: "主角", descr: "專案自己的外觀描述", extra: 7, refs: ["/generated/a1.jpg", "/generated/own.png"] });
    expect(applied.character!.map((c) => c.name)).toEqual(["小美", "只在專案", "只在聖經"]);
    expect(applied.scene!.find((s) => s.id === "s1")).toMatchObject({ time: "夜晚" });
    expect(applied.unrelated).toEqual({ kept: true });

    const { document, keys, missing } = storyBibleFromProduction(bible, applied, { organizationId: ORG, seriesId: "series_1", title: "t", assetIdOf: (u) => ids[u] });
    expect(missing).toEqual([]);
    expect(document.continuity).toEqual(bible.continuity);
    expect(document.episode).toEqual(bible.episode);
    expect(document.provenance).toEqual(bible.provenance);
    const chars = document.characters as { id: string; name: string; referenceAssetIds: string[]; rightsNote?: string }[];
    expect(chars.find((c) => c.id === "char_1")).toEqual({ id: "char_1", name: "小美", role: "主角", referenceAssetIds: [A1, A2], rightsNote: "本人授權" });
    expect(chars.map((c) => c.id)).toEqual(["char_1", "char_9", "character_3"]);
    expect(keys).toMatchObject({ c1: "char_1", c2: "character_3" });
    expect((document.locations as { id: string }[]).map((l) => l.id)).toEqual(["loc_1", "scene_2"]);
    expect(() => prepareStoryBibleDraft(document, ORG, 4)).not.toThrow();
  });

  it("a new series is a valid document; a picture without an asset id is reported, not dropped silently", () => {
    const { document, missing } = storyBibleFromProduction(null, production, { organizationId: ORG, seriesId: "series_new", title: "夏日豆花", assetIdOf: () => undefined });
    expect(missing).toEqual(["/generated/own.png"]);
    expect(() => prepareStoryBibleDraft(document, ORG, 1)).not.toThrow();
  });
});
