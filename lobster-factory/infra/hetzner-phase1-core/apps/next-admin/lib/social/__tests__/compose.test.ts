// What one target sends to Postiz (SOCIAL_MANAGER_PLAN.md C5): HTML Postiz keeps, link with UTM, first comment as the
// second value, the settings each provider DTO requires, and a refusal before Postiz for what it would refuse.
import { describe, expect, it } from "vitest";
import { compose, ComposeError, toPostizHtml, withUtm } from "../compose";

const base = { body: "Hello <world> & friends\nsecond line", customBody: null, firstComment: null, linkUrl: null, linkUtm: false,
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

  it("the first comment is the second value; media keep order and alt text", () => {
    const c = compose({ ...base, firstComment: "link in bio", platform: "instagram", format: "story",
      media: [{ postizMediaId: "m1", postizPath: "https://p/1.jpg", altText: " a cat " }, { postizMediaId: "m2", postizPath: "https://p/2.jpg", altText: null }] });
    expect(c.values[0].image).toEqual([{ id: "m1", path: "https://p/1.jpg", alt: "a cat" }, { id: "m2", path: "https://p/2.jpg" }]);
    expect(c.values[1]).toEqual({ content: toPostizHtml("link in bio"), image: [] });
    expect(c.settings).toEqual({ __type: "instagram", post_type: "story" });
  });

  it("refuses before Postiz would: a platform needing settings we do not collect, media not in Postiz, nothing to send", () => {
    expect(() => compose({ ...base, platform: "pinterest" })).toThrow(ComposeError);
    expect(() => compose({ ...base, media: [{ postizMediaId: null, postizPath: null, altText: null }] })).toThrow(/not in Postiz/);
    expect(() => compose({ ...base, body: "  " })).toThrow(/nothing to send/);
    expect(() => compose({ ...base, linkUrl: "https://", linkUtm: true })).toThrow(ComposeError);
  });
});
