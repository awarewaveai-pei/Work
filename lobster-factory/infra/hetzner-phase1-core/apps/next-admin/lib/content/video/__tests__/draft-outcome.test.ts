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
    { id: "wp", organization_id: "org", destination: "wordpress", release_id: "release", status: "published", response_json: { postTitle: "文章", editUrl: "https://site/wp-admin/post.php?post=1" } },
    { id: "old", organization_id: "org", destination: "wordpress", release_id: "stale", status: "published", response_json: { postTitle: "舊影片" } },
  ],
})) as unknown as Parameters<typeof readDraftOutcome>[0];
describe("draft outcome", () => {
  it("counts this org's real posts and only embeds for current-checksum Releases", async () => {
    expect(await readDraftOutcome(db(), "org", "mine")).toEqual({ drafts: [{ id: "draft" }], articles: [{ title: "文章", editUrl: "https://site/wp-admin/post.php?post=1" }] });
  });
  it("refuses another org's candidate (drop the primary ownership guard -> red)", async () => {
    expect(await readDraftOutcome(db(), "org", "foreign")).toBeNull();
  });
});
