// Banner brand kit (card C6): one kit per organization, kept in organizations.metadata.client_config.bannerKit -- the
// JSONB blob brandColors and the CIS brandKit already live in, so no migration. Pure: the route
// (app/api/tools/presets/brand-kit) and the browser both use these, so what is saved is what is read back.

export type BrandKit = {
  orgId?: string;
  name: string;
  /** https URL (a My Designs object) once saved; a data: URL only in memory before the save uploads it. */
  logo?: string;
  /** [主色, 輔色, 重點, 文字, 底], #rrggbb lowercase. */
  colors: string[];
  /** CSS font-family stacks, as BannerStudio's FONTS values. */
  headlineFont: string;
  bodyFont: string;
  headlineWeight: number;
  bodyWeight: number;
};

export const COLOR_ROLES = ["主色", "輔色", "重點", "文字", "底"] as const;

// Data defaults for a kit nobody filled in yet (they are banner content, not UI chrome).
const DEFAULT_TEXT = "#1a1a1a";
const DEFAULT_BG = "#ffffff";
export const DEFAULT_HEADLINE_FONT = "'Noto Serif TC', 'Songti TC', serif";
export const DEFAULT_BODY_FONT = "'Noto Sans TC', 'PingFang TC', sans-serif";

const HEX = /^#[0-9a-f]{6}$/i;
// A font-family stack goes into ctx.font and CSS: letters, digits, spaces, quotes, commas, hyphens only.
const FONT_OK = /^[\p{L}\p{N} '",\-_.]{1,120}$/u;
const MAX_URL = 2048;
const MAX_NAME = 60;

function hex(v: unknown): string | null {
  return typeof v === "string" && HEX.test(v.trim()) ? v.trim().toLowerCase() : null;
}
function font(v: unknown, fallback: string): string {
  return typeof v === "string" && FONT_OK.test(v.trim()) ? v.trim() : fallback;
}
function weight(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 100 && n <= 900 && n % 100 === 0 ? n : fallback;
}
/** Only an http(s) URL is stored; a data: URL is uploaded first (useBrandKit.save) so the org row stays small. */
export function storableLogo(v: unknown): string | undefined {
  if (typeof v !== "string" || v.length > MAX_URL) return undefined;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** Whether a logo URL is one the banner canvas can read (ours: the designs / video bucket). The server passes
 *  lib/storage/r2 isPublicBucketAsset; this file also runs in the browser, so it takes the check instead of importing it. */
export type OwnLogo = (url: string) => boolean;

/** The stored shape: anything else in the body is dropped. null when there is no usable kit. A logo the canvas could not
 *  read (`ownLogo` false: another website, whose image taints the canvas and our download route refuses) is dropped. */
export function sanitizeBrandKit(raw: unknown, ownLogo: OwnLogo = () => true): Omit<BrandKit, "orgId"> | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const colors = (Array.isArray(b.colors) ? b.colors : []).map(hex).filter((c): c is string => !!c).slice(0, COLOR_ROLES.length);
  if (colors.length === 0) return null;
  const name = typeof b.name === "string" && b.name.trim() ? b.name.trim().slice(0, MAX_NAME) : "品牌套組";
  const url = storableLogo(b.logo);
  const logo = url && ownLogo(url) ? url : undefined;
  return {
    name,
    ...(logo ? { logo } : {}),
    colors,
    headlineFont: font(b.headlineFont, DEFAULT_HEADLINE_FONT),
    bodyFont: font(b.bodyFont, DEFAULT_BODY_FONT),
    headlineWeight: weight(b.headlineWeight, 700),
    bodyWeight: weight(b.bodyWeight, 400),
  };
}

type ExistingBrand = {
  bannerKit?: unknown;
  brandColors?: { primary?: unknown; secondary?: unknown; accent?: unknown } | null;
  cis?: { logo?: { primary?: unknown }; typography?: { headingFont?: unknown; bodyFont?: unknown } } | null;
};

/** The org's kit: the saved bannerKit, else one built from its brand colours (the data org-search?brandColors=1 shows)
 *  and CIS logo / fonts. null when the org has neither. `saved` tells the panel which one it is; `externalLogo`: a logo
 *  was there but on another website, so it was left out (the panel asks for an upload). */
export function kitFromClientConfig(orgName: string, cc: ExistingBrand, ownLogo: OwnLogo = () => true): { kit: Omit<BrandKit, "orgId">; saved: boolean; externalLogo: boolean } | null {
  const outside = (v: unknown) => { const u = storableLogo(v); return !!u && !ownLogo(u); };
  const saved = sanitizeBrandKit(cc.bannerKit, ownLogo);
  if (saved) return { kit: saved, saved: true, externalLogo: outside((cc.bannerKit as { logo?: unknown } | undefined)?.logo) };
  const bc = cc.brandColors ?? {};
  const brand = [hex(bc.primary), hex(bc.secondary), hex(bc.accent)];
  const primary = brand[0] ?? brand[1] ?? brand[2];
  if (!primary) return null;
  const colors = [primary, brand[1] ?? primary, brand[2] ?? brand[1] ?? primary, DEFAULT_TEXT, DEFAULT_BG];
  const kit = sanitizeBrandKit({
    name: orgName,
    logo: cc.cis?.logo?.primary,
    colors,
    headlineFont: cc.cis?.typography?.headingFont,
    bodyFont: cc.cis?.typography?.bodyFont,
  }, ownLogo);
  return kit ? { kit, saved: false, externalLogo: outside(cc.cis?.logo?.primary) } : null;
}
