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

// ── Model tab: framing options (controls full-body vs close-up, prevents head crop) ──
export const MODEL_FRAMING = [
  { value: "full-body", label: "全身（頭到腳）", phrase: "Full-body shot: the model's entire figure from head to feet is fully visible and centered in the frame, nothing cropped." },
  { value: "three-quarter", label: "七分身（膝上）", phrase: "Three-quarter shot framed from roughly the knees up, with the model's full head clearly visible." },
  { value: "upper-body", label: "半身（腰上）", phrase: "Upper-body shot framed from the waist up, with the full head and face visible." },
  { value: "portrait", label: "特寫（肩上）", phrase: "Close-up portrait framed from the shoulders up, with the full face clearly visible." },
];

// ── Model tab: emotion / facial expression (more options = more product appeal) ──
export const MODEL_EMOTIONS = [
  { value: "", label: "自然（不指定）", phrase: "" },
  { value: "warm-smile", label: "溫暖微笑", phrase: "a warm, genuine smile" },
  { value: "big-laugh", label: "開懷大笑", phrase: "laughing joyfully with a big natural laugh" },
  { value: "soft-smile", label: "淺淺微笑", phrase: "a soft, subtle closed-mouth smile" },
  { value: "confident", label: "自信", phrase: "a confident, self-assured expression" },
  { value: "joyful", label: "愉悅雀躍", phrase: "a bright, joyful and delighted expression" },
  { value: "serene", label: "平靜療癒", phrase: "a serene, calm and peaceful expression" },
  { value: "playful", label: "俏皮", phrase: "a playful, mischievous expression" },
  { value: "surprised", label: "驚喜", phrase: "a pleasantly surprised, delighted expression" },
  { value: "thoughtful", label: "若有所思", phrase: "a thoughtful, contemplative expression" },
  { value: "cool", label: "酷／高冷", phrase: "a cool, aloof, editorial expression" },
  { value: "dreamy", label: "夢幻", phrase: "a soft, dreamy and wistful expression" },
  { value: "proud", label: "驕傲自豪", phrase: "a proud, accomplished expression" },
  { value: "content", label: "滿足", phrase: "a relaxed, content and satisfied expression" },
  { value: "excited", label: "興奮", phrase: "an excited, enthusiastic expression" },
  { value: "candid-laugh", label: "自然偷笑", phrase: "a candid, caught-mid-laugh natural expression" },
  { value: "empowered", label: "強勢自信", phrase: "a fierce, empowered and bold expression" },
  { value: "friendly", label: "親切", phrase: "a friendly, warm and approachable expression" },
  { value: "melancholic", label: "淡淡憂鬱", phrase: "a soft, melancholic and pensive expression" },
  { value: "neutral", label: "中性 Editorial", phrase: "a neutral, high-fashion editorial expression" },
];

// ── Product category → how the model presents the product (apparel = wear; others = hold/show) ──
export type ProductCategory =
  | "apparel" | "drinkware" | "wall-art" | "bag" | "phone" | "pillow" | "jewelry";

/** Map a Printful catalog typeName (e.g. "MUG", "T-SHIRT") to a model-interaction category.
 *  Unknown / apparel-like types default to "apparel" (preserves the original behavior). */
export function productCategoryFromType(typeName: string | null | undefined): ProductCategory {
  const t = (typeName ?? "").toUpperCase();
  if (/MUG|DRINKWARE|BOTTLE|TUMBLER|CUP/.test(t)) return "drinkware";
  if (/POSTER|CANVAS|FRAMED|WALL.?ART|ART.?PRINT/.test(t)) return "wall-art";
  if (/TOTE|BACKPACK|BAG|POUCH|DUFFLE/.test(t)) return "bag";
  if (/PHONE/.test(t)) return "phone";
  if (/PILLOW|CUSHION/.test(t)) return "pillow";
  if (/NECKLACE|RING|JEWELR|EARRING|BRACELET|PENDANT/.test(t)) return "jewelry";
  return "apparel";
}

/** UI options for manually overriding the product category — needed for the user's OWN
 *  products (not in the Printful catalog, e.g. jewelry). "" = auto-detect from selection. */
export const CATEGORY_OPTIONS: { value: "" | ProductCategory; label: string }[] = [
  { value: "", label: "自動（依選的產品）" },
  { value: "apparel", label: "服飾（穿在身上）" },
  { value: "drinkware", label: "杯／瓶／飲品" },
  { value: "jewelry", label: "珠寶（項鍊／戒指／耳環）" },
  { value: "wall-art", label: "海報／帆布／相框" },
  { value: "bag", label: "托特包／背包" },
  { value: "phone", label: "手機殼" },
  { value: "pillow", label: "抱枕／靠枕" },
];

/** What the uploaded reference image represents. */
export type ReferenceKind = "design" | "product";

export const REFERENCE_KIND_OPTIONS: { value: ReferenceKind; label: string; hint: string }[] = [
  { value: "design", label: "設計圖（印在產品上）", hint: "上傳的是要印上去的圖案／設計" },
  { value: "product", label: "產品實照（AI 重現）", hint: "上傳的是現成產品的照片，AI 忠實重現它" },
];

/** Fidelity block for PRODUCT-photo mode: reproduce the real product, do not print a graphic. */
function productFidelityBlock(): string {
  return (
    "The reference image shows the ACTUAL finished product. Reproduce that exact product " +
    "faithfully — identical shape, materials, colours, proportions and fine details — as a real " +
    "photographed object. Do NOT add any printed graphics or text, and do NOT redesign, restyle " +
    "or alter the product in any way."
  );
}

/** Shared closing quality directive — pushes every mockup toward high-end commercial work. */
const PRO_QUALITY =
  " Award-winning professional commercial product photography by a world-class studio: " +
  "ultra-realistic and photorealistic, tack-sharp focus, immaculate professional lighting with " +
  "natural soft shadows and gentle highlights, true-to-life colour, fine micro-detail and texture, " +
  "clean balanced composition with comfortable negative space, high-end magazine advertising " +
  "quality — indistinguishable from a premium global brand campaign.";

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
  /** design size as % of printable area (40–100), default 80 */
  designSizePct?: number;
  /** product category — apparel/jewelry shoot as a top-down flat-lay; mug/bottle/3D
   *  objects shoot UPRIGHT (立拍) instead. Default apparel. */
  productCategory?: ProductCategory;
  /** what the uploaded reference image is. "design" (default) = a graphic to PRINT on the
   *  product; "product" = a photo of the actual finished product to REPRODUCE faithfully. */
  referenceKind?: ReferenceKind;
  /** when true, arrange tasteful decorative props in the four corners of a flat-lay frame. */
  cornerDecor?: boolean;
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
  /** design size as % of chest print area (40–100), default 80 */
  designSizePct?: number;
  /** value from MODEL_FRAMING — controls full-body vs close-up (default three-quarter) */
  framing?: string;
  /** how the model presents the product (default apparel = wear on chest) */
  productCategory?: ProductCategory;
  /** "design" (default) = graphic printed on the product; "product" = reproduce the actual
   *  finished product from the reference photo (e.g. the user's own jewelry). */
  referenceKind?: ReferenceKind;
  /** value from MODEL_EMOTIONS — the model's facial expression (default = unspecified). */
  emotion?: string;
}

/** Shared print-fidelity block. The dark-fabric lock is iron rule #1.
 *  Defaults describe an apparel chest print so flat-lay + apparel callers are unchanged;
 *  non-apparel products pass a different `surface` (where the print sits) and `behavior`
 *  (how the print conforms to that surface). */
function fidelityBlock(
  color: GarmentColor,
  surface = "the center chest of the garment",
  behavior = "follows the fabric's natural wrinkles, folds and drape realistically, with accurate lighting, shadows and subtle cotton fabric texture",
): string {
  const base =
    `The exact design from the reference image is printed large on ${surface}. ` +
    "Reproduce the reference design EXACTLY: same colors, same shapes, same proportions, no redesign, " +
    `no added text or elements. The print ${behavior}.`;
  if (color === "black") {
    return (
      base +
      " CRITICAL COLOR FIDELITY: keep every color of the reference design exactly as-is even on the " +
      "black surface — do NOT lighten, darken, invert or recolor any element to make it more visible."
    );
  }
  return base;
}

/** Per-category description of how the model holds/wears the product and where the print sits. */
function modelProductClause(
  category: ProductCategory,
  color: GarmentColor,
  garmentPhrase: string,
  sizePct: number,
  poseOccludes: boolean,
): { sentence: string; surface: string; behavior: string; sizeClause: string; visibilityClause: string } {
  switch (category) {
    case "drinkware":
      return {
        sentence: `They hold a ${color} ceramic mug up near their face, with the printed side turned toward the camera.`,
        surface: "the side of the mug facing the camera",
        behavior: "wraps smoothly around the mug's curved glossy ceramic surface with accurate lighting and soft reflections",
        sizeClause: ` The printed graphic covers approximately ${sizePct}% of the mug's printable wrap area.`,
        visibilityClause: " The printed side of the mug is fully visible, unobstructed and facing the camera.",
      };
    case "wall-art":
      return {
        sentence: "They hold up a framed art print, displaying the printed side toward the camera.",
        surface: "the framed print inside the frame",
        behavior: "sits perfectly flat within the frame with accurate lighting and no glare",
        sizeClause: " The artwork fills the frame edge to edge.",
        visibilityClause: " The framed print faces the camera, fully visible and unobstructed.",
      };
    case "bag":
      return {
        sentence: `They carry a ${color} tote bag, with the printed front face turned toward the camera.`,
        surface: "the front face of the bag",
        behavior: "follows the canvas fabric's natural drape and folds with accurate lighting and shadow",
        sizeClause: ` The printed graphic covers approximately ${sizePct}% of the bag's front print area.`,
        visibilityClause: " The printed front of the bag is fully visible and facing the camera.",
      };
    case "phone":
      return {
        sentence: "They hold a phone up, with the printed back of the case turned toward the camera.",
        surface: "the back of the phone case",
        behavior: "sits flat on the rigid glossy case with accurate lighting and reflections",
        sizeClause: ` The printed graphic covers approximately ${sizePct}% of the case back.`,
        visibilityClause: " The printed back of the case is fully visible and facing the camera.",
      };
    case "pillow":
      return {
        sentence: "They hold a square throw pillow, with the printed front turned toward the camera.",
        surface: "the front face of the pillow",
        behavior: "follows the soft fabric's gentle bulge and folds with accurate lighting and shadow",
        sizeClause: ` The printed graphic covers approximately ${sizePct}% of the pillow's front.`,
        visibilityClause: " The printed front of the pillow is fully visible and facing the camera.",
      };
    case "jewelry":
      return {
        sentence: "They wear the piece of jewelry from the reference image, presented elegantly and clearly visible.",
        surface: "the jewelry piece itself, matching the reference exactly",
        behavior: "is rendered as a real metal/gemstone piece with accurate material, lighting and reflections",
        sizeClause: "",
        visibilityClause: " The jewelry is the sharp focal point, clearly visible and unobstructed.",
      };
    case "apparel":
    default:
      return {
        sentence: `They wear a plain ${color} ${garmentPhrase}.`,
        surface: "the center chest of the garment",
        behavior: "follows the fabric's natural wrinkles, folds and drape realistically, with accurate lighting, shadows and subtle cotton fabric texture",
        sizeClause: ` The printed graphic covers approximately ${sizePct}% of the chest print area.`,
        visibilityClause: poseOccludes ? "" : " The full chest area is visible and unobstructed.",
      };
  }
}

export function isChestOccludingPose(pose: string): boolean {
  return MODEL_POSES.find((p) => p.value === pose)?.occludes ?? false;
}

function find<T extends { value: string; phrase: string }>(list: T[], value: string): T {
  return list.find((x) => x.value === value) ?? list[0];
}

/** Categories whose products are 3-D objects that must be shot UPRIGHT (立拍), not flat-lay.
 *  apparel + jewelry (and unknown→apparel) stay top-down flat-lay. */
function isUprightProduct(category: ProductCategory): boolean {
  return category === "drinkware" || category === "wall-art" ||
    category === "bag" || category === "phone" || category === "pillow";
}

/** Per-category standalone-product clause for the flat/upright tab (no model). */
function flatProductClause(
  category: ProductCategory,
  color: GarmentColor,
  sizePct: number,
  productName: string,
): { object: string; composition: string; surface: string; behavior: string; sizeClause: string } {
  switch (category) {
    case "drinkware":
      // Use the real product name so a bottle/tumbler isn't mislabeled as a mug; the
      // surface/behavior are neutral wording that fits any curved drinkware.
      return {
        object: `a ${color} ${productName}`,
        composition: "standing upright",
        surface: "the side of the product facing the camera",
        behavior: "wraps smoothly around the product's curved glossy surface with accurate lighting and soft reflections",
        sizeClause: ` The printed graphic covers approximately ${sizePct}% of the product's printable wrap area.`,
      };
    case "wall-art":
      return {
        object: "a framed art print",
        composition: "standing upright, leaning at a slight angle",
        surface: "the print inside the frame",
        behavior: "sits perfectly flat within the frame with accurate lighting and no glare",
        sizeClause: " The artwork fills the frame edge to edge.",
      };
    case "bag":
      return {
        object: `a ${color} tote bag`,
        composition: "standing upright with the printed front face shown",
        surface: "the front face of the bag",
        behavior: "follows the canvas fabric's natural drape and folds with accurate lighting and shadow",
        sizeClause: ` The printed graphic covers approximately ${sizePct}% of the bag's front print area.`,
      };
    case "phone":
      return {
        object: "a phone in a printed case",
        composition: "standing upright with the printed back of the case shown",
        surface: "the back of the phone case",
        behavior: "sits flat on the rigid glossy case with accurate lighting and reflections",
        sizeClause: ` The printed graphic covers approximately ${sizePct}% of the case back.`,
      };
    case "pillow":
      return {
        object: "a square throw pillow",
        composition: "propped upright with the printed front shown",
        surface: "the front face of the pillow",
        behavior: "follows the soft fabric's gentle bulge and folds with accurate lighting and shadow",
        sizeClause: ` The printed graphic covers approximately ${sizePct}% of the pillow's front.`,
      };
    case "jewelry":
    default:
      return {
        object: "the piece of jewelry from the reference image",
        composition: "arranged elegantly",
        surface: "the jewelry piece itself, matching the reference exactly",
        behavior: "is rendered as a real metal/gemstone piece with accurate material, lighting and reflections",
        sizeClause: "",
      };
  }
}

export function buildFlatMockupPrompt(p: FlatMockupParams): string {
  const surface = find(FLAT_SURFACES, p.surface);
  const arrangement = find(FLAT_ARRANGEMENTS, p.arrangement);
  const lighting = find(FLAT_LIGHTING, p.lighting);
  const propClause =
    p.props && p.props.length > 0
      ? ` Styled with: ${p.props.join(", ")}.`
      : "";
  const sizePct = p.designSizePct ?? 80;
  const category: ProductCategory = p.productCategory ?? "apparel";
  const isProduct = p.referenceKind === "product";

  // Upright (立拍) camera with breathing room so the product isn't too close / cropped.
  const uprightCamera =
    " Shot upright from a slight front three-quarter angle at eye level, with the entire product " +
    "comfortably within the frame and generous negative space around it — not cropped, not too close, " +
    "editorial studio product photography with soft natural shadows.";
  const flatLayCamera = " Shot from directly above, editorial flat-lay product photography.";
  // Decorative props in the four corners (user request — for flat-lay friendly products).
  const cornerClause = p.cornerDecor
    ? " Tasteful decorative props are elegantly arranged in the four corners of the frame to frame the product, keeping the centre clear."
    : "";
  // A real mug has a handle — make it visible (design mode only; in product-photo mode the
  // reference already shows the real handle, so adding a directive would fight "reproduce exactly").
  const mugHandle = !isProduct && category === "drinkware"
    ? " The mug has a handle turned slightly to one side so the handle is clearly visible."
    : "";

  // Product-photo mode: reproduce the EXACT product from the reference image (the user's own
  // finished goods, e.g. jewelry). Upright for 3-D objects, flat-lay for apparel/jewelry.
  if (isProduct) {
    const camera = isUprightProduct(category) ? uprightCamera : flatLayCamera;
    const composition = isUprightProduct(category) ? "standing upright" : "arranged elegantly";
    return (
      `Photorealistic e-commerce product photo of the exact product shown in the reference image, ${composition} on ${surface.phrase}, ${lighting.phrase}. ` +
      productFidelityBlock() + mugHandle +
      propClause + cornerClause +
      camera + PRO_QUALITY
    );
  }

  // Non-apparel: standalone product shot. 3-D objects (mug/bottle/bag…) shoot UPRIGHT;
  // jewelry stays a top-down flat-lay.
  if (category !== "apparel") {
    const prod = flatProductClause(category, p.color, sizePct, p.garmentPhrase);
    const camera = isUprightProduct(category) ? uprightCamera : flatLayCamera;
    return (
      `Photorealistic e-commerce product photo. ${capitalize(prod.object)} ${prod.composition} on ${surface.phrase}, ${lighting.phrase}. ` +
      fidelityBlock(p.color, prod.surface, prod.behavior) +
      prod.sizeClause + mugHandle +
      propClause + cornerClause +
      camera + PRO_QUALITY
    );
  }

  // Apparel — original flat-lay garment shot (+ optional corner decor + pro-quality tail).
  const sizeClause = ` The printed graphic should be prominent, occupying approximately ${sizePct}% of the center chest area.`;
  return (
    `Photorealistic e-commerce flat-lay product photo. A plain ${p.color} ${p.garmentPhrase}, ` +
    `${arrangement.phrase}, on ${surface.phrase}, ${lighting.phrase}. ` +
    fidelityBlock(p.color) +
    sizeClause +
    propClause + cornerClause +
    " Shot from directly above, editorial product photography." + PRO_QUALITY
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Product-photo-mode sentence: the model presents the EXACT product from the reference image. */
function modelProductSentence(category: ProductCategory): string {
  switch (category) {
    case "drinkware":
      return "They hold the exact drinkware item shown in the reference image up near their face.";
    case "wall-art":
      return "They hold up the exact framed art shown in the reference image, facing the camera.";
    case "bag":
      return "They carry the exact bag shown in the reference image.";
    case "phone":
      return "They hold up the exact phone shown in the reference image, screen or case facing the camera.";
    case "pillow":
      return "They hold the exact throw pillow shown in the reference image.";
    case "jewelry":
      return "They wear the exact piece of jewelry shown in the reference image, in an elegant close-up.";
    case "apparel":
    default:
      return "They wear the exact garment shown in the reference image.";
  }
}

export function buildModelMockupPrompt(p: ModelMockupParams): string {
  const scene = find(MODEL_SCENES, p.scene);
  const pose = find(MODEL_POSES, p.pose);
  const lighting = find(MODEL_LIGHTING, p.lighting);
  const framing = find(MODEL_FRAMING, p.framing ?? "three-quarter");
  const category: ProductCategory = p.productCategory ?? "apparel";
  const isProduct = p.referenceKind === "product";
  const who = p.ageGroup === "youth" ? "A young person" : "An adult";
  const desc = p.modelDescription.trim() ? ` (${p.modelDescription.trim()})` : "";
  const propClause =
    p.props && p.props.length > 0
      ? ` Visible in the scene: ${p.props.join(", ")}.`
      : "";
  const sizePct = p.designSizePct ?? 80;
  const emotion = find(MODEL_EMOTIONS, p.emotion ?? "");
  const emotionClause = emotion.phrase ? ` Their facial expression shows ${emotion.phrase}.` : "";
  const product = modelProductClause(category, p.color, p.garmentPhrase, sizePct, pose.occludes);
  // Product-photo mode reproduces the real product; design mode prints a graphic on it.
  const productBlock = isProduct
    ? modelProductSentence(category) + " " + productFidelityBlock() + product.visibilityClause
    : product.sentence + " " + fidelityBlock(p.color, product.surface, product.behavior) +
      product.sizeClause + product.visibilityClause;
  return (
    `Photorealistic e-commerce lifestyle photo. ${who}${desc}, ${pose.phrase}, ` +
    `in ${scene.phrase}, ${lighting.phrase}. ` +
    productBlock +
    emotionClause +
    propClause +
    ` ${framing.phrase}` +
    " The model's full head and face are clearly visible and must NOT be cropped out of frame." +
    PRO_QUALITY
  );
}
