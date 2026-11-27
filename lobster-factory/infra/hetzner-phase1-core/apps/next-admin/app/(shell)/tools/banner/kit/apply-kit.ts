// R2-C: a client's brand kit onto the design -- 套用到這張 (StepStyle: colours, fonts, logo) and AI 一鍵設計 (StepAi: fonts
// and logo; the AI assigns the colours from the kit palette and the contrast guard checks them).
import { urlToBlob } from "@/lib/studio/design-upload";
import type { State } from "../banner-state";
import type { BrandKit } from "./brand-kit";

/** The kit's colours in the brand roles only (main -> badge, accent -> accent / CTA). Text and background colours are the
 *  design's own (operator 2026-11-27), so the kit's text / background entries are not applied. */
function kitColorPatch(kit: BrandKit): Partial<State> {
  const [main, , accent] = kit.colors;
  return {
    ...(main ? { badgeColor: main } : {}),
    ...(accent ? { accentColor: accent, ctaBg: accent } : {}),
  };
}

const kitFontPatch = (kit: BrandKit): Partial<State> =>
  ({ headlineFont: kit.headlineFont, fontFamily: kit.bodyFont, headlineWeight: kit.headlineWeight, bodyWeight: kit.bodyWeight });

/** The kit's logo as a data URL (it lives in the bucket, another origin: read through our download route so the canvas
 *  stays exportable); null = the kit has none. Throws when it cannot be read. */
async function loadKitLogo(kit: BrandKit): Promise<string | null> {
  if (!kit.logo) return null;
  const blob = await urlToBlob(kit.logo);
  return new Promise<string>((ok, fail) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => fail(r.error); r.readAsDataURL(blob); });
}

/** Fonts and logo of the kit (colours too when `colors`). A logo that cannot be read is left out and named in `logoError`. */
export async function brandKitPatch(kit: BrandKit, colors: boolean): Promise<{ patch: Partial<State>; logoError: string | null }> {
  let logoImage: string | null = null, logoError: string | null = null;
  try { logoImage = await loadKitLogo(kit); } catch (err) { logoError = `logo 讀取失敗：${err instanceof Error ? err.message : String(err)}`; }
  return { patch: { ...(colors ? kitColorPatch(kit) : {}), ...kitFontPatch(kit), ...(logoImage ? { logoImage } : {}) }, logoError };
}
