import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const DESIGNS = "https://pub-designs.r2.dev";
const VIDEO = "https://pub-video.r2.dev";
const get = (url: string) => GET(new Request(`http://localhost/api/tools/designs/download?url=${encodeURIComponent(url)}`));

beforeEach(() => {
  vi.stubEnv("POD_DESIGNS_ENABLED", "true");
  vi.stubEnv("R2_DESIGNS_PUBLIC_BASE", DESIGNS);
  vi.stubEnv("R2_VIDEO_PUBLIC_BASE", VIDEO);
  vi.stubGlobal("fetch", vi.fn(async () => new Response("bytes", { headers: { "content-type": "video/mp4" } })));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("GET /api/tools/designs/download -- every door's download", () => {
  it("streams a video-bucket object as an attachment", async () => {
    const res = await get(`${VIDEO}/video/a.mp4`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("attachment");
  });

  it("ends the download when the bucket stops sending, instead of hanging", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(fetch).mockResolvedValueOnce(new Response(new ReadableStream({ start() {} }), { headers: { "content-type": "video/mp4" } }));
      const res = await get(`${VIDEO}/video/a.mp4`);
      const read = res.body!.getReader().read();
      const outcome = expect(read).rejects.toThrow("upstream_stalled");
      await vi.advanceTimersByTimeAsync(30_000);
      await outcome;
    } finally {
      vi.useRealTimers();
    }
  });

  it("refuses any other host before fetching it", async () => {
    for (const url of [`https://pub-video.r2.dev.evil.test/a.mp4`, "https://example.com/a.png", `http://pub-video.r2.dev/a.mp4`]) {
      expect((await get(url)).status, url).toBe(400);
    }
    expect(fetch).not.toHaveBeenCalled();
  });
});
