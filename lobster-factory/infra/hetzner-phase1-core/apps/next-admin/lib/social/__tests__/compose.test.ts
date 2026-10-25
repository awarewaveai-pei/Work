// What one target sends to Postiz (SOCIAL_MANAGER_PLAN.md C5; C21 comments): HTML Postiz keeps, link with UTM, each
// comment a value after the post with its delay, the settings each provider DTO requires, and a refusal before Postiz.
import { describe, expect, it } from "vitest";
import { compose, ComposeError, toPostizHtml, withUtm } from "../compose";

const base = { body: "Hello <world> & friends\nsecond line", customBody: null, comments: [], linkUrl: null, linkUtm: false,
  platform: "bluesky", format: "post", media: [] };

describe("compose", () => {
  it("escapes the text and makes each line a paragraph", () => {
    const c = compose(base);
    expect(c.values).toEqual([{ content: "<p>Hello &lt;world&gt; &amp; friends</p><p>second line</p>", image: [] }]);
    expect(c.settings).toEqual({ __type: "bluesky" });
  });

  it("a channel's own text wins; the link is appended with UTM, or tagged where the text already has it", () => {
    const c = compose({ ...base, customBody: "mine", linkUrl: "https://shop.example/a?x=1", linkUtm: true, platform: "x" });
    expect(c.text).toBe("mine\n\nhttps://shop.example/a?x=1&utm_source=x&utm_medium=social");
    expect(c.settings).toEqual({ __type: "x", who_can_reply_post: "everyone" });
    const inText = compose({ ...base, body: "see https://shop.example/a now", linkUrl: "https://shop.example/a", linkUtm: true });
    expect(inText.text).toBe("see https://shop.example/a?utm_source=bluesky&utm_medium=social now");
    expect(withUtm("https://s.example/?utm_source=keep", "x")).toBe("https://s.example/?utm_source=keep&utm_medium=social");
  });

  it("a comment is the second value; media keep order and alt text", () => {
    const c = compose({ ...base, comments: [{ body: "link in bio", delayMinutes: 0, media: null }], platform: "instagram", format: "post",
      media: [{ postizMediaId: "m1", postizPath: "https://p/1.jpg", altText: " a cat " }, { postizMediaId: "m2", postizPath: "https://p/2.jpg", altText: null }] });
    expect(c.values[0].image).toEqual([{ id: "m1", path: "https://p/1.jpg", alt: "a cat" }, { id: "m2", path: "https://p/2.jpg" }]);
    expect(c.values[1]).toEqual({ content: toPostizHtml("link in bio"), image: [] });
    expect(c.settings).toEqual({ __type: "instagram", post_type: "post" });
    expect(compose({ ...base, platform: "instagram", format: "story", media: c.values[0].image.map((m) => ({ postizMediaId: m.id, postizPath: m.path, altText: null })) }).settings)
      .toEqual({ __type: "instagram", post_type: "story" });
  });

  it("N comments: one value each in order, its delay in minutes when it waits, its image; an empty one is skipped", () => {
    const c = compose({ ...base, comments: [
      { body: "sign-up form: example.com/sat", delayMinutes: 0, media: null },
      { body: "  ", delayMinutes: 5, media: null },
      { body: "", delayMinutes: 1, media: { postizMediaId: "m9", postizPath: "https://p/9.jpg" } },
      { body: "full <now>", delayMinutes: 60, media: null },
    ] });
    expect(c.values.slice(1)).toEqual([
      { content: toPostizHtml("sign-up form: example.com/sat"), image: [] },
      { content: toPostizHtml(""), image: [{ id: "m9", path: "https://p/9.jpg" }], delay: 1 },
      { content: "<p>full &lt;now&gt;</p>", image: [], delay: 60 },
    ]);
    expect(() => compose({ ...base, comments: [{ body: "x", delayMinutes: 0, media: { postizMediaId: null, postizPath: null } }] })).toThrow(/comment 1/);
    // Instagram / LinkedIn post a comment's text only (critic 2026-10-18 M4): the image is not sent, an image-only one refused
    const img = { body: "see", delayMinutes: 0, media: { postizMediaId: "m9", postizPath: "https://p/9.jpg" } };
    expect(compose({ ...base, platform: "instagram", media: [{ postizMediaId: "m1", postizPath: "https://p/1.jpg", altText: null }], comments: [img] }).values[1].image).toEqual([]);
    expect(() => compose({ ...base, platform: "linkedin", comments: [{ ...img, body: "" }] })).toThrow(/carry no image/);
    // a story shows no comments, so none are sent (m6)
    expect(compose({ ...base, platform: "facebook", format: "story", comments: [img] }).values).toHaveLength(1);
  });

  it("a Reel is a post with exactly one video", () => {
    const video = { postizMediaId: "v1", postizPath: "https://p/clip.mp4", altText: null };
    expect(compose({ ...base, platform: "instagram", format: "reel", media: [video] }).settings).toEqual({ __type: "instagram", post_type: "post" });
    expect(compose({ ...base, platform: "facebook", format: "reel", media: [video] }).settings).toEqual({ __type: "facebook" });
    expect(() => compose({ ...base, platform: "instagram", format: "reel", media: [{ ...video, postizPath: "https://p/1.jpg" }] })).toThrow(/Reel/);
    expect(() => compose({ ...base, platform: "facebook", format: "reel" })).toThrow(/Reel/);
  });

  it("refuses before Postiz would: a platform needing settings we do not collect, media not in Postiz, nothing to send", () => {
    expect(() => compose({ ...base, platform: "pinterest" })).toThrow(ComposeError);
    expect(() => compose({ ...base, media: [{ postizMediaId: null, postizPath: null, altText: null }] })).toThrow(/not in Postiz/);
    expect(() => compose({ ...base, body: "  " })).toThrow(/nothing to send/);
    expect(() => compose({ ...base, linkUrl: "https://", linkUtm: true })).toThrow(ComposeError);
  });
});

// P7.1: YouTube (youtube.settings.dto.ts, v2.25.1): one video; the first line is the title (2-100), the rest the description.
describe("compose youtube", () => {
  const video = [{ postizMediaId: "v1", postizPath: "https://p/v.mp4", altText: null }];
  it("the first line is the title, the rest the description, with the one video", () => {
    const c = compose({ ...base, platform: "youtube", body: "\n  藝術治療入門  \n\n五分鐘看懂\n#art", media: video });
    expect(c.settings).toEqual({ __type: "youtube", type: "public", title: "藝術治療入門" });
    expect(c.values).toEqual([{ content: toPostizHtml("五分鐘看懂\n#art"), image: [{ id: "v1", path: "https://p/v.mp4" }] }]);
  });
  it("refused before Postiz: no video, or a title outside 2-100 characters", () => {
    expect(() => compose({ ...base, platform: "youtube", body: "title\nbody" })).toThrow("exactly one video");
    expect(() => compose({ ...base, platform: "youtube", body: "x\nbody", media: video })).toThrow(ComposeError);
    expect(() => compose({ ...base, platform: "youtube", body: `${"題".repeat(101)}\nbody`, media: video })).toThrow("2–100");
    expect(() => compose({ ...base, platform: "youtube", body: "AI <vs> 人類\nbody", media: video })).toThrow("< 或 >");
  });
});
