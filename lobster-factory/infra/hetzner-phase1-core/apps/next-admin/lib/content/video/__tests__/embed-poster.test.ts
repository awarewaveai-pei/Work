// Card VD.8: a WordPress embed carries the video's chosen cover as its poster; no cover = the bare URL as before; the
// cover comes only from the Release of the site's own organization.
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { alreadyEmbedded, videoMarkup } from "../embed-in-post";
import { coverForRelease } from "../cover";

describe("alreadyEmbedded (Codex 52914185 F1)", () => {
  it("finds the video as a bare URL and inside the block, where & is &amp;", () => {
    const url = "https://cdn/v.mp4?a=1&b=2";
    expect(alreadyEmbedded(`<p>x</p>
${url}
`, url)).toBe(true);
    expect(alreadyEmbedded(`<p>x</p>${videoMarkup(url, "https://cdn/c.jpg")}`, url)).toBe(true);
    expect(alreadyEmbedded("<p>other</p>", url)).toBe(false);
    // a link to the same file (escaped in an href) is not the embedded video
    expect(alreadyEmbedded(`<a href="https://cdn/v.mp4?a=1&amp;b=2">下載</a><!-- VIDEO_PLACEHOLDER -->`, url)).toBe(false);
  });
});

describe("videoMarkup", () => {
  it("no cover: the bare URL (WordPress autoembed), unchanged from before", () => {
    expect(videoMarkup("https://cdn/v.mp4", null)).toBe("https://cdn/v.mp4");
  });
  it("a cover: the core/video block with poster and src, attribute values escaped", () => {
    const html = videoMarkup("https://cdn/v.mp4?a=1&b=2", 'https://cdn/c.jpg?x="><script>');
    expect(html.startsWith("<!-- wp:video -->\n<figure class=\"wp-block-video\"><video controls ")).toBe(true);
    expect(html).toContain('src="https://cdn/v.mp4?a=1&amp;b=2"');
    expect(html).toContain('poster="https://cdn/c.jpg?x=&quot;&gt;&lt;script&gt;"');
    expect(html).not.toContain("<script>");
    expect(html.endsWith("</video></figure>\n<!-- /wp:video -->")).toBe(true);
  });
});

import { fakeDb as sharedFakeDb } from "./fake-db";
const fakeDb = (tables: Record<string, Array<Record<string, unknown>>>) => sharedFakeDb(() => tables) as unknown as SupabaseClient;

describe("coverForRelease", () => {
  const db = fakeDb({
    media_releases: [{ id: "rel-1", organization_id: "org-a", candidate_asset_id: "vid-1", status: "release_approved" }, { id: "rel-2", organization_id: "org-a", candidate_asset_id: "vid-2", status: "release_approved" },
      { id: "rel-w", organization_id: "org-a", candidate_asset_id: "vid-1", status: "withdrawn" }],
    media_assets: [
      { id: "vid-1", organization_id: "org-a", object_url: "https://r2/v1.mp4", mime_type: "video/mp4", metadata: {} },
      { id: "vid-2", organization_id: "org-a", object_url: "https://r2/v2.mp4", mime_type: "video/mp4", metadata: {} },
      { id: "c0", organization_id: "org-a", object_url: "https://r2/c0.jpg", mime_type: "image/jpeg", created_at: "2026-11-14T01:00:00Z", metadata: { coverOf: "vid-1", coverKind: "auto", vwJobId: "cover:j:0" } },
      { id: "c1", organization_id: "org-a", object_url: "https://r2/c1.jpg", mime_type: "image/jpeg", created_at: "2026-11-14T01:00:01Z", metadata: { coverOf: "vid-1", coverKind: "ai", chosenAt: "2026-11-14T02:00:00Z" } },
    ],
  });
  it("the Release's video's chosen cover", async () => {
    expect(await coverForRelease(db, "org-a", "rel-1", "https://r2/v1.mp4")).toBe("https://r2/c1.jpg");
  });
  it("a Release of another organization, or none, gives no poster", async () => {
    expect(await coverForRelease(db, "org-b", "rel-1", "https://r2/v1.mp4")).toBeNull();
    expect(await coverForRelease(db, "org-a", "rel-x", "https://r2/v1.mp4")).toBeNull();
    expect(await coverForRelease(db, "org-a", "rel-w", "https://r2/v1.mp4")).toBeNull();   // withdrawn
  });
  it("a Release of ANOTHER video gives no poster for this one (never a wrong cover)", async () => {
    expect(await coverForRelease(db, "org-a", "rel-2", "https://r2/v1.mp4")).toBeNull();
    expect(await coverForRelease(db, "org-a", "rel-1", "https://r2/v2.mp4")).toBeNull();
  });
});
