// Body limits (lib/social/limits.ts): a comment has its platform's limit, as Postiz checks every value of a post (C21).
import { describe, expect, it } from "vitest";
import { commentsOverLimit } from "../limits";

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
