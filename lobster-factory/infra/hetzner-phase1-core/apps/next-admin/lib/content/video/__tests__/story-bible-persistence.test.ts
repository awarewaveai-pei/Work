import { describe, expect, it } from "vitest";
import { canonicalStoryBibleSha256, prepareStoryBibleDraft, storyBibleAssetIds, StoryBibleValidationError } from "../story-bible-persistence";

const org = "123e4567-e89b-42d3-a456-426614174001";
const asset = "123e4567-e89b-42d3-a456-426614174002";
const bible = { schemaVersion: "1.0.0", organizationId: "attacker-org", seriesId: "series_1", revision: 99, state: "approved", characters: [{ id: "hero", name: "主角", referenceAssetIds: [asset] }], locations: [], props: [], continuity: { currentState: [], prohibitions: [], openThreads: [] }, episode: { episodeId: "ep_1", premise: "前提", hook: "鉤子", beats: ["節拍"], stateDelta: {} }, provenance: { capabilityVersion: "1.0.0", sourceArtifactIds: [asset] } };

describe("Story Bible persistence boundary", () => {
  it("server replaces browser-controlled identity, revision and approval", () => {
    const prepared = prepareStoryBibleDraft(bible, org, 4);
    expect(prepared.organizationId).toBe(org);
    expect(prepared.revision).toBe(4);
    expect(prepared.state).toBe("draft");
  });
  it("hash is stable regardless of object key order", () => {
    const a = prepareStoryBibleDraft(bible, org, 1);
    const b = Object.fromEntries(Object.entries(a).reverse());
    expect(canonicalStoryBibleSha256(a)).toBe(canonicalStoryBibleSha256(b));
  });
  it("collects every declared media reference for tenant ownership verification", () => {
    expect(storyBibleAssetIds(prepareStoryBibleDraft(bible, org, 1))).toEqual([asset]);
  });
  it("does not accept a structurally incomplete Bible", () => {
    expect(() => prepareStoryBibleDraft({ ...bible, episode: { ...bible.episode, beats: [] } }, org, 1)).toThrow(StoryBibleValidationError);
  });
});
