/**
 * D6: which finished ratio a destination gets. Each list is the order of preference; the first ratio the video has wins,
 * so a video made in only one ratio still reaches every destination. `wordpress` = the embed in an article.
 */
export const RATIO_PREFERENCE: Record<string, readonly string[]> = {
  youtube: ["16x9", "9x16", "4x5"],
  linkedin: ["16x9", "4x5", "9x16"],
  x: ["16x9", "4x5", "9x16"],
  bluesky: ["16x9", "4x5", "9x16"],
  reddit: ["16x9", "4x5", "9x16"],
  wordpress: ["16x9", "4x5", "9x16"],
  instagram: ["4x5", "9x16", "16x9"],
  "instagram-standalone": ["4x5", "9x16", "16x9"],
  facebook: ["4x5", "16x9", "9x16"],
  threads: ["4x5", "9x16", "16x9"],
  pinterest: ["4x5", "9x16", "16x9"],
  tiktok: ["9x16", "4x5", "16x9"],
};
const FALLBACK = ["16x9", "4x5", "9x16"] as const;

/** The ratio a platform gets out of the ratios the video has; undefined when the video has none of them. */
export function ratioFor(platform: string, available: readonly string[]): string | undefined {
  return (RATIO_PREFERENCE[platform] ?? FALLBACK).find((r) => available.includes(r));
}

/** The ratio a finished video file is, read from its R2 name (`video/<dir>/<ratio>.mp4`). */
export function ratioOfUrl(url: string | null | undefined): string | undefined {
  return /\/(16x9|9x16|4x5)\.mp4(?:$|\?)/.exec(url ?? "")?.[1];
}

export const RATIO_LABEL: Record<string, string> = { "16x9": "橫式 16:9", "9x16": "直式 9:16", "4x5": "直式 4:5" };
