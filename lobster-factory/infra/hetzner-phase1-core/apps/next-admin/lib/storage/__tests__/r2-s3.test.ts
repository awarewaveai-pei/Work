import { beforeEach, describe, expect, it, vi } from "vitest";
import { presignPut } from "../r2-s3";

beforeEach(() => {
  vi.stubEnv("R2_ACCOUNT_ID", "acct123");
  vi.stubEnv("R2_S3_ACCESS_KEY_ID", "test-key-id");
  vi.stubEnv("R2_S3_SECRET_ACCESS_KEY", "test-secret");
});

describe("presignPut", () => {
  it("signs Content-Type into the URL (a PUT with another type is refused by R2) and expires as asked", async () => {
    const r = await presignPut("uploads/pending/org/x.png", "image/png", 600);
    expect(r.ok).toBe(true);
    const u = new URL((r as { ok: true; url: string }).url);
    expect(u.host).toBe("acct123.r2.cloudflarestorage.com");
    expect(u.searchParams.get("X-Amz-SignedHeaders")?.split(";")).toContain("content-type");
    expect(u.searchParams.get("X-Amz-Expires")).toBe("600");
    expect(u.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("no S3 credentials -> r2_s3_not_configured, no throw", async () => {
    vi.stubEnv("R2_S3_SECRET_ACCESS_KEY", "");
    expect(await presignPut("uploads/pending/org/x.png", "image/png", 600)).toEqual({ ok: false, error: "r2_s3_not_configured" });
  });
});
