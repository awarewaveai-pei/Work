// R4-E (operator 2026-11-29, her crop sheets + numbers): ONE 16:9 master serves every picked size by cropping.
// 1. frameMaster: the 16:9 frame on the generated picture that puts the MEASURED product (never the requested area --
//    T1 and R4-E run 1: the AI drew it ~2x the asked height) at MASTER_TARGET. Too small = frame inside the picture
//    (free); too big / too near an edge = the frame reaches outside it and those margins are outpainted (priced).
// 2. masterCrop: each size cut from that frame -- wide sizes put the product centre at their WIDE_PRODUCT_X share
//    (the words keep the left), tall / square ones centre on the product. A crop always holds the whole product box
//    (+ margin where the picture leaves room for it: a product against the picture's edge gets none on that side);
//    a size that cannot is `ok: false` (draw it on its own, priced). A box that is not a real box on the picture
//    (zero / NaN / partly outside it) is refused, never cropped.
import { PRESETS, type PresetKey } from "./banner-state";

export interface PxRect { x: number; y: number; w: number; h: number }
export type MasterCrop =
  | { key: PresetKey; ok: true; crop: PxRect; out: { w: number; h: number }; upscale: number }
  | { key: PresetKey; ok: false; reason: "product_too_tall" | "product_too_wide" | "bad_box" };

/** Operator 2026-11-29: on the 16:9 master the product centre sits at x 75% / y 57% and is 45% of the height. */
export const MASTER_TARGET = { cx: 0.75, cy: 0.57, h: 0.45 } as const;
export const MASTER_RATIO = 16 / 9;
/** Operator 2026-11-29: the product centre's share of the width on the wide sizes cut narrower than the master. */
export const WIDE_PRODUCT_X: Partial<Record<PresetKey, number>> = { r16x9: 0.75, r16x9hero: 0.75, r3x2: 0.73, r4x3: 0.70 };
/** A frame passing the picture's edge by at most this share of its width is pulled inside instead of outpainted
 *  (a 3 px overrun is not worth a paid expand; float noise must not flip the decision). */
export const OUTSIDE_TOLERANCE = 0.005;
/** A real box on a real W x H picture: finite, positive size, wholly on the picture. */
export function boxOnPicture(W: number, H: number, p: PxRect): boolean {
  const fin = [W, H, p.x, p.y, p.w, p.h].every(Number.isFinite);
  return fin && W > 0 && H > 0 && p.w > 0 && p.h > 0 && p.x >= 0 && p.y >= 0 && p.x + p.w <= W && p.y + p.h <= H;
}

/** Above this the crop is enlarged by more than ~5% to reach the size's pixels: run it through the upscaler. */
export const UPSCALE_OVER = 1.05;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/** The 16:9 frame (picture px, may reach outside `W`x`H`) that puts product box `p` at MASTER_TARGET; null = `p` is
 *  not a real box on the picture. Passing an edge by <= OUTSIDE_TOLERANCE of the width: shifted inside (no outpaint). */
export function frameMaster(W: number, H: number, p: PxRect): { frame: PxRect; outside: boolean } | null {
  if (!boxOnPicture(W, H, p)) return null;
  const fh = p.h / MASTER_TARGET.h, fw = fh * MASTER_RATIO, tol = OUTSIDE_TOLERANCE * fw;
  let x = p.x + p.w / 2 - MASTER_TARGET.cx * fw, y = p.y + p.h / 2 - MASTER_TARGET.cy * fh;
  const outside = x < -tol || y < -tol || x + fw > W + tol || y + fh > H + tol;
  if (outside) return { frame: { x, y, w: fw, h: fh }, outside };
  const w = Math.min(fw, W), h = Math.min(fh, H);
  x = clamp(x, 0, W - w); y = clamp(y, 0, H - h);
  return { frame: { x, y, w, h }, outside };
}

/** The crop of size `k` on a `W`x`H` master holding product box `p` with `margin` (share of the crop's short side). */
export function masterCrop(k: PresetKey, W: number, H: number, p: PxRect, margin = 0.04): MasterCrop {
  if (!boxOnPicture(W, H, p)) return { key: k, ok: false, reason: "bad_box" };
  const ps = PRESETS[k], r = ps.w / ps.h;
  const cw = Math.min(W, H * r), ch = cw / r; // the biggest crop of ratio r that fits the master
  const m = margin * Math.min(cw, ch);
  if (p.h + 2 * m > ch) return { key: k, ok: false, reason: "product_too_tall" };
  if (p.w + 2 * m > cw) return { key: k, ok: false, reason: "product_too_wide" };
  const pcx = p.x + p.w / 2, pcy = p.y + p.h / 2;
  const at = WIDE_PRODUCT_X[k] ?? (r >= 1.2 ? MASTER_TARGET.cx : 0.5);
  const x = clamp(pcx - at * cw, p.x + p.w + m - cw, p.x - m);
  const y = clamp(pcy - ch / 2, p.y + p.h + m - ch, p.y - m);
  // rounded as one rect: x + w never passes the picture's edge (separately rounded they overran it by 1 px)
  const w = Math.min(Math.round(cw), W), h = Math.min(Math.round(ch), H);
  const crop = { x: Math.round(clamp(x, 0, W - w)), y: Math.round(clamp(y, 0, H - h)), w, h };
  return { key: k, ok: true, crop, out: { w: ps.w, h: ps.h }, upscale: ps.w / crop.w };
}

/** Every picked size's crop on one master. */
export const masterCrops = (keys: readonly PresetKey[], W: number, H: number, p: PxRect): MasterCrop[] =>
  keys.map((k) => masterCrop(k, W, H, p));
