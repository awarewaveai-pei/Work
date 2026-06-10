// 78-card tarot dataset for the print-file generator.
// Ported from the artifact prototype (tarot-ai-generator.jsx) — mojibake-free —
// with an added `subjectPrompt` per card that feeds the image model.
// Visual meta (colors/symbols) is kept for the canvas print-card frame.

export type TarotSuit = "major" | "wands" | "cups" | "swords" | "pentacles";

export interface TarotCard {
  id: number;
  name: string;
  roman: string;
  type: TarotSuit;
  theme: string;
  /** [borderColor, bgColor] used by the print-card frame. */
  colors: [string, string];
  symbols: string[];
  /** Scene description fed to the image model (subject only; style comes from the user). */
  subjectPrompt: string;
}

const MAJOR: TarotCard[] = [
  { id: 0, name: "THE FOOL", roman: "0", type: "major", theme: "new beginnings, adventure, innocence", colors: ["#f0c040", "#fff8dc"], symbols: ["sun", "mountains", "flower"], subjectPrompt: "a carefree young traveler stepping toward a cliff edge, a small white dog at the heels, holding a white rose and a knapsack on a staff, bright morning sky and distant mountains" },
  { id: 1, name: "THE MAGICIAN", roman: "I", type: "major", theme: "willpower, skill, manifestation", colors: ["#c0392b", "#fff"], symbols: ["infinity", "wand", "pentagram"], subjectPrompt: "a robed magician one hand raised holding a wand to the sky one hand pointing to earth, an infinity symbol above the head, a table with cup sword pentacle and wand, roses and lilies" },
  { id: 2, name: "THE HIGH PRIESTESS", roman: "II", type: "major", theme: "intuition, mystery, inner wisdom", colors: ["#1a1a6e", "#c8b8f8"], symbols: ["crescent moon", "pillars", "veil"], subjectPrompt: "a serene priestess seated between two pillars black and white, a crescent moon at her feet, a veil of pomegranates behind her, a scroll of mysteries in her lap" },
  { id: 3, name: "THE EMPRESS", roman: "III", type: "major", theme: "abundance, fertility, nature", colors: ["#2d6a4f", "#b7e4c7"], symbols: ["wheat", "venus", "crown"], subjectPrompt: "a crowned empress reclining on cushions in a lush field of wheat, a crown of twelve stars, a heart-shaped venus shield, a flowing river and forest behind" },
  { id: 4, name: "THE EMPEROR", roman: "IV", type: "major", theme: "authority, structure, fatherhood", colors: ["#6b2d8b", "#e8c8f8"], symbols: ["throne", "ram", "scepter"], subjectPrompt: "a stern bearded emperor on a stone throne carved with ram heads, holding an ankh scepter and orb, barren red mountains behind" },
  { id: 5, name: "THE HIEROPHANT", roman: "V", type: "major", theme: "tradition, faith, institutions", colors: ["#8b4513", "#f5deb3"], symbols: ["cross", "pillars", "keys"], subjectPrompt: "a religious hierophant in triple crown between two pillars, hand raised in blessing, two acolytes kneeling, crossed keys at his feet" },
  { id: 6, name: "THE LOVERS", roman: "VI", type: "major", theme: "love, choice, union", colors: ["#e91e63", "#fce4ec"], symbols: ["angel", "sun", "hearts"], subjectPrompt: "a man and a woman standing in a garden beneath a great winged angel and radiant sun, a tree of flames and a tree with serpent behind them" },
  { id: 7, name: "THE CHARIOT", roman: "VII", type: "major", theme: "victory, control, determination", colors: ["#1565c0", "#e3f2fd"], symbols: ["armor", "sphinxes", "stars"], subjectPrompt: "an armored warrior standing in a chariot drawn by one black and one white sphinx, a starry canopy above, a walled city behind" },
  { id: 8, name: "STRENGTH", roman: "VIII", type: "major", theme: "strength, courage, patience", colors: ["#ff8f00", "#fff8e1"], symbols: ["infinity", "lion", "flowers"], subjectPrompt: "a gentle woman in white calmly closing the jaws of a great lion, an infinity symbol above her head, a meadow of flowers" },
  { id: 9, name: "THE HERMIT", roman: "IX", type: "major", theme: "solitude, introspection, guidance", colors: ["#546e7a", "#eceff1"], symbols: ["lantern", "staff", "mountain"], subjectPrompt: "a grey-robed hermit alone on a snowy mountain peak at night, holding up a lantern with a glowing six-pointed star, leaning on a staff" },
  { id: 10, name: "WHEEL OF FORTUNE", roman: "X", type: "major", theme: "fate, cycles, turning point", colors: ["#6d4c41", "#efebe9"], symbols: ["wheel", "sphinx", "serpent"], subjectPrompt: "a great golden wheel of fortune in the sky inscribed with mystic letters, a sphinx atop, a serpent descending, a jackal rising, clouds in four corners" },
  { id: 11, name: "JUSTICE", roman: "XI", type: "major", theme: "justice, truth, law", colors: ["#c62828", "#ffebee"], symbols: ["scales", "sword", "crown"], subjectPrompt: "a crowned figure of justice seated between two pillars holding an upright sword in one hand and balanced scales in the other" },
  { id: 12, name: "THE HANGED MAN", roman: "XII", type: "major", theme: "sacrifice, waiting, new perspective", colors: ["#00695c", "#e0f2f1"], symbols: ["tree", "halo", "rope"], subjectPrompt: "a serene man hanging upside down by one foot from a living T-shaped tree, a glowing halo around his head, hands behind his back" },
  { id: 13, name: "DEATH", roman: "XIII", type: "major", theme: "transformation, endings, rebirth", colors: ["#212121", "#9e9e9e"], symbols: ["skeleton", "rose", "dawn"], subjectPrompt: "a skeletal figure in black armor riding a white horse carrying a black banner with a white rose, a rising sun between two towers on the horizon" },
  { id: 14, name: "TEMPERANCE", roman: "XIV", type: "major", theme: "balance, moderation, patience", colors: ["#1b5e20", "#f1f8e9"], symbols: ["angel wings", "water", "triangle"], subjectPrompt: "a great winged angel one foot on land one in water, pouring liquid between two golden cups, irises blooming, a path to mountains and a glowing crown" },
  { id: 15, name: "THE DEVIL", roman: "XV", type: "major", theme: "bondage, materialism, shadow", colors: ["#4a148c", "#f3e5f5"], symbols: ["chains", "torch", "pentagram"], subjectPrompt: "a horned devil perched on a black pedestal with an inverted pentagram, an inverted torch, two chained naked figures with tails below" },
  { id: 16, name: "THE TOWER", roman: "XVI", type: "major", theme: "sudden change, revelation, chaos", colors: ["#b71c1c", "#ffcdd2"], symbols: ["lightning", "crown", "flames"], subjectPrompt: "a tall stone tower struck by lightning, its golden crown blown off, flames bursting from windows, two figures falling into darkness" },
  { id: 17, name: "THE STAR", roman: "XVII", type: "major", theme: "hope, inspiration, renewal", colors: ["#0277bd", "#e1f5fe"], symbols: ["stars", "water", "naked figure"], subjectPrompt: "a kneeling nude woman by a pool pouring water from two jugs onto land and water, one great eight-pointed star and seven smaller stars above, a bird in a tree" },
  { id: 18, name: "THE MOON", roman: "XVIII", type: "major", theme: "illusion, fear, subconscious", colors: ["#1a237e", "#e8eaf6"], symbols: ["moon", "wolf", "path"], subjectPrompt: "a full moon with a face dripping dew between two towers, a dog and a wolf howling, a crayfish crawling from a pool, a winding path to distant hills" },
  { id: 19, name: "THE SUN", roman: "XIX", type: "major", theme: "joy, success, vitality", colors: ["#f57f17", "#fff9c4"], symbols: ["sun face", "sunflowers", "child"], subjectPrompt: "a radiant sun with a face, a joyful naked child on a white horse holding a red banner, a wall of tall sunflowers behind" },
  { id: 20, name: "JUDGEMENT", roman: "XX", type: "major", theme: "awakening, judgement, rebirth", colors: ["#880e4f", "#fce4ec"], symbols: ["angel", "trumpet", "rising"], subjectPrompt: "the archangel Gabriel blowing a great trumpet with a cross banner from the clouds, naked figures rising from open graves with arms raised" },
  { id: 21, name: "THE WORLD", roman: "XXI", type: "major", theme: "completion, integration, achievement", colors: ["#004d40", "#e0f2f1"], symbols: ["wreath", "dancer", "four elements"], subjectPrompt: "a dancing figure draped in a violet sash within a great laurel wreath, holding two wands, a man eagle bull and lion in the four corners" },
];

const SUITS: { name: string; key: TarotSuit; color: string; bg: string; element: string; theme: string; emblem: string }[] = [
  { name: "WANDS", key: "wands", color: "#e65100", bg: "#fff3e0", element: "fire", theme: "action, passion, creativity", emblem: "a budding wooden staff sprouting green leaves" },
  { name: "CUPS", key: "cups", color: "#0277bd", bg: "#e1f5fe", element: "water", theme: "emotion, intuition, relationships", emblem: "an ornate golden chalice" },
  { name: "SWORDS", key: "swords", color: "#455a64", bg: "#eceff1", element: "air", theme: "thought, conflict, truth", emblem: "an upright double-edged steel sword" },
  { name: "PENTACLES", key: "pentacles", color: "#2e7d32", bg: "#e8f5e9", element: "earth", theme: "material, stability, prosperity", emblem: "a golden coin engraved with a five-pointed pentagram" },
];

const RANKS = ["ACE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "TEN", "PAGE", "KNIGHT", "QUEEN", "KING"];
const PIP_COUNT: Record<string, number> = { ACE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5, SIX: 6, SEVEN: 7, EIGHT: 8, NINE: 9, TEN: 10 };
// Orthodox tarot numbering: pip cards Ace–Ten show Roman I–X; court cards (Page/Knight/Queen/King)
// carry no numeral — only their title. Index 0–9 = pips, 10–13 = courts → "".
const MINOR_ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "", "", "", ""];

function minorSubject(rank: string, emblem: string, element: string): string {
  if (rank === "ACE") {
    return `a single ${emblem} offered by a hand emerging from a cloud, ${element} energy, a fertile landscape below`;
  }
  if (rank === "PAGE") {
    return `a young page in a tunic standing in an open field, holding ${emblem}, ${element} energy`;
  }
  if (rank === "KNIGHT") {
    return `an armored knight on horseback riding forward, carrying ${emblem}, ${element} energy`;
  }
  if (rank === "QUEEN") {
    return `a crowned queen seated on a carved throne, holding ${emblem}, ${element} energy`;
  }
  if (rank === "KING") {
    return `a crowned king seated on a carved throne, holding ${emblem}, ${element} energy`;
  }
  const n = PIP_COUNT[rank] ?? 1;
  return `${n} of ${emblem} arranged in a balanced composition, figures in a scene expressing ${element} energy`;
}

const MINOR: TarotCard[] = [];
let nextId = MAJOR.length;
for (const suit of SUITS) {
  RANKS.forEach((rank, i) => {
    MINOR.push({
      id: nextId++,
      name: `${rank} OF ${suit.name}`,
      roman: MINOR_ROMAN[i],
      type: suit.key,
      theme: `${suit.theme}, ${rank.toLowerCase()} energy`,
      colors: [suit.color, suit.bg],
      symbols: [suit.element, suit.name.toLowerCase()],
      subjectPrompt: minorSubject(rank, suit.emblem, suit.element),
    });
  });
}

export const TAROT_CARDS: TarotCard[] = [...MAJOR, ...MINOR];

/** The card used for the single style-preview generation. */
export const PREVIEW_CARD: TarotCard = MAJOR[0]; // THE FOOL

// ── Free (no-API) zh→en style lexicon ───────────────────────────────────────
// FLUX's text encoder barely understands Chinese, so a Chinese style description
// ("梵谷畫風") is mostly ignored. We translate known art-style terms to English
// locally (zero cost, instant, deterministic) before composing the prompt.
// Anything not in the table passes through unchanged — no worse than before.
const STYLE_LEXICON: Record<string, string> = {
  // artists
  梵谷: "Van Gogh post-impressionist oil painting with swirling brushstrokes",
  梵高: "Van Gogh post-impressionist oil painting with swirling brushstrokes",
  莫內: "Monet impressionist painting",
  莫奈: "Monet impressionist painting",
  畢卡索: "Picasso cubist painting",
  達利: "Salvador Dali surrealist painting",
  克林姆: "Gustav Klimt art nouveau golden ornament",
  宮崎駿: "Studio Ghibli anime",
  吉卜力: "Studio Ghibli anime",
  // media
  水彩: "watercolor painting",
  油畫: "oil painting",
  壓克力: "acrylic painting",
  素描: "pencil sketch",
  鉛筆: "pencil drawing",
  彩色鉛筆: "colored-pencil illustration",
  炭筆: "charcoal drawing",
  粉彩: "soft pastel painting",
  水墨: "traditional Chinese ink wash painting",
  國畫: "traditional Chinese ink wash painting",
  中國風: "traditional Chinese art style",
  浮世繪: "ukiyo-e Japanese woodblock print",
  版畫: "woodcut print",
  剪紙: "paper-cut collage",
  彩繪玻璃: "stained glass",
  馬賽克: "mosaic art",
  刺繡: "embroidery art",
  // styles / genres
  動漫: "anime manga style",
  日漫: "Japanese anime style",
  二次元: "anime style",
  動畫: "animation style",
  漫畫: "comic book style",
  卡通: "cartoon style",
  像素: "pixel art",
  點陣: "pixel art",
  寫實: "photorealistic",
  逼真: "photorealistic",
  印象派: "impressionist painting",
  後印象派: "post-impressionist painting",
  表現主義: "expressionist painting",
  超現實: "surrealist",
  立體派: "cubist painting",
  新藝術: "art nouveau",
  裝飾藝術: "art deco",
  普普: "pop art",
  波普: "pop art",
  塗鴉: "graffiti street art",
  街頭: "street art",
  極簡: "minimalist",
  簡約: "minimalist",
  復古: "vintage retro",
  懷舊: "vintage nostalgic",
  哥德: "gothic",
  歌德: "gothic",
  暗黑: "dark moody",
  夢幻: "dreamy ethereal",
  奇幻: "fantasy art",
  童話: "fairytale storybook illustration",
  繪本: "storybook illustration",
  賽博龐克: "cyberpunk neon",
  電馭叛客: "cyberpunk neon",
  蒸汽龐克: "steampunk",
  中世紀: "medieval",
  霓虹: "neon glow",
  唯美: "aesthetic and beautiful",
  可愛: "cute kawaii",
  黑白: "black and white monochrome",
  // suffixes (kept last by length sort below)
  畫風: " style",
  風格: " style",
};

// Precompute once — STYLE_LEXICON never changes at runtime; re-sorting on every
// localizeStyle call (78× during batch generation) was wasted O(k log k) work.
const SORTED_STYLE_KEYS = Object.keys(STYLE_LEXICON).sort((a, b) => b.length - a.length);

/**
 * Replace known Chinese art-style terms with English. Longest keys first so
 * compounds win (e.g. "梵谷畫風" → Van Gogh… , not "梵谷" + leftover "畫風").
 * Free, local, no API call.
 */
export function localizeStyle(input: string): string {
  let out = input;
  for (const key of SORTED_STYLE_KEYS) {
    // Pad with spaces so adjacently-typed CJK terms (e.g. "哥德暗黑") don't fuse into
    // "gothicdark moody"; the trailing whitespace-collapse cleans up the doubles.
    if (out.includes(key)) out = out.split(key).join(` ${STYLE_LEXICON[key]} `);
  }
  return out.replace(/\s+/g, " ").trim();
}

/** Bilingual quick-pick chips for the style box (insert the English term FLUX understands). */
export const STYLE_PRESETS: { zh: string; en: string }[] = [
  { zh: "梵谷", en: "Van Gogh oil painting" },
  { zh: "水彩", en: "watercolor painting" },
  { zh: "油畫", en: "oil painting" },
  { zh: "日系動漫", en: "anime manga style" },
  { zh: "吉卜力", en: "Studio Ghibli anime" },
  { zh: "水墨國畫", en: "Chinese ink wash painting" },
  { zh: "浮世繪", en: "ukiyo-e woodblock" },
  { zh: "賽博龐克", en: "cyberpunk neon" },
  { zh: "復古插畫", en: "vintage illustration" },
  { zh: "童話繪本", en: "fairytale storybook" },
  { zh: "極簡", en: "minimalist" },
  { zh: "哥德暗黑", en: "dark gothic" },
];

/**
 * Build the full image-model prompt for one card given a user style/character description.
 *
 * FLUX (esp. schnell) has NO negative prompt and mis-reads negations — writing "no text",
 * "no border", "no card name" makes it DRAW garbled text + a frame, because it only has the
 * positive tokens "text / border / card name" to work with. So this prompt:
 *   • describes ONLY what we want (never says no / not / without),
 *   • never mentions "tarot card", "frame", "title" (those cues trigger a bordered, captioned card),
 *   • leads with the user's style (FLUX weights early tokens most) and repeats it at the end.
 * The frame + Roman numeral + card name are added afterwards by our canvas (renderPrintCard.ts).
 */
export function buildCardPrompt(stylePrompt: string, card: TarotCard): string {
  const style = localizeStyle(stylePrompt.trim());
  if (!style) {
    return `Ornate colored-pencil fantasy illustration, Rider-Waite inspired, warm antique palette. ${card.subjectPrompt}. Single vertical full-bleed scene, rich symbolic detail.`;
  }
  // Style first and last (early + late reinforcement); scene in between.
  // Middle repetition removed — some FLUX variants penalise exact-repeat tokens.
  return `${style}. ${card.subjectPrompt} — if the style names an animal or creature, the main figure is that creature instead of a person. Single vertical full-bleed scene, rich symbolic detail, cohesive ${style}.`;
}
