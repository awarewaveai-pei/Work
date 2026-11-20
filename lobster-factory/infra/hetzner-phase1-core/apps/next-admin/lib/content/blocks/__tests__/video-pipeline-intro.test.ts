// Card R2: an automatic intro never stops the video. The pipeline asks for it before sending the render; a render refused
// because of the intro (4xx, or a video-service too old to join intros) goes again without it and says why; a 5xx or a
// network error is not sent twice (it may have started a render).
import { beforeEach, describe, expect, it, vi } from "vitest";

const submitRender = vi.hoisted(() => vi.fn());
const makeIntro = vi.hoisted(() => vi.fn());
vi.mock("../../video/render-client", () => ({ submitRender }));
vi.mock("../../video/intro-opener", () => ({ makeIntro }));
vi.mock("../../video/video-script-core", () => ({
  generateVideoScript: async () => ({ ok: true, title: "感恩節的心理學", scenes: [{ id: 1, narration: "第一句", image_prompt: "p", broll_keyword: "k", visual: "broll" }] }),
  reassignSceneVisuals: () => {},
}));
vi.mock("../../video/pexels", () => ({ fetchBrollUrl: async () => "https://images.pexels.com/a.jpg", fetchBrollVideoUrl: async () => null }));

import { byId } from "../registry";
import "../video-pipeline";

const intro = { bookends: { intro: { assetUrl: "https://r2.example/opener.mp4" }, transition: "crossfade", transitionSeconds: 0.5 } };
const run = () => byId("video/pipeline")!.run({ topic: "感恩", imageModel: "pexels-all", outputFormats: ["16x9"], organizationId: null,
  introStyle: { id: "cover-opener", label: "封面開場", kind: "cover" } } as never) as Promise<Record<string, unknown>>;

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "k";
  process.env.PEXELS_API_KEY = "k";
  submitRender.mockReset();
  makeIntro.mockReset().mockResolvedValue(intro);
});

describe("video/pipeline with an automatic intro", () => {
  it("sends the intro made from the first shot's picture and the video's title", async () => {
    submitRender.mockResolvedValue({ ok: true, jobId: "eu1" });
    const r = await run();
    expect(makeIntro).toHaveBeenCalledWith(expect.objectContaining({ id: "cover-opener" }), { title: "感恩節的心理學", firstPicture: "https://images.pexels.com/a.jpg", format: "16x9" });
    expect(submitRender).toHaveBeenCalledTimes(1);
    expect(submitRender.mock.calls[0][4].bookends).toEqual(intro.bookends);
    expect(r).toMatchObject({ ok: true, euJobId: "eu1", intro: { style: "cover-opener" } });
  });

  it("refused because of the intro: sent again without it, the reason on the job", async () => {
    submitRender.mockResolvedValueOnce({ ok: false, status: 400, error: "intro.asset_url 必須是 https:// URL" }).mockResolvedValueOnce({ ok: true, jobId: "eu2" });
    const r = await run();
    expect(submitRender).toHaveBeenCalledTimes(2);
    expect(submitRender.mock.calls[1][4].bookends).toBeUndefined();
    expect(r).toMatchObject({ ok: true, euJobId: "eu2", intro: { style: "cover-opener", note: expect.stringContaining("影片照樣出，沒有片頭") } });
  });

  it("an intro that was not made: the video goes out without one and the note says why", async () => {
    makeIntro.mockResolvedValue({ note: "片頭沒有做成（無法連線到 remotion-service），影片照樣出，沒有片頭" });
    submitRender.mockResolvedValue({ ok: true, jobId: "eu3" });
    const r = await run();
    expect(submitRender.mock.calls[0][4].bookends).toBeUndefined();
    expect(r).toMatchObject({ ok: true, intro: { note: expect.stringContaining("remotion-service") } });
  });

  it("a 5xx is not sent twice", async () => {
    submitRender.mockResolvedValue({ ok: false, status: 502, error: "提交渲染失敗（HTTP 502）" });
    const r = await run();
    expect(submitRender).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ ok: false, status: 502 });
  });
});
