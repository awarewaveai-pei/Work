// Body limits (lib/social/limits.ts): a comment has its platform's limit, as Postiz checks every value of a post (C21).
import { describe, expect, it } from "vitest";
import { commentsOverLimit, hashtagCount, hashtagsOverLimit, keepHashtags } from "../limits";

describe("commentsOverLimit", () => {
  it("each comment against each channel's platform; numbered from 1; a platform without a limit never refuses", () => {
    const targets = [{ accountId: "bs", platform: "bluesky" }, { accountId: "th", platform: "threads" }, { accountId: "wp", platform: "wordpress" }];
    expect(commentsOverLimit(["short", "x".repeat(301), "字".repeat(200)], targets)).toEqual([
      { accountId: "bs", platform: "bluesky", length: 301, limit: 300, comment: 2 },
      { accountId: "th", platform: "threads", length: 600, limit: 500, comment: 3 },   // Threads counts UTF-8 bytes
    ]);
    expect(commentsOverLimit(["x".repeat(300)], targets)).toEqual([]);
  });
});

// Instagram 2026-11-20: a caption with 31 hashtags was refused at send (limit 30); nothing counted them before.
describe("hashtags", () => {
  const tags = (n: number) => Array.from({ length: n }, (_, i) => `#標籤${i}`).join(" ");
  it("counts hashtags, not '#' inside words, URLs or entities", () => {
    expect(hashtagCount("感恩 #感恩節 #心理學\n#Thanks_2026")).toBe(3);
    expect(hashtagCount("C# a#b https://x.com/p#top &#123; ##")).toBe(0);
  });

  it("keepHashtags keeps the first N, drops the rest and a line left empty; under the limit nothing changes", () => {
    expect(keepHashtags("正文\n\n#a #b #c\n#d #e", 3)).toBe("正文\n\n#a #b #c");
    expect(hashtagCount(keepHashtags(`正文\n\n${tags(31)}`, 30))).toBe(30);
    const ok = `正文  \n\n${tags(30)}`;
    expect(keepHashtags(ok, 30)).toBe(ok);
  });

  it("hashtagsOverLimit: Instagram's caption and each comment against 30; other platforms have no hashtag limit here", () => {
    const targets = [{ accountId: "ig", platform: "instagram", text: tags(31) }, { accountId: "fb", platform: "facebook", text: tags(40) }];
    expect(hashtagsOverLimit(targets, ["ok", tags(32)])).toEqual([
      { accountId: "ig", platform: "instagram", count: 31, limit: 30 },
      { accountId: "ig", platform: "instagram", count: 32, limit: 30, comment: 2 },
    ]);
    expect(hashtagsOverLimit([{ accountId: "ig", platform: "instagram", text: tags(30) }])).toEqual([]);
  });
});
