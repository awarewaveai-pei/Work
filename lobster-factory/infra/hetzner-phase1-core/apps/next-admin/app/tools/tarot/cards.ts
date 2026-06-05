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
      roman: String(i + 1),
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

/** Build the full image-model prompt for one card given a user style description. */
export function buildCardPrompt(stylePrompt: string, card: TarotCard): string {
  const style = stylePrompt.trim() || "ornate medieval colored-pencil tarot illustration, Rider-Waite inspired, warm antique paper";
  return `${style}. Scene: ${card.subjectPrompt}. A single tarot card illustration titled "${card.name}", full vertical portrait composition, rich symbolic detail, no text, no border.`;
}
