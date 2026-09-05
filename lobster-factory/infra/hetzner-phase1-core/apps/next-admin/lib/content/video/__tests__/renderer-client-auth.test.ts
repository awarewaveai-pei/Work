import { afterEach, describe, expect, it, vi } from "vitest";
import { pollRemotion, submitRemotion } from "../remotion-client";
import { pollRenderJob, submitRender } from "../render-client";

const AUTH_ENV_KEYS = [
  "MEDIA_RENDER_AUTH_TOKEN",
  "VIDEO_SERVICE_SECRET",
  "REMOTION_AUTH_TOKEN",
  "VIDEO_SERVICE_URL",
  "REMOTION_SERVICE_URL",
] as const;

const originalEnvironment = Object.fromEntries(
  AUTH_ENV_KEYS.map((key) => [key, process.env[key]]),
);

function resetEnvironment(): void {
  for (const key of AUTH_ENV_KEYS) {
    const original = originalEnvironment[key];
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  }
}

afterEach(() => {
  resetEnvironment();
  vi.unstubAllGlobals();
});

describe("renderer clients authentication", () => {
  it("sends the canonical header for Quick Engine render and job polling", async () => {
    process.env.MEDIA_RENDER_AUTH_TOKEN = "test-canonical";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ jobId: "quick-job" }), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "running" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(submitRender([{ id: 1, narration: "test" }], ["https://asset.test/a.png"], "test", "http://quick.test"))
      .resolves.toMatchObject({ ok: true, jobId: "quick-job" });
    await expect(pollRenderJob("quick-job", "http://quick.test"))
      .resolves.toEqual({ status: "running" });

    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ "X-Render-Token": "test-canonical" });
    expect(fetchMock.mock.calls[1][1]?.headers).toEqual({ "X-Render-Token": "test-canonical" });
  });

  it("sends the canonical header for Remotion render and status polling", async () => {
    process.env.MEDIA_RENDER_AUTH_TOKEN = "test-canonical";
    process.env.REMOTION_SERVICE_URL = "http://remotion.test";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ jobId: "remotion-job" }), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "rendering" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(submitRemotion("dynamic-slideshow", {})).resolves.toEqual({ ok: true, jobId: "remotion-job" });
    await expect(pollRemotion("remotion-job")).resolves.toEqual({ status: "rendering" });

    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ "X-Render-Token": "test-canonical" });
    expect(fetchMock.mock.calls[0][1]?.headers).not.toHaveProperty("Authorization");
    expect(fetchMock.mock.calls[1][1]?.headers).toEqual({ "X-Render-Token": "test-canonical" });
  });

  it("does not call Quick Engine when its credential is absent", async () => {
    delete process.env.MEDIA_RENDER_AUTH_TOKEN;
    delete process.env.VIDEO_SERVICE_SECRET;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(submitRender([{ id: 1, narration: "test" }], ["https://asset.test/a.png"], "test"))
      .resolves.toMatchObject({ ok: false, status: 503, error: "renderer authentication is not configured" });
    await expect(pollRenderJob("quick-job"))
      .resolves.toEqual({ status: "error", error: "renderer authentication is not configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not call Remotion when its credential is absent", async () => {
    delete process.env.MEDIA_RENDER_AUTH_TOKEN;
    delete process.env.REMOTION_AUTH_TOKEN;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(submitRemotion("dynamic-slideshow", {}))
      .resolves.toEqual({ ok: false, error: "renderer authentication is not configured" });
    await expect(pollRemotion("remotion-job"))
      .resolves.toEqual({ status: "error", error: "renderer authentication is not configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
