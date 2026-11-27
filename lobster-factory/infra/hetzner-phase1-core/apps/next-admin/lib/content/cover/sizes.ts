// K29: which size of article cover each social platform takes -- the ONE table (a new platform = one more row). The
// website's featured image stays 1200x900 (K24/K25); a platform not in the table gets that one. YouTube is not here: it
// takes videos only, so its draft never gets a cover (make.ts attachTopicCover). Browser-safe: pure, no server imports.
import { VALID_ASPECT_RATIOS, type AspectRatio } from "@/lib/studio/model-options";
import { layoutCover } from "./layout";

export interface CoverSize { width: number; height: number }

/** The website's featured image (and every platform the table does not name). */
export const SITE_COVER_SIZE: CoverSize = { width: 1200, height: 900 };
const PORTRAIT: CoverSize = { width: 1080, height: 1350 };

/** platform (social_accounts.platform) -> cover size; source = how sure we are (checked by the supervisor 2026-11-25). */
export const COVER_SIZES: Readonly<Record<string, CoverSize & { source: string }>> = {
  facebook: { ...PORTRAIT, source: "第三方：無官方明文，多份整理一致引用 Meta 建議 4:5" },
  instagram: { ...PORTRAIT, source: "官方：發文說明與 Graph API 1.91:1 到 4:5" },
  "instagram-standalone": { ...PORTRAIT, source: "官方：同 Instagram" },
  bluesky: { ...PORTRAIT, source: "未證實：照上傳比例顯示、太長才裁；上線後看第一則實際貼文" },
  threads: { ...PORTRAIT, source: "未證實：比照 Instagram 4:5" },
  linkedin: { ...PORTRAIT, source: "未證實：第三方整理 4:5" },
  "linkedin-page": { ...PORTRAIT, source: "未證實：同 LinkedIn" },
  x: { width: 1200, height: 675, source: "第三方：16:9 整張顯示" },
  pinterest: { width: 1000, height: 1500, source: "官方：2:3（1000×1500）" },
};

export const sizeKey = (s: CoverSize): string => `${s.width}x${s.height}`;
const SITE_KEY = sizeKey(SITE_COVER_SIZE);
export const isSiteSize = (s: CoverSize): boolean => sizeKey(s) === SITE_KEY;

export function coverSizeFor(platform: string): CoverSize {
  const row = COVER_SIZES[platform];
  return row ? { width: row.width, height: row.height } : { ...SITE_COVER_SIZE };
}

/** The one size a draft's cover is, from its channels: the size most of them take; a tie goes to the portrait 4:5, then
 *  the website's, then the table's order. `mismatched` = the channels that get a size not their own (a check names them). */
export function draftCoverSize(platforms: readonly string[]): { size: CoverSize; mismatched: string[] } {
  const counts = new Map<string, { size: CoverSize; n: number }>();
  for (const p of platforms) {
    const s = coverSizeFor(p), k = sizeKey(s);
    counts.set(k, { size: s, n: (counts.get(k)?.n ?? 0) + 1 });
  }
  if (!counts.size) return { size: { ...SITE_COVER_SIZE }, mismatched: [] };
  const top = Math.max(...[...counts.values()].map((c) => c.n));
  const tied = [...counts.entries()].filter(([, c]) => c.n === top).map(([k]) => k);
  const order = [sizeKey(PORTRAIT), SITE_KEY, ...Object.values(COVER_SIZES).map(sizeKey)];
  const key = order.find((k) => tied.includes(k)) ?? tied[0];
  return { size: counts.get(key)!.size, mismatched: platforms.filter((p) => sizeKey(coverSizeFor(p)) !== key) };
}

/** The sizes a topic's drafts take (each draft = its channels' platforms), each once, in the drafts' order. */
export function coverSizesFor(drafts: ReadonlyArray<readonly string[]>): CoverSize[] {
  const out = new Map<string, CoverSize>();
  for (const d of drafts) if (d.length) { const s = draftCoverSize(d).size; out.set(sizeKey(s), s); }
  return [...out.values()];
}

// The ratios every image model draws (the one list, browser-safe: lib/studio/model-options).
const RATIOS = VALID_ASPECT_RATIOS;

/** The drawable ratio closest to the cover's picture area at this size (K24's layout: the band takes the bottom quarter,
 *  so 1200x900 -> 1200x675 = 16:9, 1080x1350 -> 1080x1012 ~ 1:1). */
export function baseRatioFor(size: CoverSize): AspectRatio {
  const { image } = layoutCover({ ...size, title: "-" });
  const r = image.width / image.height;
  const off = (x: string) => { const [w, h] = x.split(":").map(Number); return Math.abs(Math.log(r / (w / h))); };
  return RATIOS.reduce<AspectRatio>((best, x) => (off(x) < off(best) ? x : best), RATIOS[0]);
}

/** The base pictures to draw beyond the website's one: one per ratio the drafts' sizes need (shared by every size on it). */
export function extraBaseRatios(sizes: readonly CoverSize[]): AspectRatio[] {
  const site = baseRatioFor(SITE_COVER_SIZE);
  return [...new Set(sizes.map(baseRatioFor))].filter((r) => r !== site);
}
