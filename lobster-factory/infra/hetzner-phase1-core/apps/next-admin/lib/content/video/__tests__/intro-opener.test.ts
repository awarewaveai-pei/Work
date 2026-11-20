// Card R2: the automatic intro -- which styles an automatic video can take, the site's styles in turn, and an intro that
// never stops a video (every failure is a note and no bookends).
import { describe, expect, it, vi } from "vitest";
import { INTRO_STYLES, INTRO_TEMPLATES, autoIntroStyles, introPlanFor, introStyleFor } from "@/public/editor-shared/intro-styles.js";
import { siteIntroCards, siteIntroStyles, siteIntroTransition } from "@/lib/content/brand-voice";
import { INTRO_BUDGET_MS, makeIntro, type IntroDeps } from "../intro-opener";
import { getDesignsPublicBase } from "@/lib/storage/r2";

const style = (id: string) => INTRO_STYLES.find((s) => s.id === id)!;
const deps = (over: Partial<IntroDeps> = {}): IntroDeps => {
  let t = 0;
  return {
    submit: vi.fn(async () => ({ ok: true as const, jobId: "rs1" })),
    poll: vi.fn(async () => ({ status: "done" as const, url: "https://r2.example/rs1.mp4" })),
    picture: vi.fn(async () => "data:image/jpeg;base64,AAAA"),
    sleep: async (ms) => { t += ms; },
    now: () => t,
    ...over,
  };
};
const video = { title: "  感恩節的心理學  ", firstPicture: "https://images.pexels.com/a.jpg", format: "16x9" };

describe("intro styles (one list for the editor and the site setting)", () => {
  it("lists none, the cover opener, the title card and every template; automatic = a title and one picture fill it", () => {
    expect(INTRO_STYLES.map((s) => s.id)).toEqual(["none", "cover-opener", "still-opener", "title-card", ...INTRO_TEMPLATES.filter((t) => !t.cover && !t.still).map((t) => t.id)]);
    expect(INTRO_STYLES.filter((s) => s.auto).map((s) => s.id)).toEqual(["none", "cover-opener", "still-opener", "title-card", "scale-bg-text-slideup", "circle-mask-text-slideup-reveal"]);
    for (const s of INTRO_STYLES) if (s.kind !== "none") expect(s.preview).toBe(`intro-styles/${s.id}.jpg`);
  });

  it("old data and junk = no intro; manual-only and unknown styles are dropped", () => {
    expect(siteIntroStyles(undefined)).toEqual([]);
    expect(siteIntroStyles({})).toEqual([]);
    expect(autoIntroStyles("cover-opener")).toEqual([]);
    expect(autoIntroStyles(["none", "product-review-typewriter", "nope", "cover-opener", "cover-opener"])).toEqual(["cover-opener"]);
    expect(introStyleFor(undefined, 3)).toBeNull();
  });

  it("several styles are taken in turn by the site's video count (no randomness: the same count = the same style)", () => {
    const ids = ["cover-opener", "title-card", "scale-bg-text-slideup"];
    expect([0, 1, 2, 3, 4].map((n) => introStyleFor(ids, n)?.id)).toEqual(["cover-opener", "title-card", "scale-bg-text-slideup", "cover-opener", "title-card"]);
    expect(introStyleFor(ids, 7)?.id).toBe(introStyleFor(ids, 7)?.id);
  });

  // card R3 named test: the site's rotation with banner cards -- each chosen design takes its own turn
  it("a banner card takes one turn per chosen design, in turn with the other ticked styles", () => {
    const plan = (n: number) => { const p = introPlanFor(["cover-opener", "still-opener", "title-card"], ["d1", "d2"], n); return p && (p.card ?? p.style?.id); };
    expect([0, 1, 2, 3, 4, 5].map(plan)).toEqual(["cover-opener", "d1", "d2", "title-card", "cover-opener", "d1"]);
    expect(introPlanFor(["still-opener"], ["d1", "d1", ""], 1)).toEqual({ style: style("still-opener"), card: "d1" });
  });

  // card R3 named test: old data -- a site saved before banner cards (no introCards) never gets one
  it("old data: no introCards field = no banner card; its other styles rotate as before", () => {
    expect(siteIntroCards(undefined)).toEqual([]);
    expect(siteIntroCards({ introStyles: ["cover-opener"] })).toEqual([]);
    expect(introPlanFor(["still-opener"], siteIntroCards({}), 4)).toBeNull();
    expect([0, 1, 2].map((n) => introPlanFor(["cover-opener", "still-opener", "title-card"], siteIntroCards({}), n)?.style?.id))
      .toEqual([0, 1, 2].map((n) => introStyleFor(["cover-opener", "title-card"], n)?.id));
  });
});

describe("makeIntro", () => {
  it("cover opener: the first shot's picture and the title, 2 s at 30 fps, joined by a 0.5 s crossfade", async () => {
    const d = deps();
    const r = await makeIntro(style("cover-opener"), video, d);
    expect(d.picture).toHaveBeenCalledWith(video.firstPicture, 1920, 1080, expect.any(AbortSignal));
    expect(d.submit).toHaveBeenCalledWith("cover-opener", { backgroundUrl: "data:image/jpeg;base64,AAAA", title: "感恩節的心理學" }, { outputFormat: "16x9", fps: 30, durationInFrames: 60 });
    expect(r).toEqual({ bookends: { intro: { assetUrl: "https://r2.example/rs1.mp4" }, transition: "fade", transitionSeconds: 0.5 } });
  });

  it("a template takes its own picture and title keys at its shortest length; the title card needs no render", async () => {
    const d = deps();
    await makeIntro(style("circle-mask-text-slideup-reveal"), video, d);
    expect(d.submit).toHaveBeenCalledWith("circle-mask-text-slideup-reveal", { imageUrl: "data:image/jpeg;base64,AAAA", headline: "感恩節的心理學" }, { outputFormat: "16x9", fps: 30, durationInFrames: 300 });
    const s = deps();
    await makeIntro(style("scale-bg-text-slideup"), video, s);   // its title only slides in from 3.8 s: 5 s, never its 3 s minimum
    expect(s.submit).toHaveBeenCalledWith("scale-bg-text-slideup", { imageUrl: "data:image/jpeg;base64,AAAA", text: "感恩節的心理學" }, { outputFormat: "16x9", fps: 30, durationInFrames: 150 });
    const t = deps();
    expect(await makeIntro(style("title-card"), video, t)).toEqual({ bookends: { intro: { title: "感恩節的心理學", duration: 3 }, transition: "fade", transitionSeconds: 0.5 } });
    expect(t.submit).not.toHaveBeenCalled();
  });

  it("the site's transition as video-service names it (the transitions module); unknown values = 溶解", async () => {
    const at = async (transition?: string) => (await makeIntro(style("title-card"), { ...video, transition }, deps())).bookends?.transition;
    expect([await at(), await at("溶解"), await at("黑場"), await at("無")]).toEqual(["fade", "fade", "fadeblack", "none"]);
    expect(siteIntroTransition(undefined)).toBe("溶解");
    expect(siteIntroTransition({ introTransition: "fade-black" })).toBe("黑場");      // an old name reads as the new one
    expect(siteIntroTransition({ introTransition: "向左擦除" })).toBe("向左擦除");
    expect(siteIntroTransition({ introTransition: "nope" })).toBe("溶解");
  });

  it("never stops the video: refused, failed, too slow, a clip instead of a picture, no service -- a note and no intro", async () => {
    const cases: Array<[Partial<IntroDeps>, RegExp]> = [
      [{ submit: vi.fn(async () => ({ ok: false as const, error: "無法連線到 remotion-service" })) }, /無法連線/],
      [{ poll: vi.fn(async () => ({ status: "error" as const, error: "渲染失敗" })) }, /渲染失敗/],
      [{ poll: vi.fn(async () => ({ status: "rendering" as const })) }, new RegExp(`${INTRO_BUDGET_MS / 1000} 秒內沒有做好`)],
      [{ picture: vi.fn(async () => { throw new Error("第一個鏡頭是影片，不是圖片，無法當片頭背景"); }) }, /是影片/],
      [{ poll: vi.fn(async () => ({ status: "done" as const, url: "http://insecure/x.mp4" })) }, /沒有可用的網址/],
    ];
    for (const [over, why] of cases) {
      const r = await makeIntro(style("cover-opener"), video, deps(over));
      expect(r.bookends).toBeUndefined();
      expect(r.note).toMatch(why);
    }
    expect((await makeIntro(style("cover-opener"), { ...video, firstPicture: undefined }, deps())).note).toMatch(/沒有第一個鏡頭/);
    expect(await makeIntro(null, video, deps())).toEqual({});
  });

  // card R3 named test: a design deleted since the site chose it skips that turn with the reason; the video goes on
  it("banner card: the design's picture cover-fit, no title; a deleted design is skipped with a note", async () => {
    const card = `${getDesignsPublicBase()}/designs/banner.png`, d = deps();
    const r = await makeIntro(style("still-opener"), { ...video, card }, d);
    expect(d.picture).toHaveBeenCalledWith(card, 1920, 1080, expect.any(AbortSignal), "橫幅字卡");
    expect(d.submit).toHaveBeenCalledWith("still-opener", { backgroundUrl: "data:image/jpeg;base64,AAAA" }, { outputFormat: "16x9", fps: 30, durationInFrames: 60 });
    expect(r.bookends?.intro).toEqual({ assetUrl: "https://r2.example/rs1.mp4" });
    const gone = deps();
    const skipped = await makeIntro(style("still-opener"), { ...video, card: null }, gone);
    expect(skipped).toEqual({ note: expect.stringMatching(/已不在我的設計/) });
    expect(gone.submit).not.toHaveBeenCalled();
    expect((await makeIntro(style("still-opener"), { ...video, card: null, cardProblem: "橫幅字卡讀取失敗（x）" }, deps())).note).toBe("橫幅字卡讀取失敗（x）");
  });
});
