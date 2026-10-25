// The one social post writer: hard limits come only from BODY_LIMITS, every answer is measured before it may be sent,
// an over-limit post gets one shorter rewrite, and the Postiz -> writer map is the only one.
import { describe, expect, it, vi } from "vitest";
import { BODY_LIMITS, YOUTUBE_TITLE_MAX } from "../limits";
import { buildPrompt, overLength, textsForAccounts, writeSocialPosts, writerKeysFor, WRITER_KEYS } from "../write-posts";

const answer = (o: Record<string, string>) => JSON.stringify(o);

describe("prompt", () => {
  it("states each platform's hard limit from BODY_LIMITS, Threads in UTF-8 bytes", () => {
    const p = buildPrompt({ article: "文章", keys: ["twitter_single", "threads", "email"] }, ["twitter_single", "threads", "email"]);
    expect(p).toContain(`Hard limit: ${BODY_LIMITS.x} characters including hashtags and links.`);
    expect(p).toContain(`Hard limit: ${BODY_LIMITS.threads} bytes in UTF-8`);
    expect(p).not.toMatch(/- email:[^\n]*Hard limit/);                // email has no platform limit
    expect(p).toContain('Use these exact keys: "twitter_single", "threads", "email"');
  });

  it("video posts carry the platform's video line, X included", () => {
    expect(buildPrompt({ article: "a", keys: ["twitter_single"], mediaType: "video" }, ["twitter_single"])).toContain("Copy for an X video post");
  });

  it("a platform with a hard limit states a character count only in its Hard limit phrase", () => {
    const limited = WRITER_KEYS.filter((k) => !["email", "whatsapp"].includes(k));
    const p = buildPrompt({ article: "a", keys: limited, mediaType: "video" }, limited);
    const stray = p.split("\n").filter((l) => l.startsWith("- ") && /\d+\s*(chars?|characters|bytes)\b/i.test(l.replace(/Hard limit:.*/, "")));
    expect(stray).toEqual([]);
  });
});

describe("overLength", () => {
  it("measures with the platform's own counting", () => {
    expect(overLength("twitter_single", "a".repeat(BODY_LIMITS.x))).toBeNull();
    expect(overLength("twitter_single", "a".repeat(BODY_LIMITS.x + 1))).toEqual({ length: BODY_LIMITS.x + 1, limit: BODY_LIMITS.x });
    // 200 Chinese characters = 600 UTF-8 bytes: over Threads' 500 even though it is "200 words"
    expect(overLength("threads", "字".repeat(200))).toEqual({ length: 600, limit: BODY_LIMITS.threads });
    expect(overLength("email", "a".repeat(100000))).toBeNull();
  });

  it("a thread is measured post by post", () => {
    expect(overLength("twitter_thread", ["1/2 " + "a".repeat(200), "2/2 " + "b".repeat(200)].join("\n"))).toBeNull();
    expect(overLength("twitter_thread", ["1/2 ok", "2/2 " + "b".repeat(300)].join("\n"))?.length).toBe(304);
  });
});

describe("writeSocialPosts", () => {
  it("one call when everything fits; [LINK] becomes the article URL", async () => {
    const ask = vi.fn().mockResolvedValueOnce(answer({ facebook: "看文章 [LINK]", linkedin: "短文" }));
    const r = await writeSocialPosts({ article: "a", keys: ["facebook", "linkedin"], articleUrl: "https://s.example/a" }, ask);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ posts: { facebook: "看文章 https://s.example/a", linkedin: "短文" }, tooLong: [], missing: [] });
  });

  it("an over-limit post gets one shorter rewrite of that platform only", async () => {
    const ask = vi.fn()
      .mockResolvedValueOnce(answer({ threads: "字".repeat(200), facebook: "好" }))
      .mockResolvedValueOnce(answer({ threads: "字".repeat(100) }));
    const r = await writeSocialPosts({ article: "a", keys: ["threads", "facebook"] }, ask);
    expect(ask).toHaveBeenCalledTimes(2);
    expect(ask.mock.calls[1][0]).toContain('Use these exact keys: "threads"');
    expect(ask.mock.calls[1][0]).toContain("too long: threads 600/500");
    expect(r).toEqual({ posts: { threads: "字".repeat(100), facebook: "好" }, tooLong: [], missing: [] });
  });

  it("still too long after the rewrite: reported, never silently cut", async () => {
    const ask = vi.fn().mockResolvedValue(answer({ twitter_single: "a".repeat(400) }));
    const r = await writeSocialPosts({ article: "a", keys: ["twitter_single"] }, ask);
    expect(r.tooLong).toEqual([{ key: "twitter_single", length: 400, limit: BODY_LIMITS.x }]);
    expect(r.posts.twitter_single).toHaveLength(400);
  });

  it("a platform the answer left out or gave a non-string for is asked again, then reported as missing", async () => {
    const ask = vi.fn()
      .mockResolvedValueOnce(answer({ facebook: "好" }).replace("}", ',"linkedin":123}'))
      .mockResolvedValueOnce(answer({ linkedin: "  " }));
    const r = await writeSocialPosts({ article: "a", keys: ["facebook", "linkedin", "threads"] }, ask);
    expect(ask.mock.calls[1][0]).toContain('Use these exact keys: "linkedin", "threads"');
    expect(r.missing).toEqual(["linkedin", "threads"]);
    expect(r.posts).toEqual({ facebook: "好" });
  });

  it("without an article URL the prompt forbids [LINK] and a placeholder written anyway is removed", async () => {
    const ask = vi.fn().mockResolvedValueOnce(answer({ instagram: "好文 [LINK]\n#tag" }));
    const r = await writeSocialPosts({ article: "a", keys: ["instagram"] }, ask);
    expect(ask.mock.calls[0][0]).toContain("There is no article link: do not write [LINK]");
    expect(r.posts.instagram).toBe("好文\n#tag");
  });

  it("an unreadable first answer is an error; an unreadable rewrite keeps the first answer marked too long", async () => {
    await expect(writeSocialPosts({ article: "a", keys: ["facebook"] }, async () => "not json {")).rejects.toThrow("Failed to parse");
    const ask = vi.fn().mockResolvedValueOnce(answer({ twitter_single: "a".repeat(300) })).mockResolvedValueOnce("{oops");
    const r = await writeSocialPosts({ article: "a", keys: ["twitter_single"] }, ask);
    expect(r.tooLong.map((t) => t.key)).toEqual(["twitter_single"]);
  });
});

describe("Postiz channels <-> writer keys (the only map)", () => {
  it("asks once per writer key; X and Bluesky share the single post; unsupported platforms are left out", () => {
    expect(writerKeysFor(["bluesky", "x", "facebook", "linkedin-page", "mastodon"])).toEqual(["twitter_single", "facebook", "linkedin"]);
  });

  it("each channel gets its own text unless it is missing, empty or too long", () => {
    const texts = textsForAccounts(
      { posts: { twitter_single: " short one ", facebook: "", linkedin: "x".repeat(10) }, tooLong: [{ key: "linkedin", length: 9999, limit: 3000 }] },
      [{ id: "b", platform: "bluesky" }, { id: "f", platform: "facebook" }, { id: "l", platform: "linkedin" }, { id: "m", platform: "mastodon" }],
    );
    expect(texts).toEqual({ b: "short one" });
  });
});

describe("youtube title line", () => {
  it("a title over its own limit is over length even when the whole text fits", () => {
    expect(overLength("youtube", `${"a".repeat(YOUTUBE_TITLE_MAX)}\n\nshort description`)).toBeNull();
    expect(overLength("youtube", `${"a".repeat(YOUTUBE_TITLE_MAX + 1)}\n\nshort description`)).toEqual({ length: YOUTUBE_TITLE_MAX + 1, limit: YOUTUBE_TITLE_MAX });
  });
});
