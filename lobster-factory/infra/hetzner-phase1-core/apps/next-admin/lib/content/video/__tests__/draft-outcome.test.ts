import { describe, expect, it } from "vitest";
import { fakeDb } from "./fake-db";
import { readDraftOutcome } from "../draft-outcome";

const db = () => fakeDb(() => ({
  media_assets: [
    { id: "mine", organization_id: "org", object_url: "https://v/mine.mp4", checksum_sha256: "hash" },
    { id: "foreign", organization_id: "other", object_url: "https://v/foreign.mp4", checksum_sha256: "other" },
  ],
  social_posts: [
    { id: "draft", organization_id: "org", source_url: "https://v/mine.mp4", state: "draft" },
    { id: "foreign-draft", organization_id: "other", source_url: "https://v/mine.mp4", state: "draft" },
    { id: "deleted", organization_id: "org", source_url: "https://v/mine.mp4", state: "deleted" },
  ],
  media_releases: [
    { id: "release", organization_id: "org", status: "release_approved", candidate_asset_id: "mine", candidate_checksum: "hash" },
    { id: "stale", organization_id: "org", status: "release_approved", candidate_asset_id: "mine", candidate_checksum: "old" },
  ],
  media_delivery_attempts: [
    { id: "wp", organization_id: "org", destination: "wordpress", release_id: "release", status: "published", external_id: "1", response_json: { postTitle: "文章", editUrl: "https://site/wp-admin/post.php?post=1" } },
    { id: "old", organization_id: "org", destination: "wordpress", release_id: "stale", status: "published", response_json: { postTitle: "舊影片" } },
  ],
})) as unknown as Parameters<typeof readDraftOutcome>[0];
describe("draft outcome", () => {
  it("counts this org's real posts and only embeds for current-checksum Releases", async () => {
    expect(await readDraftOutcome(db(), "org", "mine")).toEqual({ drafts: [{ id: "draft" }], articles: [{ title: "文章", editUrl: "https://site/wp-admin/post.php?post=1", state: "draft" }] });
  });
  // N14: old receipts recorded drafts as "published"; the article's state is what WordPress says now, then what the receipt
  // recorded, and an unreadable old "published" receipt is told as a draft, never as live.
  it("an old published receipt of a post that is still a draft reads as a draft; a live post reads as published", async () => {
    const asked: Array<[string, number]> = [];
    const wp = (status: string | null) => async (url: string, id: number) => (asked.push([url, id]), status);
    expect((await readDraftOutcome(db(), "org", "mine", wp("draft")))!.articles[0].state).toBe("draft");
    expect((await readDraftOutcome(db(), "org", "mine", wp("publish")))!.articles[0].state).toBe("published");
    expect((await readDraftOutcome(db(), "org", "mine", wp("future")))!.articles[0].state).toBe("scheduled");
    expect((await readDraftOutcome(db(), "org", "mine", wp(null)))!.articles[0].state).toBe("draft");
    expect(asked[0]).toEqual(["https://site/wp-admin/post.php?post=1", 1]);
  });
  it("refuses another org's candidate (drop the primary ownership guard -> red)", async () => {
    expect(await readDraftOutcome(db(), "org", "foreign")).toBeNull();
  });
  it("a scheduled receipt is kept, and every article is returned (WordPress is asked for the first 10 only)", async () => {
    const many = fakeDb(() => ({
      media_assets: [{ id: "mine", organization_id: "org", object_url: "https://v/mine.mp4", checksum_sha256: "hash" }],
      social_posts: [],
      media_releases: [{ id: "release", organization_id: "org", status: "release_approved", candidate_asset_id: "mine", candidate_checksum: "hash" }],
      media_delivery_attempts: [
        ...Array.from({ length: 11 }, (_, i) => ({ id: "a" + i, organization_id: "org", destination: "wordpress", release_id: "release", status: i === 0 ? "scheduled" : "drafted", external_id: String(i), response_json: { postTitle: "文" + i, editUrl: "https://site/wp-admin/post.php?post=" + i } })),
      ],
    })) as unknown as Parameters<typeof readDraftOutcome>[0];
    let asked = 0;
    const out = await readDraftOutcome(many, "org", "mine", async () => (asked++, "draft"));
    expect(out!.articles).toHaveLength(11);
    expect(asked).toBe(10);
    expect(out!.articles.some((a) => a.title === "文0")).toBe(true);   // the scheduled receipt is not filtered out
  });
});
