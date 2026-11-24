// Article images (K10, operator 2026-11-24): what each picture shows, in which style, how many, at which ratio, on which
// model -- one place for the automatic pipeline (topics/make.ts), the article page (ContentStudio.tsx), the image route
// and the price (topics/cost.ts, budget.ts). Browser-safe: no server imports.
// Before K10 the prompt was the alt text (a Chinese phrase with no scene) plus a "social media graphic" suffix: a
// mindfulness article got a man in a suit and fake Chinese lettering.
import { STYLE_CATALOG } from "@/public/editor-shared/art-styles.js";
import { DEFAULT_IMAGE_MODEL, IMAGE_RATES } from "@/lib/ai/cost-model";

/** Body images (the article page can pick another per article). A program constant, not a site setting. */
export const ARTICLE_IMAGE_RATIO = "4:3" as const;
/** The cover's base picture: the finished cover is 4:3, but its picture area above the text block (K24's layout) is
 *  1200x675, so a 4:3 base would lose a quarter to the crop. A program constant. */
export const ARTICLE_COVER_RATIO = "16:9" as const;
/** The end of every article image prompt: image models draw fake lettering unless told not to. */
export const ARTICLE_IMAGE_TAIL = "No text, no letters, no captions, no watermark.";
/** A site or an article without a style: the catalog's photo look (STYLE_CATALOG key). */
export const ARTICLE_DEFAULT_STYLE = "寫實 photoreal｜照片寫實風格";

/** Body images: a short article 3, any other size 4. The cover is one more, drawn from its own scene. */
export const articleBodyImages = (articleSize?: string): number => (articleSize === "short" ? 3 : 4);

// the scene's quotes as models write them: "…", '…', “…”
const SCENE = String.raw`(?:\s+(?:"([^"\n]*)"|'([^'\n]*)'|“([^”\n]*)”))?`;

/** The placeholder the writer emits: ![alt](IMAGE_PLACEHOLDER_N "english scene"). The quoted scene is optional: drafts
 *  written before K10, or a model that left it out. Groups: 1 alt, 2 N, 3/4/5 the scene by quote kind (placeholderScene).
 *  A new RegExp each call (it is global). */
export const imagePlaceholders = () => new RegExp(String.raw`!\[([^\]]*)\]\(IMAGE_PLACEHOLDER_(\d+)${SCENE}\)`, "g");

/** The scene of an imagePlaceholders() match ("" = none). */
export const placeholderScene = (m: RegExpMatchArray): string => (m[3] ?? m[4] ?? m[5] ?? "").trim();

/** Placeholder N becomes a plain image: the scene (a title) never reaches WordPress -- both converters read everything
 *  inside the parentheses as the URL (markdown-to-blocks.ts, wordpress-core.ts). */
export function fillPlaceholder(markdown: string, n: string | number, url: string): string {
  return markdown.replace(new RegExp(String.raw`\]\(IMAGE_PLACEHOLDER_${n}${SCENE}\)`), () => `](${url})`);
}

/** The stored style key as used: a catalog key, else the photo default (old sites, a key the catalog dropped). */
export function articleStyleKey(key: unknown): string {
  return typeof key === "string" && STYLE_CATALOG.some((s) => s.zh === key) ? key : ARTICLE_DEFAULT_STYLE;
}

/** The style's English prompt (what the model reads). */
export function articleStylePrompt(key: unknown): string {
  const k = articleStyleKey(key);
  return STYLE_CATALOG.find((s) => s.zh === k)!.prompt;
}

/** scene (the writer's English description; the alt text when there is none) + style + the no-text tail. */
export function articleImagePrompt(scene: string, stylePrompt: string): string {
  const s = scene.trim().replace(/[.\s]+$/, "");
  const st = stylePrompt.trim().replace(/[.\s]+$/, "");
  return `${s}. ${st}. ${ARTICLE_IMAGE_TAIL}`;
}

/** Models an article image may use: drawn at once by generateTarotImage with no reference image (the article page's own
 *  menu). Not codex-image (it runs only detached from a browser request, for the operator: image-gen.ts generateCodex
 *  codex_not_deferred / codex_operator_only), not the pexels stock rows (no generator), not reference-only models. */
export const ARTICLE_IMAGE_MODELS = ["flux-schnell", "flux-dev", "ideogram-v3-balanced", "nano-banana-pro", "flux-2-max"] as const;

/** The site chose "None（不生成）" (SiteManager): its automatic articles get no images, and none are priced. */
export const articleImagesOff = (model: unknown): boolean => model === "none";

/** The site's image model as an article uses it: one of the above, else the default. */
export function articleImageModel(model: unknown): string {
  return typeof model === "string" && (ARTICLE_IMAGE_MODELS as readonly string[]).includes(model) ? model : DEFAULT_IMAGE_MODEL;
}

/** One article image's price on that model, USD. */
export const articleImageUsd = (model: unknown): number => (articleImagesOff(model) ? 0 : IMAGE_RATES[articleImageModel(model)]?.usd ?? 0);
