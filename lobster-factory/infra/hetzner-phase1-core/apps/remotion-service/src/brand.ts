/**
 * The title look every template shares: ScaleBGTextSlideUp (片頭) and Cover (封面) read it from here, so a cover's
 * title is the 片頭's title. Change a value here, not in a composition.
 * The container has fonts-noto-cjk (Dockerfile); 'Oswald' is not installed, so Latin falls through to Noto Sans CJK TC.
 */
export const TITLE_FONT_FAMILY = "'Oswald', 'Noto Sans CJK TC', sans-serif";
export const TITLE_FONT_WEIGHT = 700;
/** The cover's optional line under the title. */
export const SUBTITLE_FONT_WEIGHT = 500;
export const TITLE_COLOR = "#FFFFFF";
export const TITLE_SHADOW = "0 2px 8px rgba(0,0,0,0.6)";
export const TITLE_LINE_HEIGHT = 1.25;
/** em; the layout's width estimate (cover-layout.ts) adds it per character. */
export const TITLE_LETTER_SPACING_EM = 0.02;
/** The dark layer under a title (片頭: whole frame; 封面: from the bottom up to the title). */
export const OVERLAY_COLOR = "rgba(40, 40, 40, 0.72)";
/** Behind the picture while it loads, and around one that does not fill the frame. */
export const BACKDROP_COLOR = "#000000";
