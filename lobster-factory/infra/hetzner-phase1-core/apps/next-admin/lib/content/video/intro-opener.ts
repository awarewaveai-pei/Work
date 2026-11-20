// Card R2: an automatic video's intro (片頭), made right before the render is sent (lib/content/blocks/video-pipeline.ts).
// The style comes from the site's setting in turn (public/editor-shared/intro-styles.js introStyleFor); the title is the
// video's title and the picture is the video's first shot in its first format -- an automatic video has no cover yet when
// it is sent (covers are cut from the finished file), so the first shot stands in for it. The template's video is made by
// remotion-service (NT$0) and joined by video-service like any template intro, with a 0.5 s crossfade.
// Invariant: an intro never stops a video -- every failure (no service, timeout, a picture that is not a still) is
// { note } and the video is sent without one.
import { autoFill, INTRO_TEMPLATES } from "../../../public/editor-shared/intro-styles.js";
import { pollRemotion, submitRemotion } from "./remotion-client";
import type { RenderBookends } from "./render-client";
import Transitions from "../../../public/editor-shared/transitions.js";

export interface IntroStyle { id: string; label: string; kind: string }
export interface IntroResult { bookends?: RenderBookends; note?: string }

/** The join: the site's transition (brand-voice.ts siteIntroTransition, default 溶解) as video-service names it, 0.5 s
 *  (card R2 item 11); a title card is 3 s (video-service's own default). */
const joinOf = (transition: string | undefined) => ({ transition: Transitions.bookend(transition ?? Transitions.AUTO.id) ?? Transitions.bookend(Transitions.AUTO.id), transitionSeconds: Transitions.AUTO.seconds });
export const TITLE_CARD_SECONDS = 3;
/** The whole intro step (picture + render + polls) gets this long; the render's own prepare stays under ~100 s + this. */
export const INTRO_BUDGET_MS = 45_000;
const POLL_MS = 2_000;
const FPS = 30;
const SIZES: Record<string, [number, number]> = { "16x9": [1920, 1080], "9x16": [1080, 1920], "4x5": [1080, 1350] };
const MAX_PICTURE_BYTES = 15 * 1024 * 1024;

export interface IntroDeps {
  submit: typeof submitRemotion;
  poll: typeof pollRemotion;
  /** The picture as a JPEG data: URI at w x h (cover-fit); throws when it is not a still picture. */
  picture: (url: string, w: number, h: number, signal: AbortSignal) => Promise<string>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

async function pictureDataUri(url: string, w: number, h: number, signal: AbortSignal): Promise<string> {
  if (!/^https:\/\//.test(url)) throw new Error("第一個鏡頭的畫面不是 https 網址");
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`第一個鏡頭的畫面下載失敗（HTTP ${r.status}）`);
  if (!String(r.headers.get("content-type") ?? "").startsWith("image/")) throw new Error("第一個鏡頭是影片，不是圖片，無法當片頭背景");
  const bytes = Buffer.from(await r.arrayBuffer());
  if (bytes.length > MAX_PICTURE_BYTES) throw new Error("第一個鏡頭的畫面太大");
  const sharp = (await import("sharp")).default;
  const jpeg = await sharp(bytes).resize(w, h, { fit: "cover" }).jpeg({ quality: 82 }).toBuffer();
  return "data:image/jpeg;base64," + jpeg.toString("base64");
}

const realDeps: IntroDeps = {
  submit: submitRemotion, poll: pollRemotion, picture: pictureDataUri,
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)), now: () => Date.now(),
};

/** The intro for one automatic video (single format: an asset intro is shared by every ratio in video-service). */
export async function makeIntro(style: IntroStyle | null, v: { title: string; firstPicture?: string; format: string; transition?: string },
  deps: IntroDeps = realDeps): Promise<IntroResult> {
  if (!style || style.kind === "none") return {};
  const title = v.title.replace(/\s+/g, " ").trim();
  if (!title) return { note: "影片沒有標題，沒有加片頭" };
  if (style.kind === "title") return { bookends: { intro: { title: title.slice(0, 80), duration: TITLE_CARD_SECONDS }, ...joinOf(v.transition) } };
  const template = INTRO_TEMPLATES.find((t) => t.id === style.id), fill = template && autoFill(template);
  const size = SIZES[v.format];
  if (!template || !fill) return { note: `片頭樣式「${style.label}」不能自動做，沒有加片頭` };
  if (!size) return { note: `片頭不支援 ${v.format} 比例，沒有加片頭` };
  if (!v.firstPicture) return { note: "沒有第一個鏡頭的畫面，沒有加片頭" };
  const until = deps.now() + INTRO_BUDGET_MS;
  try {
    const picture = await deps.picture(v.firstPicture, size[0], size[1], AbortSignal.timeout(INTRO_BUDGET_MS));
    const max = template.fields.find((f) => f.key === fill.textKey)?.max ?? 80;
    const seconds = template.autoSeconds ?? template.seconds.def;   // the shortest length that still shows the whole title
    const sent = await deps.submit(template.id, { [fill.imageKey]: picture, [fill.textKey]: title.slice(0, max) },
      { outputFormat: v.format as "16x9", fps: FPS, durationInFrames: seconds * FPS });
    if (!sent.ok) return { note: `片頭沒有做成（${(sent as { error: string }).error}），影片照樣出，沒有片頭` };
    while (deps.now() < until) {
      await deps.sleep(POLL_MS);
      const p = await deps.poll(sent.jobId);
      if (p.status === "done") {
        if (!/^https:\/\//.test(p.url)) return { note: "片頭做好了但沒有可用的網址，影片照樣出，沒有片頭" };
        return { bookends: { intro: { assetUrl: p.url }, ...joinOf(v.transition) } };
      }
      if (p.status === "error") return { note: `片頭沒有做成（${p.error}），影片照樣出，沒有片頭` };
    }
    return { note: `片頭 ${Math.round(INTRO_BUDGET_MS / 1000)} 秒內沒有做好，影片照樣出，沒有片頭` };
  } catch (e) {
    return { note: `片頭沒有做成（${e instanceof Error ? e.message : String(e)}），影片照樣出，沒有片頭` };
  }
}
