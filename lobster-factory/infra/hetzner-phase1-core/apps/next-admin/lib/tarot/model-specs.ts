// One place for what each image model reads and does (verified 2026-10-22 against vendor docs and the live Replicate
// schemas). Pure data, safe on client and server: buildCardPrompt reads `promptOrder`, the tarot studio reads
// `referenceRole`, image-gen reads `rewriteOff`, and /ops/ai-models renders the whole table. Change a model here, not
// in three places.
import type { TarotModel } from "./image-gen";

/** What a supplied image does inside the model. */
export type ReferenceRole =
  | "none"        // accepts no image
  | "init"        // img2img start image: the composition is inherited (flux-dev)
  | "edit"        // the image is edited (gpt-image-1 /images/edits)
  | "multimodal"  // general reference the prompt must explain (nano banana, flux-2-max)
  | "character";  // identity only: keeps who the figure is, not the layout (ideogram-character)

/** Reference images one /api/tools/tarot/generate request accepts (request size); the studio caps every model at
 *  min(model maximum, this) so the UI never offers a 6th image the route then refuses. */
export const MAX_REFS_PER_REQUEST = 5;

export interface ModelSpec {
  label: string;
  vendor: string;
  /** What the model reads, in the vendor's own unit, and what happens past it. */
  promptLimit: string;
  /** "content-first" = pose, scene and the painter's name before the long style detail, for models that cut or
   *  weaken late words; "style-second" = pose, then the full style, then the scene. */
  promptOrder: "content-first" | "style-second";
  referenceRole: ReferenceRole;
  /** The locked deck preview may be sent as this model's reference. Only an identity channel qualifies: an init or
   *  edit image copies the preview's composition into every card (THE LOVERS drew THE FOOL's cliff, 2026-10-22). */
  usesDeckPreview: boolean;
  rewrite: string;
  /** Replicate input that turns the provider's prompt rewriting off, sent on every call. */
  rewriteOff?: Record<string, string>;
  seed: boolean;
  negativePrompt: string;
  vendorOrder: string;
  notes?: string;
  sources: string[];
}

const BFL_T5 = "https://raw.githubusercontent.com/black-forest-labs/flux/main/src/flux/cli.py";
const BFL_NEG = "https://docs.bfl.ai/guides/prompting_guide_t2i_negative";
const IDEO_PROMPT = "https://docs.ideogram.ai/using-ideogram/getting-started/prompting-guide/3-prompt-structure";
const IDEO_V4 = "https://developer.ideogram.ai/api-reference/api-reference/generate-v4";
const GOOGLE_NB = "https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-nano-banana";
const OPENAI_IMG = "https://developers.openai.com/api/reference/cli/resources/images/index.md";
const OPENAI_GUIDE = "https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide";

const IDEOGRAM_V3_LIMIT = "about 150 words (~200 tokens); later words weaken or are ignored";
const NO_NEGATIVE_FLUX = "no field; negation words make it draw the named thing";

export const MODEL_SPECS: Record<TarotModel, ModelSpec> = {
  "flux-schnell": {
    label: "FLUX schnell", vendor: "Black Forest Labs (Replicate)",
    promptLimit: "256 T5 tokens (CLIP 77); the rest is cut silently",
    promptOrder: "content-first", referenceRole: "none", usesDeckPreview: false,
    rewrite: "none", seed: true, negativePrompt: NO_NEGATIVE_FLUX,
    vendorOrder: "no published order; the cut drops the end, so the scene goes first",
    sources: [BFL_T5, BFL_NEG, "https://replicate.com/black-forest-labs/flux-schnell"],
  },
  "flux-dev": {
    label: "FLUX dev", vendor: "Black Forest Labs (Replicate)",
    promptLimit: "512 T5 tokens; the rest is cut silently",
    promptOrder: "style-second", referenceRole: "init", usesDeckPreview: false,
    rewrite: "none", seed: true, negativePrompt: NO_NEGATIVE_FLUX,
    vendorOrder: "no published order",
    notes: "image = img2img start image; prompt_strength 1.0 = fully redrawn",
    sources: [BFL_T5, BFL_NEG, "https://raw.githubusercontent.com/replicate/cog-flux/main/predict.py"],
  },
  "flux-kontext-dev": {
    label: "FLUX Kontext dev", vendor: "Black Forest Labs (Replicate)",
    promptLimit: "512 T5 tokens", promptOrder: "style-second", referenceRole: "edit", usesDeckPreview: false,
    rewrite: "none", seed: false, negativePrompt: NO_NEGATIVE_FLUX,
    vendorOrder: "edit instruction: what changes and what stays",
    notes: "not offered in the tarot studio (mockup tool only)",
    sources: ["https://replicate.com/black-forest-labs/flux-kontext-dev"],
  },
  "flux-kontext-pro": {
    label: "FLUX Kontext pro", vendor: "Black Forest Labs (Replicate)",
    promptLimit: "512 T5 tokens", promptOrder: "style-second", referenceRole: "edit", usesDeckPreview: false,
    rewrite: "none", seed: false, negativePrompt: NO_NEGATIVE_FLUX,
    vendorOrder: "edit instruction: what changes and what stays",
    notes: "not offered in the tarot studio (mockup tool only)",
    sources: ["https://replicate.com/black-forest-labs/flux-kontext-pro"],
  },
  "flux-2-max": {
    label: "FLUX 2 Max", vendor: "Black Forest Labs (Replicate)",
    promptLimit: "no maximum published; BFL guide calls 80+ words long",
    promptOrder: "style-second", referenceRole: "multimodal", usesDeckPreview: false,
    rewrite: "BFL API upsamples by default (disable_pup); Replicate exposes no switch",
    seed: true, negativePrompt: "not supported; describe the wanted result",
    vendorOrder: "subject + action + style + context; earlier words weigh more",
    notes: "input_images (up to 8) not used here",
    sources: ["https://docs.bfl.ai/guides/prompting_guide_flux2", "https://replicate.com/black-forest-labs/flux-2-max"],
  },
  "ideogram-v2a-turbo": {
    label: "Ideogram v2a Turbo", vendor: "Ideogram (Replicate)",
    promptLimit: IDEOGRAM_V3_LIMIT + " (v3 guidance; no v2a docs)",
    promptOrder: "content-first", referenceRole: "none", usesDeckPreview: false,
    rewrite: "Magic Prompt, default Auto", rewriteOff: { magic_prompt_option: "Off" },
    seed: true, negativePrompt: "no field on Replicate",
    vendorOrder: "summary, subject, pose, secondary elements, setting, light, framing, finish",
    sources: [IDEO_PROMPT, "https://replicate.com/ideogram-ai/ideogram-v2a-turbo"],
  },
  "ideogram-v3-balanced": {
    label: "Ideogram v3 Balanced", vendor: "Ideogram (Replicate)",
    promptLimit: IDEOGRAM_V3_LIMIT, promptOrder: "content-first", referenceRole: "none", usesDeckPreview: false,
    rewrite: "Magic Prompt, default Auto", rewriteOff: { magic_prompt_option: "Off" },
    seed: true, negativePrompt: "no field on Replicate",
    vendorOrder: "summary, subject, pose, secondary elements, setting, light, framing, finish",
    notes: "style_reference_images (style only, URLs) exists but is not used yet",
    sources: [IDEO_PROMPT, "https://replicate.com/ideogram-ai/ideogram-v3-balanced"],
  },
  "ideogram-v4-turbo": {
    label: "Ideogram v4 Turbo", vendor: "Ideogram (Replicate)",
    promptLimit: "no limit published", promptOrder: "content-first", referenceRole: "none", usesDeckPreview: false,
    rewrite: "Magic Prompt always on for a text prompt; only json_prompt bypasses it",
    seed: false, negativePrompt: "not needed (asymmetric guidance)",
    vendorOrder: "natural language; JSON for complex layouts",
    sources: [IDEO_V4, "https://replicate.com/ideogram-ai/ideogram-v4-turbo"],
  },
  "ideogram-v4-quality": {
    label: "Ideogram v4 Quality", vendor: "Ideogram (Replicate)",
    promptLimit: "no limit published", promptOrder: "content-first", referenceRole: "none", usesDeckPreview: false,
    rewrite: "Magic Prompt always on for a text prompt; only json_prompt bypasses it",
    seed: false, negativePrompt: "not needed (asymmetric guidance)",
    vendorOrder: "natural language; JSON for complex layouts",
    sources: [IDEO_V4, "https://replicate.com/ideogram-ai/ideogram-v4-quality"],
  },
  "ideogram-character": {
    label: "Ideogram Character", vendor: "Ideogram (Replicate)",
    promptLimit: IDEOGRAM_V3_LIMIT + " (v3 guidance)", promptOrder: "content-first",
    referenceRole: "character", usesDeckPreview: true,
    rewrite: "Magic Prompt, default Auto", rewriteOff: { magic_prompt_option: "Off" },
    seed: true, negativePrompt: "no field",
    vendorOrder: "v3 guidance",
    notes: "one character reference image, required",
    sources: ["https://developer.ideogram.ai/api-reference/api-reference/generate-v3", "https://replicate.com/ideogram-ai/ideogram-character"],
  },
  "nano-banana-2": {
    label: "Nano Banana 2", vendor: "Google Gemini (Replicate)",
    promptLimit: "131,072 input tokens", promptOrder: "style-second", referenceRole: "multimodal", usesDeckPreview: false,
    rewrite: "none documented", seed: false, negativePrompt: "no field; use positive framing",
    vendorOrder: "subject + action + location + composition + style, as sentences",
    notes: "image_input: 'transform or use as reference'; the prompt must say what each image is for",
    sources: [GOOGLE_NB, "https://replicate.com/google/nano-banana-2"],
  },
  "nano-banana-pro": {
    label: "Nano Banana Pro", vendor: "Google Gemini (Replicate)",
    promptLimit: "65,536 input tokens", promptOrder: "style-second", referenceRole: "multimodal", usesDeckPreview: false,
    rewrite: "none documented", seed: false, negativePrompt: "no field; use positive framing",
    vendorOrder: "subject + action + location + composition + style, as sentences",
    notes: "allow_fallback_model stays off: its fallback is a ByteDance model",
    sources: [GOOGLE_NB, "https://replicate.com/google/nano-banana-pro"],
  },
  "imagen-4": {
    label: "Imagen 4", vendor: "Google (Replicate)",
    promptLimit: "no official limit found", promptOrder: "style-second", referenceRole: "none", usesDeckPreview: false,
    rewrite: "Vertex rewrites by default (enhancePrompt); Replicate exposes no switch",
    seed: false, negativePrompt: "not supported",
    vendorOrder: "subject, context, style",
    notes: "Google lists Imagen 4 as discontinued on Vertex (2026-06-30); still served on Replicate",
    sources: ["https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/imagen/4-0-generate", "https://replicate.com/google/imagen-4"],
  },
  "openai-low": {
    label: "GPT-Image-1 低", vendor: "OpenAI",
    promptLimit: "32,000 characters", promptOrder: "style-second", referenceRole: "edit", usesDeckPreview: false,
    rewrite: "none on the Images API", seed: false, negativePrompt: "no field",
    vendorOrder: "scene, subject, key details, constraints",
    notes: "with an image the call goes to /images/edits",
    sources: [OPENAI_IMG, OPENAI_GUIDE],
  },
  "openai-medium": {
    label: "GPT-Image-1 中", vendor: "OpenAI",
    promptLimit: "32,000 characters", promptOrder: "style-second", referenceRole: "edit", usesDeckPreview: false,
    rewrite: "none on the Images API", seed: false, negativePrompt: "no field",
    vendorOrder: "scene, subject, key details, constraints",
    notes: "with an image the call goes to /images/edits",
    sources: [OPENAI_IMG, OPENAI_GUIDE],
  },
  "openai-high": {
    label: "GPT-Image-1 高", vendor: "OpenAI",
    promptLimit: "32,000 characters", promptOrder: "style-second", referenceRole: "edit", usesDeckPreview: false,
    rewrite: "none on the Images API", seed: false, negativePrompt: "no field",
    vendorOrder: "scene, subject, key details, constraints",
    notes: "with an image the call goes to /images/edits",
    sources: [OPENAI_IMG, OPENAI_GUIDE],
  },
};
