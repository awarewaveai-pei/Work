// The article video's starting settings: the article page's form starts from them and the content pipeline makes its
// videos with them, so an automatic video costs what the page's default does (stock footage, free voice: the script
// only). Browser-safe: no server imports.
import { computeVideoCost } from "./video-cost";

export const ARTICLE_VIDEO_DEFAULTS = {
  sceneCount: 6,
  customScenes: 3,
  imageModel: "pexels-all",
  /** One format: the article embeds it and the social post carries it (each extra format renders again). */
  formats: ["16x9"],
} as const;

/** "edge:zh-TW-HsiaoChenNeural" -> the render's ttsProvider / ttsVoice. */
export function parseVoiceModel(id: string): { ttsProvider: string; ttsVoice: string } {
  const [provider, ...rest] = id.split(":");
  return { ttsProvider: provider, ttsVoice: rest.join(":") };
}

/** A free voice in the article's language (the site's language setting). */
export function articleVideoVoice(language: string | undefined): string {
  return /^english/i.test(language ?? "") ? "edge:en-US-JennyNeural" : "edge:zh-TW-HsiaoChenNeural";
}

/** What one pipeline video costs, USD (lib/content/video/video-cost.ts, the cost model's prices). */
export function articleVideoCostUsd(): number {
  const d = ARTICLE_VIDEO_DEFAULTS;
  return computeVideoCost({
    totalScenes: d.sceneCount, customScenes: d.customScenes, brollScenes: d.sceneCount - d.customScenes,
    imageModel: d.imageModel, formatCount: d.formats.length, ttsProvider: "edge",
  }).totalUsd;
}
