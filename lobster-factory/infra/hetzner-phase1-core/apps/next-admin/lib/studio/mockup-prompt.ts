/**
 * Mockup Studio prompt assembly — pure functions, no I/O.
 *
 * Two output modes mirroring the MEGA Mockup Studio blueprint (POD_STUDIO_ROADMAP §B9-S):
 *   flat  — flat-lay garment on a surface with props
 *   model — a person wearing the garment in a scene
 *
 * Bakes in the three iron rules from the 2026-06-11 P0 realism validation:
 *   1. dark garments need per-element color locking
 *   2. chest-occluding poses hide the design
 *   3. the design image travels as image_input (handled by the caller, not here)
 */

export type MockupMode = "flat" | "model";
export type GarmentColor = "white" | "black";

export const GARMENTS: Record<string, { label: string; phrase: string }> = {
  tshirt: { label: "T-shirt (Bella 3001)", phrase: "Bella Canvas 3001 unisex crewneck t-shirt" },
  hoodie: { label: "Hoodie", phrase: "unisex pullover hoodie" },
  sweatshirt: { label: "Sweatshirt", phrase: "unisex crewneck sweatshirt" },
  tank: { label: "Tank Top", phrase: "unisex tank top" },
  youth: { label: "Youth Tee", phrase: "youth t-shirt" },
};

// ── Model tab: scene options (15) ─────────────────────────────────────────────
export const MODEL_SCENES = [
  { value: "studio-white", label: "攝影棚・白背景", phrase: "a professional studio with a clean white cyclorama backdrop" },
  { value: "studio-dark", label: "攝影棚・深色", phrase: "a professional studio with a dramatic charcoal backdrop" },
  { value: "urban-street", label: "城市街道", phrase: "a vibrant urban street with city architecture" },
  { value: "coffee-shop", label: "咖啡廳", phrase: "a cozy coffee shop interior with warm ambient lighting" },
  { value: "rooftop", label: "屋頂露台", phrase: "a stylish rooftop terrace overlooking the city skyline" },
  { value: "forest-path", label: "森林步道", phrase: "a serene forest path dappled with natural light" },
  { value: "beach", label: "海灘", phrase: "a golden sand beach with soft ocean waves" },
  { value: "loft", label: "工業風閣樓", phrase: "an industrial urban loft with exposed brick and large windows" },
  { value: "gym", label: "健身房", phrase: "a modern gym with fitness equipment as backdrop" },
  { value: "library", label: "圖書館／書店", phrase: "a cozy library with wooden shelves full of books" },
  { value: "art-gallery", label: "藝廊", phrase: "a minimalist art gallery with white walls and gallery lighting" },
  { value: "bedroom", label: "簡約臥室", phrase: "a clean minimalist bedroom with neutral tones and morning light" },
  { value: "runway", label: "時裝伸展台", phrase: "a fashion runway with dramatic spotlights" },
  { value: "warehouse", label: "工業倉庫", phrase: "a raw industrial warehouse with concrete floors and high ceilings" },
  { value: "park", label: "公園", phrase: "a sunny park with lush greenery and natural light" },
];

// ── Model tab: scene props (multi-select, 15) ─────────────────────────────────
export const MODEL_PROPS = [
  { value: "coffee-cup", label: "咖啡杯", phrase: "a coffee cup" },
  { value: "sunglasses", label: "墨鏡", phrase: "sunglasses as a prop" },
  { value: "skateboard", label: "滑板", phrase: "a skateboard" },
  { value: "book", label: "書本", phrase: "an open book" },
  { value: "smartphone", label: "手機", phrase: "a smartphone" },
  { value: "camera", label: "相機", phrase: "a vintage film camera" },
  { value: "tote-bag", label: "帆布包", phrase: "a canvas tote bag" },
  { value: "headphones", label: "耳機", phrase: "wireless headphones" },
  { value: "flowers", label: "花束", phrase: "fresh flowers" },
  { value: "bicycle", label: "自行車", phrase: "a bicycle" },
  { value: "guitar", label: "吉他", phrase: "an acoustic guitar" },
  { value: "notebook", label: "筆記本", phrase: "an open notebook and pen" },
  { value: "plant", label: "植物盆栽", phrase: "a lush potted plant" },
  { value: "backpack", label: "背包", phrase: "a stylish backpack" },
  { value: "vinyl-record", label: "黑膠唱片", phrase: "a vinyl record" },
];

// ── Flat tab: surface options (15) ────────────────────────────────────────────
export const FLAT_SURFACES = [
  { value: "white-marble", label: "白色大理石", phrase: "white marble with subtle grey veining" },
  { value: "light-oak", label: "淺橡木", phrase: "light oak wood grain surface" },
  { value: "dark-slate", label: "深灰石板", phrase: "dark slate stone surface" },
  { value: "linen", label: "亞麻布料", phrase: "natural linen fabric surface" },
  { value: "kraft-paper", label: "牛皮紙", phrase: "warm kraft paper surface" },
  { value: "black-concrete", label: "黑色消光混凝土", phrase: "black matte concrete surface" },
  { value: "terrazzo", label: "磨石子", phrase: "colorful terrazzo surface" },
  { value: "rattan", label: "籐編", phrase: "natural rattan wicker surface" },
  { value: "pink-cotton", label: "粉色棉織物", phrase: "soft pink blush cotton fabric surface" },
  { value: "eucalyptus", label: "白底尤加利葉", phrase: "white surface with scattered eucalyptus leaves" },
  { value: "pastel-gradient", label: "粉彩漸層", phrase: "soft pastel gradient background" },
  { value: "reclaimed-wood", label: "復古木板", phrase: "aged reclaimed wood with character marks" },
  { value: "black-glossy", label: "黑色光面", phrase: "black glossy reflective surface" },
  { value: "sand", label: "沙灘質感", phrase: "fine beach sand texture" },
  { value: "monstera", label: "龜背芋綠葉", phrase: "white surface with monstera tropical leaves" },
];

// ── Flat tab: arrangement styles (15) ─────────────────────────────────────────
export const FLAT_ARRANGEMENTS = [
  { value: "centered-hero", label: "中央主角構圖", phrase: "centered hero shot with the garment as the sole focal point" },
  { value: "diagonal-thirds", label: "對角三分法", phrase: "diagonally composed along the rule of thirds" },
  { value: "overhead-orbit", label: "正上俯視", phrase: "directly overhead flat-lay perspective" },
  { value: "scatter", label: "隨意散落", phrase: "casually deconstructed and scattered with organic arrangement" },
  { value: "editorial-symmetry", label: "對稱 Editorial", phrase: "perfectly symmetrical editorial composition" },
  { value: "ghost-mannequin", label: "Ghost Mannequin 隱形人", phrase: "ghost mannequin technique giving a 3D shape without a visible model" },
  { value: "knolling", label: "Knolling 整齊排列", phrase: "precise knolling-style grid with items aligned at 90 degrees" },
  { value: "shadow-play", label: "光影對比", phrase: "dramatic shadow play with strong light-and-shadow contrast" },
  { value: "lifestyle-stack", label: "生活感堆疊", phrase: "casual lifestyle-inspired stacking with layered depth" },
  { value: "minimal-negative", label: "極簡留白", phrase: "minimal composition with generous negative space" },
  { value: "layered-texture", label: "材質層疊", phrase: "richly layered texture composition with multiple surface materials" },
  { value: "campaign-closeup", label: "品牌特寫", phrase: "campaign-style close-up emphasizing fabric texture and print detail" },
  { value: "color-blocked", label: "色塊排列", phrase: "color-blocked row layout with complementary items" },
  { value: "natural-flow", label: "自然鬆散", phrase: "naturally draped and flowing arrangement" },
  { value: "angled-45", label: "45° 斜角", phrase: "45-degree angled dynamic composition" },
];

// Keep FLAT_STYLES alias for any legacy code
export const FLAT_STYLES = FLAT_ARRANGEMENTS;

// ── Flat tab: lighting options (10) ───────────────────────────────────────────
export const FLAT_LIGHTING = [
  { value: "north-window", label: "北窗漫射自然光", phrase: "soft diffused north window natural light, even and shadow-free" },
  { value: "hard-side-rim", label: "強側光輪廓", phrase: "hard directional side rim lighting creating dramatic depth shadows" },
  { value: "overhead-softbox", label: "頂部柔光箱", phrase: "overhead softbox studio lighting, clean and professional" },
  { value: "golden-backlight", label: "黃金時刻背光", phrase: "warm golden hour backlight with a romantic glowing halo" },
  { value: "ring-flat", label: "環形燈平光", phrase: "ring light producing flat even illumination with catchlights" },
  { value: "dual-fill", label: "雙側補光", phrase: "balanced dual fill lights with neutral tones" },
  { value: "low-key", label: "低調戲劇光", phrase: "dramatic low key lighting with deep shadows" },
  { value: "high-key", label: "高調全白光", phrase: "studio high key lighting with a bright airy feel" },
  { value: "candle-warm", label: "燭光暖調", phrase: "warm candlelight ambient glow, intimate and cozy" },
  { value: "neon-accent", label: "霓虹補光", phrase: "cool blue hour neon accent light, editorial and moody" },
];

// ── Flat tab: props (multi-select, 15) ────────────────────────────────────────
export const FLAT_PROPS = [
  { value: "crystals", label: "水晶原石", phrase: "raw crystals and gemstones" },
  { value: "dried-flowers", label: "乾燥花", phrase: "dried wildflowers" },
  { value: "coffee-beans", label: "咖啡豆", phrase: "scattered coffee beans" },
  { value: "cinnamon", label: "肉桂棒", phrase: "cinnamon sticks" },
  { value: "coins", label: "古董硬幣", phrase: "vintage coins" },
  { value: "sage-bundle", label: "鼠尾草束", phrase: "a sage bundle" },
  { value: "eucalyptus-sprigs", label: "尤加利葉", phrase: "eucalyptus sprigs" },
  { value: "tarot-cards", label: "塔羅牌", phrase: "tarot cards" },
  { value: "ribbon", label: "絲帶", phrase: "silk ribbon" },
  { value: "dried-citrus", label: "乾燥柑橘片", phrase: "dried citrus slices" },
  { value: "ink-pen", label: "鋼筆墨水", phrase: "a fountain pen and ink bottle" },
  { value: "small-candle", label: "蠟燭", phrase: "a small pillar candle" },
  { value: "shells", label: "貝殼", phrase: "seashells" },
  { value: "thread-spools", label: "彩色線軸", phrase: "colorful thread spools" },
  { value: "wax-seal", label: "蠟封章", phrase: "a wax seal stamp" },
];

// ── Model tab: lighting options (7) ───────────────────────────────────────────
export const MODEL_LIGHTING = [
  { value: "daylight", label: "Soft daylight", phrase: "soft natural daylight" },
  { value: "editorial", label: "Editorial studio", phrase: "clean editorial studio lighting" },
  { value: "window", label: "Soft window light", phrase: "soft window light" },
  { value: "golden-hour", label: "黃金時刻 Golden hour", phrase: "warm golden hour sunlight" },
  { value: "high-key", label: "High-key 全白", phrase: "bright high-key studio lighting" },
  { value: "low-key", label: "Low-key 戲劇側光", phrase: "dramatic low-key directional side lighting" },
  { value: "ring-light", label: "環形燈", phrase: "ring light with sharp catchlights" },
];

export const MODEL_POSES = [
  { value: "standing", label: "站姿・輕鬆", phrase: "standing casually with hands relaxed at their sides", occludes: false },
  { value: "hands-hips", label: "雙手叉腰", phrase: "standing confidently with hands on hips", occludes: false },
  { value: "pockets", label: "手插口袋", phrase: "standing with both hands in pockets", occludes: false },
  { value: "pointing", label: "指向鏡頭", phrase: "pointing one hand directly at the camera with a confident smile", occludes: false },
  { value: "chin", label: "托下巴・思考", phrase: "standing with one hand resting lightly on chin, thoughtful expression", occludes: false },
  { value: "stretch", label: "伸展手臂", phrase: "arms stretched loosely upward with a relaxed expression", occludes: false },
  { value: "half-turn", label: "側身半轉", phrase: "in a 45-degree half-turn, glancing back over the shoulder", occludes: false },
  { value: "walking", label: "行走", phrase: "walking naturally toward the camera with a relaxed stride", occludes: false },
  { value: "sitting", label: "坐姿", phrase: "sitting comfortably with good posture", occludes: false },
  { value: "sitting-floor", label: "盤腿坐地", phrase: "sitting cross-legged on the floor in a relaxed pose", occludes: false },
  { value: "crouching", label: "蹲姿", phrase: "crouching down with arms resting loosely on knees", occludes: false },
  { value: "leaning", label: "靠牆", phrase: "leaning casually against a wall with one shoulder", occludes: false },
  { value: "jumping", label: "跳躍", phrase: "captured mid-jump with a joyful expression, arms slightly raised", occludes: false },
  { value: "editorial", label: "Editorial 造型站姿", phrase: "in a dynamic editorial pose with an angled confident stance", occludes: false },
  { value: "arms-crossed", label: "交叉手臂（⚠ 遮設計）", phrase: "with arms crossed confidently", occludes: true },
  { value: "thumbs-up", label: "比讚", phrase: "giving a thumbs up with a warm smile", occludes: false },
];

export const MODEL_ETHNICITIES = [
  { value: "", label: "任意族裔" },
  { value: "East Asian", label: "東亞（黃皙）" },
  { value: "Southeast Asian", label: "東南亞（暖棕）" },
  { value: "South Asian", label: "南亞（中棕）" },
  { value: "Black", label: "黑人（深棕）" },
  { value: "White", label: "白人（白皙）" },
  { value: "Latina", label: "拉丁裔（橄欖）" },
  { value: "Middle Eastern", label: "中東（暖橄欖）" },
  { value: "Indigenous", label: "原住民族" },
  { value: "Mixed race", label: "混血" },
];

export const MODEL_GENDERS = [
  { value: "", label: "任意性別" },
  { value: "woman", label: "女性" },
  { value: "man", label: "男性" },
  { value: "androgynous person", label: "中性／非二元" },
];

export const MODEL_AGES = [
  { value: "", label: "任意年齡" },
  { value: "teenager", label: "青少年（13–17）" },
  { value: "in their 20s", label: "20 多歲" },
  { value: "in their 30s", label: "30 多歲" },
  { value: "in their 40s", label: "40 多歲" },
  { value: "in their 50s", label: "50 多歲" },
  { value: "60s or older", label: "60 歲以上" },
];

export const MODEL_BODY_TYPES = [
  { value: "", label: "任意體型" },
  { value: "slim build", label: "纖細" },
  { value: "petite frame", label: "嬌小" },
  { value: "athletic build", label: "運動型" },
  { value: "average build", label: "一般" },
  { value: "curvy hourglass figure", label: "曲線／沙漏" },
  { value: "plus-size", label: "豐滿 Plus-size" },
  { value: "tall and lean", label: "高挑纖長" },
];

export const MODEL_MAKEUP = [
  { value: "", label: "任意妝造" },
  { value: "bare skin with no makeup", label: "素顏" },
  { value: "very light natural makeup", label: "輕自然妝" },
  { value: "everyday dewy glow makeup", label: "日常光澤妝" },
  { value: "bold full-glam makeup", label: "重磅全妝" },
  { value: "monochrome editorial makeup", label: "單色創意妝" },
  { value: "Y2K colorful graphic makeup", label: "Y2K 彩色妝" },
  { value: "dark gothic makeup", label: "暗黑哥德妝" },
];

export const MODEL_ACCESSORIES = [
  { value: "", label: "無飾品" },
  { value: "wearing minimal delicate jewelry", label: "極簡細飾品" },
  { value: "wearing gold statement earrings", label: "金色大耳環" },
  { value: "wearing layered silver necklaces", label: "多層銀項鍊" },
  { value: "wearing clear-frame glasses", label: "透明框眼鏡" },
  { value: "wearing sleek sunglasses", label: "墨鏡" },
  { value: "wearing a baseball cap", label: "棒球帽" },
  { value: "wearing a cozy beanie", label: "毛帽" },
  { value: "wearing a headband", label: "髮帶" },
  { value: "wearing chunky retro jewelry", label: "復古大件首飾" },
];

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface FlatMockupParams {
  /** Free-form garment phrase, e.g. "Bella Canvas 3001 unisex t-shirt" */
  garmentPhrase: string;
  color: GarmentColor;
  /** value from FLAT_SURFACES */
  surface: string;
  /** value from FLAT_ARRANGEMENTS */
  arrangement: string;
  /** value from FLAT_LIGHTING */
  lighting: string;
  /** prop labels (from FLAT_PROPS) to scatter around the garment */
  props?: string[];
}

export interface ModelMockupParams {
  /** Free-form garment phrase, e.g. "Bella Canvas 3001 unisex t-shirt" */
  garmentPhrase: string;
  color: GarmentColor;
  ageGroup: "adult" | "youth";
  modelDescription: string;
  pose: string;
  /** value from MODEL_SCENES */
  scene: string;
  /** value from MODEL_LIGHTING */
  lighting: string;
  /** prop labels (from MODEL_PROPS) visible in the scene */
  props?: string[];
}

/** Shared print-fidelity block. The dark-fabric lock is iron rule #1. */
function fidelityBlock(color: GarmentColor): string {
  const base =
    "The exact design from the reference image is printed large on the center chest of the garment. " +
    "Reproduce the reference design EXACTLY: same colors, same shapes, same proportions, no redesign, " +
    "no added text or elements. The print follows the fabric's natural wrinkles, folds and drape " +
    "realistically, with accurate lighting, shadows and subtle cotton fabric texture.";
  if (color === "black") {
    return (
      base +
      " CRITICAL COLOR FIDELITY: keep every color of the reference design exactly as-is even on the " +
      "black fabric — do NOT lighten, darken, invert or recolor any element to make it more visible."
    );
  }
  return base;
}

export function isChestOccludingPose(pose: string): boolean {
  return MODEL_POSES.find((p) => p.value === pose)?.occludes ?? false;
}

function find<T extends { value: string; phrase: string }>(list: T[], value: string): T {
  return list.find((x) => x.value === value) ?? list[0];
}

export function buildFlatMockupPrompt(p: FlatMockupParams): string {
  const surface = find(FLAT_SURFACES, p.surface);
  const arrangement = find(FLAT_ARRANGEMENTS, p.arrangement);
  const lighting = find(FLAT_LIGHTING, p.lighting);
  const propClause =
    p.props && p.props.length > 0
      ? ` Styled with: ${p.props.join(", ")}.`
      : "";
  return (
    `Photorealistic e-commerce flat-lay product photo. A plain ${p.color} ${p.garmentPhrase}, ` +
    `${arrangement.phrase}, on ${surface.phrase}, ${lighting.phrase}. ` +
    fidelityBlock(p.color) +
    propClause +
    " Shot from directly above, editorial product photography."
  );
}

export function buildModelMockupPrompt(p: ModelMockupParams): string {
  const scene = find(MODEL_SCENES, p.scene);
  const pose = find(MODEL_POSES, p.pose);
  const lighting = find(MODEL_LIGHTING, p.lighting);
  const who = p.ageGroup === "youth" ? "A young person" : "An adult";
  const desc = p.modelDescription.trim() ? ` (${p.modelDescription.trim()})` : "";
  const chestClause = pose.occludes ? "" : " The full chest area is visible and unobstructed.";
  const propClause =
    p.props && p.props.length > 0
      ? ` Visible in the scene: ${p.props.join(", ")}.`
      : "";
  return (
    `Photorealistic e-commerce lifestyle photo. ${who}${desc}, ${pose.phrase}, ` +
    `in ${scene.phrase}, ${lighting.phrase}. ` +
    `They wear a plain ${p.color} ${p.garmentPhrase}. ` +
    fidelityBlock(p.color) +
    chestClause +
    propClause +
    " Editorial product photography, shallow depth of field, 85mm lens."
  );
}
