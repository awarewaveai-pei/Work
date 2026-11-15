/** The ratios a finished video can be delivered in; the one list the ingest route validates against. */
export const DELIVERY_RATIOS: readonly string[] = ["16x9", "9x16", "4x5", "1x1", "4x3"];

/**
 * D6: which finished ratio a destination gets. Each list is the order of preference; the first ratio the video has wins.
 * Invariant: every list holds every DELIVERY_RATIOS entry, so a video made in only one ratio still reaches every
 * destination. Landscape platforms take 4:3 right after 16:9; feed platforms take 1:1 right after 4:5. `wordpress` = the
 * embed in an article.
 */
export const RATIO_PREFERENCE: Record<string, readonly string[]> = {
  youtube: ["16x9", "4x3", "9x16", "4x5", "1x1"],
  linkedin: ["16x9", "4x3", "4x5", "1x1", "9x16"],
  x: ["16x9", "4x3", "4x5", "1x1", "9x16"],
  bluesky: ["16x9", "4x3", "4x5", "1x1", "9x16"],
  reddit: ["16x9", "4x3", "4x5", "1x1", "9x16"],
  wordpress: ["16x9", "4x3", "4x5", "1x1", "9x16"],
  instagram: ["4x5", "1x1", "9x16", "16x9", "4x3"],
  "instagram-standalone": ["4x5", "1x1", "9x16", "16x9", "4x3"],
  facebook: ["4x5", "1x1", "16x9", "4x3", "9x16"],
  threads: ["4x5", "1x1", "9x16", "16x9", "4x3"],
  pinterest: ["4x5", "1x1", "9x16", "16x9", "4x3"],
  tiktok: ["9x16", "4x5", "1x1", "16x9", "4x3"],
};
export const RATIO_FALLBACK: readonly string[] = ["16x9", "4x3", "4x5", "1x1", "9x16"];

/** The ratio a platform gets out of the ratios the video has; undefined when the video has none of them. */
export function ratioFor(platform: string, available: readonly string[]): string | undefined {
  return (RATIO_PREFERENCE[platform] ?? RATIO_FALLBACK).find((r) => available.includes(r));
}

const FILE_RATIO = new RegExp(`/(${DELIVERY_RATIOS.join("|")})\\.mp4(?:$|\\?)`);
/** The ratio a finished video file is, read from its R2 name (`video/<dir>/<ratio>.mp4`). */
function ratioOfUrl(url: string | null | undefined): string | undefined {
  return FILE_RATIO.exec(url ?? "")?.[1];
}

// Invariant: an asset row's ratio is read ONLY through here (metadata.ratio first; file name = pipeline fallback); ratioOfUrl stays private.
export function ratioOfAsset(a: { object_url: string; metadata?: { ratio?: unknown } | null }): string | undefined {
  const m = a.metadata?.ratio;
  return typeof m === "string" && DELIVERY_RATIOS.includes(m) ? m : ratioOfUrl(a.object_url);
}

export const RATIO_LABEL: Record<string, string> = { "16x9": "橫式 16:9", "9x16": "直式 9:16", "4x5": "直式 4:5", "1x1": "方形 1:1", "4x3": "橫式 4:3" };
