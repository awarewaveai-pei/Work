// 78-card tarot dataset for the print-file generator.
// Each card carries a Rider-Waite-Smith (RWS, 1909, public domain) faithful `scene` plus a
// swappable protagonist token `{hero}`:
//   • `scene` fixes the composition, props and symbolism (the part that must stay faithful);
//   • `{hero}` marks the central figure(s) so the user can replace WHO appears — a cat, a
//     cartoon character, a real person — while the scene stays correct. No subject → the
//     card's RWS-faithful default `hero` is used.
// Style (artist / medium / genre) is layered separately by buildCardPrompt and never touches
// the scene. Visual meta (colors/symbols) feeds the canvas print-card frame (renderPrintCard.ts).

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
  /**
   * RWS-faithful scene fed to the image model. The central figure(s) are written as the literal
   * token `{hero}` (with the article kept in the template, e.g. "a {hero}", "two {hero} figures",
   * "a second {hero}") so any subject can be substituted while pose/props/symbols stay fixed.
   * Cards whose focus is non-human (Aces = a hand from a cloud, Wheel, Moon, 3 of Swords, 8 of
   * Wands) contain no `{hero}` token and are simply unaffected by subject replacement.
   */
  scene: string;
  /**
   * Default protagonist when the user supplies no subject — a bare noun core WITHOUT a leading
   * article (the scene template supplies "a"/"the"/"two"). RWS-faithful human identity.
   */
  hero: string;
}

const MAJOR: TarotCard[] = [
  { id: 0, name: "THE FOOL", roman: "0", type: "major", theme: "new beginnings, adventure, innocence", colors: ["#f0c040", "#fff8dc"], symbols: ["sun", "mountains", "flower"], hero: "carefree young traveler in bright ragged clothes", scene: "a {hero} stepping lightly toward the edge of a high cliff while gazing up at the sky, a small white dog leaping at the heels, holding a white rose in one hand and a knapsack tied to a slender staff over the shoulder, a bright golden morning sky and snowy mountains far below" },
  { id: 1, name: "THE MAGICIAN", roman: "I", type: "major", theme: "willpower, skill, manifestation", colors: ["#c0392b", "#fff"], symbols: ["infinity", "wand", "pentagram"], hero: "robed magician", scene: "a {hero} standing behind a low altar, one arm raised holding a wand toward the sky and the other hand pointing down to the earth, a glowing infinity symbol floating above the head, a serpent belt at the waist, a cup a sword a pentacle and a wand laid on the altar, red roses and white lilies blooming around" },
  { id: 2, name: "THE HIGH PRIESTESS", roman: "II", type: "major", theme: "intuition, mystery, inner wisdom", colors: ["#1a1a6e", "#c8b8f8"], symbols: ["crescent moon", "pillars", "veil"], hero: "serene priestess", scene: "a {hero} seated calmly between one black pillar and one white pillar, a horned crown bearing a full moon on the brow, a crescent moon resting at the feet, a tapestry veil patterned with pomegranates and palms behind, a partly hidden scroll in the lap" },
  { id: 3, name: "THE EMPRESS", roman: "III", type: "major", theme: "abundance, fertility, nature", colors: ["#2d6a4f", "#b7e4c7"], symbols: ["wheat", "venus", "crown"], hero: "crowned empress", scene: "a {hero} reclining on lush red cushions in a golden field of ripe wheat, a crown of twelve stars on the head, a heart-shaped shield bearing the symbol of Venus resting beside, a waterfall and deep green forest behind" },
  { id: 4, name: "THE EMPEROR", roman: "IV", type: "major", theme: "authority, structure, fatherhood", colors: ["#6b2d8b", "#e8c8f8"], symbols: ["throne", "ram", "scepter"], hero: "stern bearded emperor", scene: "a {hero} seated upright on a massive stone throne carved with four ram heads, holding an ankh scepter in one hand and a golden orb in the other, armor showing beneath flowing red robes, jagged barren red mountains behind" },
  { id: 5, name: "THE HIEROPHANT", roman: "V", type: "major", theme: "tradition, faith, institutions", colors: ["#8b4513", "#f5deb3"], symbols: ["cross", "pillars", "keys"], hero: "high priest in sacred vestments", scene: "a {hero} wearing a triple-tiered crown seated between two stone pillars, one hand raised in blessing while holding a triple cross staff, two tonsured acolytes kneeling below, a pair of crossed golden keys at the feet" },
  { id: 6, name: "THE LOVERS", roman: "VI", type: "major", theme: "love, choice, union", colors: ["#e91e63", "#fce4ec"], symbols: ["angel", "sun", "hearts"], hero: "nude figure", scene: "a {hero} and a second {hero} standing apart in a green garden beneath a great winged angel with outstretched arms haloed by a radiant sun, behind one a tree bearing flames, behind the other a tree entwined with a serpent and fruit" },
  { id: 7, name: "THE CHARIOT", roman: "VII", type: "major", theme: "victory, control, determination", colors: ["#1565c0", "#e3f2fd"], symbols: ["armor", "sphinxes", "stars"], hero: "crowned warrior in armor", scene: "a {hero} standing erect in a stone chariot beneath a starry blue canopy, the chariot drawn by one black sphinx and one white sphinx resting in front, a winged sun emblem on the chariot, a walled city behind" },
  { id: 8, name: "STRENGTH", roman: "VIII", type: "major", theme: "strength, courage, patience", colors: ["#ff8f00", "#fff8e1"], symbols: ["infinity", "lion", "flowers"], hero: "gentle woman in a white robe", scene: "a {hero} wearing a garland of flowers calmly closing the jaws of a great tawny lion with both hands, a glowing infinity symbol floating above the head, a tranquil green meadow under a soft sky" },
  { id: 9, name: "THE HERMIT", roman: "IX", type: "major", theme: "solitude, introspection, guidance", colors: ["#546e7a", "#eceff1"], symbols: ["lantern", "staff", "mountain"], hero: "grey-hooded hermit", scene: "a {hero} standing alone on a snowy mountain peak at night, raising a lantern that holds a glowing six-pointed star, leaning on a tall wooden staff, a deep blue sky behind" },
  { id: 10, name: "WHEEL OF FORTUNE", roman: "X", type: "major", theme: "fate, cycles, turning point", colors: ["#6d4c41", "#efebe9"], symbols: ["wheel", "sphinx", "serpent"], hero: "sphinx", scene: "a great golden wheel rising in the sky inscribed with mystic letters, a blue sphinx with a sword resting on top, a red serpent descending the left side, a jackal-headed figure rising on the right, and an angel an eagle a bull and a lion reading books in the four corners among clouds" },
  { id: 11, name: "JUSTICE", roman: "XI", type: "major", theme: "justice, truth, law", colors: ["#c62828", "#ffebee"], symbols: ["scales", "sword", "crown"], hero: "crowned judge in red robes", scene: "a {hero} seated between two stone pillars with a purple veil behind, holding an upright double-edged sword in the right hand and perfectly balanced golden scales in the left" },
  { id: 12, name: "THE HANGED MAN", roman: "XII", type: "major", theme: "sacrifice, waiting, new perspective", colors: ["#00695c", "#e0f2f1"], symbols: ["tree", "halo", "rope"], hero: "serene man", scene: "a {hero} hanging upside down suspended by one ankle from a living T-shaped wooden cross, the free leg crossed behind to form a four, hands clasped behind the back, a bright halo of light glowing around the head, a calm peaceful expression" },
  { id: 13, name: "DEATH", roman: "XIII", type: "major", theme: "transformation, endings, rebirth", colors: ["#212121", "#9e9e9e"], symbols: ["skeleton", "rose", "dawn"], hero: "skeleton in black armor", scene: "a {hero} riding slowly on a white horse and carrying a black banner emblazoned with a white five-petaled rose, a fallen figure and kneeling onlookers before it, a rising sun glowing between two distant towers on the horizon" },
  { id: 14, name: "TEMPERANCE", roman: "XIV", type: "major", theme: "balance, moderation, patience", colors: ["#1b5e20", "#f1f8e9"], symbols: ["angel wings", "water", "triangle"], hero: "great winged angel", scene: "a {hero} standing with one foot on land and one foot resting in a pool, pouring shimmering liquid in an arc between two golden cups, a triangle within a square on the chest, yellow irises blooming nearby, a winding path leading to mountains crowned by a glowing crown of light" },
  { id: 15, name: "THE DEVIL", roman: "XV", type: "major", theme: "bondage, materialism, shadow", colors: ["#4a148c", "#f3e5f5"], symbols: ["chains", "torch", "pentagram"], hero: "horned figure with bat wings", scene: "a {hero} perched on a black half-cube, an inverted pentagram glowing on the brow, one hand raised and a downward-pointing torch in the other, two horned and tailed captives loosely chained by the neck to the cube below" },
  { id: 16, name: "THE TOWER", roman: "XVI", type: "major", theme: "sudden change, revelation, chaos", colors: ["#b71c1c", "#ffcdd2"], symbols: ["lightning", "crown", "flames"], hero: "falling figure", scene: "a tall grey stone tower on a rocky peak struck by a jagged bolt of lightning, its golden crown blasted off, flames bursting from the windows, a {hero} and a second {hero} plunging headfirst into the darkness, sparks like flames scattered across the night sky" },
  { id: 17, name: "THE STAR", roman: "XVII", type: "major", theme: "hope, inspiration, renewal", colors: ["#0277bd", "#e1f5fe"], symbols: ["stars", "water", "naked figure"], hero: "kneeling nude woman", scene: "a {hero} kneeling at the edge of a still pool with one foot on the water and one knee on land, pouring water from two jugs, one streaming onto the land and one into the pool, one great radiant eight-pointed star and seven smaller stars shining above, an ibis bird perched in a tree" },
  { id: 18, name: "THE MOON", roman: "XVIII", type: "major", theme: "illusion, fear, subconscious", colors: ["#1a237e", "#e8eaf6"], symbols: ["moon", "wolf", "path"], hero: "wolf", scene: "a full moon with a serene face shedding luminous dewdrops, set between two tall grey towers, a dog and a wolf howling upward, a crayfish crawling out of a pool in the foreground, a long winding path leading back toward distant hills" },
  { id: 19, name: "THE SUN", roman: "XIX", type: "major", theme: "joy, success, vitality", colors: ["#f57f17", "#fff9c4"], symbols: ["sun face", "sunflowers", "child"], hero: "joyful naked child", scene: "a {hero} wearing a wreath and riding a calm white horse while holding a large red banner, beneath a great radiant sun with a gentle face and straight and wavy rays, a stone wall lined with tall sunflowers behind" },
  { id: 20, name: "JUDGEMENT", roman: "XX", type: "major", theme: "awakening, judgement, rebirth", colors: ["#880e4f", "#fce4ec"], symbols: ["angel", "trumpet", "rising"], hero: "rising figure", scene: "a great winged angel blowing a golden trumpet hung with a white-and-red cross banner from the clouds above, and below a {hero}, a second {hero} and a small child rising with arms uplifted from open grey coffins floating on a calm sea, snowy mountains in the far distance" },
  { id: 21, name: "THE WORLD", roman: "XXI", type: "major", theme: "completion, integration, achievement", colors: ["#004d40", "#e0f2f1"], symbols: ["wreath", "dancer", "four elements"], hero: "dancing figure draped in a violet sash", scene: "a {hero} floating within a great oval laurel wreath bound at top and bottom by red ribbons, holding a short wand in each hand, a human head an eagle a bull and a lion appearing in the four corners among soft clouds" },
];

const SUITS: { name: string; key: TarotSuit; color: string; bg: string; element: string; theme: string }[] = [
  { name: "WANDS", key: "wands", color: "#e65100", bg: "#fff3e0", element: "fire", theme: "action, passion, creativity" },
  { name: "CUPS", key: "cups", color: "#0277bd", bg: "#e1f5fe", element: "water", theme: "emotion, intuition, relationships" },
  { name: "SWORDS", key: "swords", color: "#455a64", bg: "#eceff1", element: "air", theme: "thought, conflict, truth" },
  { name: "PENTACLES", key: "pentacles", color: "#2e7d32", bg: "#e8f5e9", element: "earth", theme: "material, stability, prosperity" },
];

const RANKS = ["ACE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "TEN", "PAGE", "KNIGHT", "QUEEN", "KING"];
// Orthodox tarot numbering: pip cards Ace–Ten show Roman I–X; court cards (Page/Knight/Queen/King)
// carry no numeral — only their title. Index 0–9 = pips, 10–13 = courts → "".
const MINOR_ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "", "", "", ""];

// ── Rider-Waite-Smith minor arcana, one faithful scene per card ──────────────
// Each entry: `hero` = bare noun core for the central figure (no leading article); `scene` = the
// full RWS composition with `{hero}` where the figure(s) appear. Non-figure cards (Aces, 8 of
// Wands, 3 of Swords) carry no `{hero}` token and `hero` is unused (kept for shape only).
type MinorScene = { hero: string; scene: string };
const MINOR_SCENES: Record<TarotSuit, Record<string, MinorScene>> = {
  major: {},
  wands: {
    ACE: { hero: "figure", scene: "a hand emerging from a cloud grasping a stout sprouting wooden wand with fresh green leaves budding from it, a castle on a distant hilltop above a winding river and rolling green hills" },
    TWO: { hero: "robed man", scene: "a {hero} standing on a castle battlement holding a small globe of the world in one hand while gripping one tall wand fixed to the wall, a second wand standing beside, gazing out over land and sea" },
    THREE: { hero: "cloaked merchant", scene: "a {hero} standing on a cliff with the back turned, watching three ships sail across a golden sea, one hand resting on one of three tall wands planted in the ground around" },
    FOUR: { hero: "celebrating figure", scene: "four tall wands standing upright bound at the top with a flowered garland forming a canopy, two {hero} figures raising bouquets in welcome beneath it, a manor house and bright sky behind" },
    FIVE: { hero: "youth", scene: "five {hero} figures brandishing tall wooden staves at one another in lively mock combat on open ground under a clear sky" },
    SIX: { hero: "rider", scene: "a {hero} crowned with a laurel wreath riding a white horse in a victory procession, holding a tall staff topped with a laurel wreath, a crowd of marchers carrying five more upright staves around" },
    SEVEN: { hero: "man", scene: "a {hero} standing firm on a hilltop defending with a raised staff against six other staves thrust up from below" },
    EIGHT: { hero: "figure", scene: "eight flowering wands flying swiftly in parallel through the open air over a green river landscape under a clear sky" },
    NINE: { hero: "wary wounded man", scene: "a {hero} with a bandaged head leaning watchfully on a staff, eight more staves standing upright in a row behind like a fence" },
    TEN: { hero: "burdened man", scene: "a {hero} bent forward carrying a heavy bundle of all ten wooden staves in both arms, struggling toward a town in the near distance" },
    PAGE: { hero: "young page", scene: "a {hero} in a patterned tunic standing in a desert with pyramids behind, both hands resting on a tall flowering staff, gazing up at its tip with curiosity" },
    KNIGHT: { hero: "armored knight", scene: "a {hero} on a rearing chestnut horse, wearing a tunic patterned with salamanders, holding a flowering staff, desert and pyramids behind" },
    QUEEN: { hero: "queen", scene: "a {hero} seated on a stone throne carved with lions and sunflowers, holding a flowering staff in one hand and a large sunflower in the other, a black cat sitting at the feet" },
    KING: { hero: "king", scene: "a {hero} seated on a throne carved with lions and salamanders, holding a flowering staff, robes patterned with fire lizards, a small live salamander at the feet" },
  },
  cups: {
    ACE: { hero: "figure", scene: "a hand emerging from a cloud holding an overflowing golden chalice with five streams of water spilling over, a white dove descending with a round wafer toward the cup, a calm sea dotted with water lilies below" },
    TWO: { hero: "figure", scene: "a {hero} and a second {hero} facing each other and pledging two golden cups in a vow, between them a winged lion's head above a caduceus of two entwined serpents, a green landscape and a small house behind" },
    THREE: { hero: "dancing woman", scene: "three {hero} figures dancing in a circle and raising golden cups together in a joyful toast, ripe fruit and a harvest of pumpkins at their feet" },
    FOUR: { hero: "youth", scene: "a {hero} sitting under a tree with arms folded, looking discontent at three golden cups on the ground in front, a hand from a cloud offering a fourth cup" },
    FIVE: { hero: "cloaked figure", scene: "a {hero} in a long black cloak standing with the head bowed in grief over three spilled cups, two upright cups still standing behind, a bridge leading to a castle across a river" },
    SIX: { hero: "child", scene: "a {hero} child handing a cup filled with white flowers to a smaller {hero} child in a peaceful village courtyard, six large flower-filled cups arranged around them" },
    SEVEN: { hero: "figure", scene: "a {hero} seen from behind gazing up in wonder at seven golden cups floating in the clouds, each cup holding a different vision: a castle, jewels, a laurel wreath, a dragon, a glowing head, a coiled snake, and a shrouded glowing figure" },
    EIGHT: { hero: "cloaked traveler", scene: "a {hero} in a red cloak walking away with a staff toward distant mountains, leaving behind eight golden cups stacked with a gap in the row, an eclipsed moon in the night sky above" },
    NINE: { hero: "satisfied man", scene: "a {hero} seated contentedly with arms crossed and a broad smile, nine golden cups arranged in an arc on a curved blue-draped table behind" },
    TEN: { hero: "figure", scene: "a {hero} and a second {hero} standing with arms raised in joy beneath a great rainbow holding ten golden cups, two small {hero} children dancing nearby, a cottage and green hills behind" },
    PAGE: { hero: "young page", scene: "a {hero} in a tunic patterned with lotus flowers standing by a wavy sea, holding up a golden cup from which a small fish curiously rises" },
    KNIGHT: { hero: "knight", scene: "a {hero} in armor riding a white horse slowly and gracefully, a winged helmet on the head, holding out a golden cup, a river winding through the landscape" },
    QUEEN: { hero: "queen", scene: "a {hero} seated on an ornate throne carved with cherubs at the water's edge, gazing tenderly at a closed ornate golden chalice held in both hands" },
    KING: { hero: "king", scene: "a {hero} seated on a stone throne floating on a choppy sea, holding a golden cup in one hand and a short scepter in the other, a fish amulet at the neck, a ship and a leaping fish in the waves behind" },
  },
  swords: {
    ACE: { hero: "figure", scene: "a hand emerging from a cloud gripping a single upright double-edged sword, its tip crowned with a golden crown wreathed in laurel and palm, jagged grey mountains below" },
    TWO: { hero: "blindfolded woman", scene: "a {hero} seated on a stone bench by the sea, arms crossed and holding two long swords upright in perfect balance, a crescent moon in the evening sky behind" },
    THREE: { hero: "figure", scene: "a large red human heart pierced cleanly through by three crossed swords, heavy grey rain falling from storm clouds behind" },
    FOUR: { hero: "armored knight", scene: "a {hero} lying still in repose on top of a stone tomb like a carved effigy, hands pressed together in prayer, three swords hanging on the wall above and one sword carved beneath, a stained-glass window glowing nearby" },
    FIVE: { hero: "smirking figure", scene: "a {hero} gathering up three swords from the ground with a smug expression, two more swords lying at the feet, two defeated {hero} figures walking away dejected under a ragged stormy sky" },
    SIX: { hero: "ferryman", scene: "a {hero} poling a small wooden boat across calm water, ferrying a cloaked {hero} and a small {hero} child seated low, six swords standing upright in the boat, a calm far shore ahead" },
    SEVEN: { hero: "stealthy man", scene: "a {hero} creeping away on tiptoe carrying five swords bundled in the arms and glancing back with a sly grin, two swords left standing in the ground, a military camp with tents behind" },
    EIGHT: { hero: "bound woman", scene: "a {hero} standing bound and blindfolded and loosely wrapped in red cloth, surrounded by eight upright swords forming a cage in a grey marsh, a castle on a hill above" },
    NINE: { hero: "figure", scene: "a {hero} sitting up in bed in the dark with the face buried in both hands in distress, nine horizontal swords mounted on the black wall behind" },
    TEN: { hero: "fallen figure", scene: "a {hero} lying face down and still on the ground with ten swords driven into the back, a black sky lifting to a golden dawn over calm water on the horizon" },
    PAGE: { hero: "alert youth", scene: "a {hero} striding on a windswept hilltop, holding a sword upright in both hands and glancing back warily, ragged clouds and bending trees, birds wheeling in the turbulent sky" },
    KNIGHT: { hero: "charging knight", scene: "a {hero} in full armor charging at a furious gallop on a grey horse, sword raised high to strike, the cloak streaming, storm-bent trees and racing clouds behind" },
    QUEEN: { hero: "queen", scene: "a {hero} seated on a stone throne carved with a butterfly and a cherub, holding a single sword upright in the right hand and extending the left hand, a stern composed face, billowing clouds and one bird above" },
    KING: { hero: "king", scene: "a {hero} seated frontally on a stone throne carved with butterflies and angels, wearing a blue robe, holding a single upright sword tilted slightly, a serious commanding gaze, a blue sky with a few clouds" },
  },
  pentacles: {
    ACE: { hero: "figure", scene: "a hand emerging from a cloud holding up a single large golden coin engraved with a five-pointed pentagram, below it a lush garden with white lilies and an arched trellis of roses opening onto a path toward distant mountains" },
    TWO: { hero: "young man", scene: "a {hero} dancing while juggling two golden pentacles linked by a green ribbon looped into an infinity sign, two ships rising and dipping on big waves in the sea behind" },
    THREE: { hero: "sculptor", scene: "a {hero} standing on a bench carving stone in a cathedral and pausing to consult a {hero} monk and a {hero} architect holding plans, three pentacles set into the carved archway above" },
    FOUR: { hero: "miser", scene: "a {hero} seated on a stool clutching one golden pentacle tightly to the chest, one pentacle balanced on the crown of the head and one beneath each foot, a grey town skyline behind" },
    FIVE: { hero: "ragged beggar", scene: "a {hero} and a second {hero}, one on crutches with a bandaged leg, trudging through falling snow past a glowing stained-glass church window set with five pentacles" },
    SIX: { hero: "well-dressed merchant", scene: "a {hero} holding a balance scale and dropping coins into the hands of two kneeling {hero} beggars, six pentacles arranged in the air around them" },
    SEVEN: { hero: "young farmer", scene: "a {hero} leaning thoughtfully on the handle of a hoe and gazing at seven golden pentacles growing on a leafy green bush beside, a cultivated field around" },
    EIGHT: { hero: "craftsman", scene: "a {hero} seated at a bench carefully carving a golden pentacle with a chisel, six finished pentacles mounted on a post above and two below, a town in the far distance" },
    NINE: { hero: "elegant woman", scene: "a {hero} in a richly embroidered gown standing in a lush vineyard heavy with grapes, a hooded falcon perched on one gloved hand, nine golden pentacles among the vines, a manor house behind" },
    TEN: { hero: "white-bearded elder", scene: "a {hero} seated under an archway with two dogs, a {hero} couple and a small {hero} child nearby, ten golden pentacles arranged across the scene, a walled town beyond" },
    PAGE: { hero: "young page", scene: "a {hero} standing in a flowering green field, holding up a single golden pentacle in both hands and gazing at it intently, a freshly plowed field and trees behind" },
    KNIGHT: { hero: "knight", scene: "a {hero} in armor sitting still on a heavy black plow-horse at rest, holding a golden pentacle out on an open palm, gazing over freshly plowed fields" },
    QUEEN: { hero: "queen", scene: "a {hero} seated on a throne carved with goats fruit and cherubs in a blooming garden, cradling a golden pentacle in the lap, a rabbit leaping in the foreground, roses arching overhead" },
    KING: { hero: "king", scene: "a {hero} seated on a throne draped with grapevines and carved with bulls, wearing robes embroidered with grapes, one hand resting on a golden pentacle and the other holding a scepter, a castle behind" },
  },
};

const MINOR: TarotCard[] = [];
let nextId = MAJOR.length;
for (const suit of SUITS) {
  RANKS.forEach((rank, i) => {
    // Every rank is defined above; the fallback only guards against an accidental gap so a
    // missing entry degrades to a plain scene instead of crashing the whole deck.
    const s: MinorScene = MINOR_SCENES[suit.key][rank] ?? {
      hero: "figure",
      scene: `a {hero} in a scene expressing ${suit.element} energy`,
    };
    MINOR.push({
      id: nextId++,
      name: `${rank} OF ${suit.name}`,
      roman: MINOR_ROMAN[i],
      type: suit.key,
      theme: `${suit.theme}, ${rank.toLowerCase()} energy`,
      colors: [suit.color, suit.bg],
      symbols: [suit.element, suit.name.toLowerCase()],
      hero: s.hero,
      scene: s.scene,
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
// Each value names the artist/medium AND spells out its concrete visual DNA (palette, brushwork,
// light, texture, mood). A bare label like "Monet impressionist painting" is ignored by models
// that don't know the name; the descriptive features render the look even then. Keep entries
// compact (~10-18 words) so the scene still fits the model's prompt budget.
const STYLE_LEXICON: Record<string, string> = {
  // ── Western painters ──────────────────────────────────────────────
  梵谷: "Vincent van Gogh post-impressionist style, thick swirling impasto brushstrokes, vivid chrome-yellow and cobalt-blue, spiraling expressive skies, heavy visible texture",
  梵高: "Vincent van Gogh post-impressionist style, thick swirling impasto brushstrokes, vivid chrome-yellow and cobalt-blue, spiraling expressive skies, heavy visible texture",
  莫內: "Claude Monet impressionist style, soft broken brushstrokes, shimmering pastel light, hazy open-air atmosphere, blurred reflections on water",
  莫奈: "Claude Monet impressionist style, soft broken brushstrokes, shimmering pastel light, hazy open-air atmosphere, blurred reflections on water",
  馬內: "Édouard Manet style, bold flat brushwork, strong light-and-dark contrast, modern realist subjects, loose confident strokes",
  雷諾瓦: "Pierre-Auguste Renoir impressionist style, soft feathery brushwork, warm glowing flesh tones, dappled sunlight, luminous joyful color",
  竇加: "Edgar Degas style, soft pastel and oil, candid off-center composition, graceful dancers, warm diffused stage light",
  德加: "Edgar Degas style, soft pastel and oil, candid off-center composition, graceful dancers, warm diffused stage light",
  塞尚: "Paul Cézanne post-impressionist style, blocky geometric brush planes, muted earthy greens and ochres, solid structured forms",
  高更: "Paul Gauguin post-impressionist style, flat areas of saturated color, bold dark outlines, symbolic tropical scenes",
  秀拉: "Georges Seurat pointillist style, tiny dots of pure color, luminous shimmering surface, calm orderly composition",
  馬諦斯: "Henri Matisse Fauvist style, bold flat vivid color, simplified organic shapes, expressive decorative patterns",
  馬蒂斯: "Henri Matisse Fauvist style, bold flat vivid color, simplified organic shapes, expressive decorative patterns",
  畢卡索: "Pablo Picasso cubist style, fragmented geometric planes, multiple simultaneous viewpoints, angular abstracted figures, muted greys and ochres",
  達利: "Salvador Dalí surrealist style, hyper-real dreamlike imagery, melting distorted forms, vast empty landscapes, sharp uncanny detail",
  米羅: "Joan Miró style, playful biomorphic shapes, bold primary colors on flat ground, whimsical abstract symbols",
  康丁斯基: "Wassily Kandinsky abstract style, dynamic floating geometric shapes, bold musical color, energetic lines and circles",
  蒙德里安: "Piet Mondrian De Stijl style, grid of thick black lines, flat blocks of primary red blue and yellow on white",
  克林姆: "Gustav Klimt Art Nouveau style, shimmering gold-leaf ornament, decorative mosaic patterns, sensual elegant figures, byzantine richness",
  慕夏: "Alphonse Mucha Art Nouveau style, elegant flowing linework, soft pastel decorative panels, ornate floral borders, graceful figures",
  孟克: "Edvard Munch expressionist style, swirling anxious lines, intense emotional color, haunting distorted figures",
  林布蘭: "Rembrandt Baroque style, dramatic chiaroscuro, warm golden light emerging from deep shadow, rich brown tones, soulful realism",
  林布蘭特: "Rembrandt Baroque style, dramatic chiaroscuro, warm golden light emerging from deep shadow, rich brown tones, soulful realism",
  維梅爾: "Johannes Vermeer style, soft natural daylight from a window, calm quiet interior, luminous blue and yellow, fine delicate realism",
  卡拉瓦喬: "Caravaggio Baroque tenebrism, extreme dramatic light against deep darkness, intense realism, a spotlight on the figures",
  達文西: "Leonardo da Vinci High Renaissance style, soft sfumato smoky shading, subtle chiaroscuro, muted earth tones, lifelike anatomy, serene atmospheric depth",
  達芬奇: "Leonardo da Vinci High Renaissance style, soft sfumato smoky shading, subtle chiaroscuro, muted earth tones, lifelike anatomy, serene atmospheric depth",
  米開朗基羅: "Michelangelo Renaissance style, powerful muscular sculpted figures, fresco color, heroic dynamic poses, idealized anatomy",
  拉斐爾: "Raphael High Renaissance style, balanced harmonious composition, soft idealized faces, gentle clear color, graceful classical form",
  波提切利: "Sandro Botticelli early Renaissance style, flowing linear grace, delicate pale figures, soft tempera color, mythological elegance",
  透納: "J.M.W. Turner Romantic style, luminous atmospheric light, swirling mist and storm, dissolving golden seascapes, loose expressive color",
  哥雅: "Francisco Goya style, dark dramatic Romanticism, muted earthy palette, haunting expressive figures, loose moody brushwork",
  波希: "Hieronymus Bosch style, fantastical surreal medieval scenes, swarming bizarre creatures, intricate detail, dreamlike allegory",
  維拉斯奎茲: "Diego Velázquez Baroque style, loose masterful brushwork, dignified realism, subtle silvery light, rich restrained color",
  沃荷: "Andy Warhol Pop Art style, bold flat screen-print color, high-contrast repetition, vivid commercial pop palette",
  安迪沃荷: "Andy Warhol Pop Art style, bold flat screen-print color, high-contrast repetition, vivid commercial pop palette",
  // ── Asian painters & styles (pan-Asia: Japan / China / Korea / India / Persia / Tibet / SE Asia) ──
  葛飾北齋: "Katsushika Hokusai ukiyo-e style, bold woodblock outlines, flat Prussian-blue and indigo, stylized waves and Mount Fuji, dynamic linework",
  北齋: "Katsushika Hokusai ukiyo-e style, bold woodblock outlines, flat Prussian-blue and indigo, stylized waves and Mount Fuji, dynamic linework",
  歌川廣重: "Utagawa Hiroshige ukiyo-e style, serene woodblock landscapes, softly gradated skies, poetic seasonal scenes, flat layered color",
  廣重: "Utagawa Hiroshige ukiyo-e style, serene woodblock landscapes, softly gradated skies, poetic seasonal scenes, flat layered color",
  伊藤若冲: "Itō Jakuchū Edo style, meticulous vivid birds and flowers, jewel-like color, intricate decorative detail on silk",
  草間彌生: "Yayoi Kusama style, hypnotic polka dots, repeating nets, bold saturated color, immersive infinite pattern",
  張大千: "Zhang Daqian style, Chinese ink with splashed vivid color, misty layered mountains, bold flowing washes, expressive white space",
  齊白石: "Qi Baishi style, spontaneous Chinese ink, lively creatures, bold minimal strokes, generous white space",
  徐悲鴻: "Xu Beihong style, expressive ink galloping horses, fluid energetic brushwork, Chinese ink fused with Western realism",
  吳冠中: "Wu Guanzhong style, modern Chinese ink, light airy abstraction, fine black lines with scattered dots of color, lyrical white space",
  八大山人: "Bada Shanren style, sparse minimalist ink, lone expressive bird or fish, bold empty space, eccentric brush",
  村上隆: "Takashi Murakami superflat style, bright flat pop color, smiling cartoon flowers, glossy playful repeating patterns",
  奈良美智: "Yoshitomo Nara style, simple flat backgrounds, big-eyed wistful children, soft muted palette, minimal clean lines",
  宮崎駿: "Studio Ghibli / Hayao Miyazaki anime style, lush hand-painted backgrounds, soft warm color, whimsical detailed scenery, gentle painterly light",
  吉卜力: "Studio Ghibli anime style, lush hand-painted backgrounds, soft warm color, whimsical detailed scenery, gentle painterly light",
  // Korea
  金弘道: "Kim Hong-do Joseon style, lively ink genre scenes of everyday life, light delicate color, fluid expressive brush",
  申潤福: "Shin Yun-bok Joseon style, elegant refined figures, delicate linework, soft muted color, intimate genre scenes",
  韓國民畫: "Korean minhwa folk-painting style, bold flat bright color, charming naive symbolism, decorative tigers and flowers",
  // India
  拉維瓦爾馬: "Raja Ravi Varma style, Indian academic realism, Hindu mythological figures, rich saturated color, theatrical lighting",
  印度細密畫: "Indian Mughal miniature style, intricate fine detail, flat jewel-toned color, ornate decorative borders, delicate patterning",
  // Persia / Middle East
  波斯細密畫: "Persian miniature style, intricate flat patterning, luminous jewel colors, gold accents, ornate decorative detail",
  // Tibet
  唐卡: "Tibetan thangka style, precise symmetrical Buddhist iconography, vivid mineral colors, fine gold outlines, intricate sacred detail",
  // Southeast Asia
  阿莫索洛: "Fernando Amorsolo Filipino style, golden backlit rural scenes, warm glowing sunlight, idyllic genre realism",
  泰國壁畫: "traditional Thai mural style, intricate gold linework, flat decorative figures, ornate temple patterning",
  峇里島畫: "Balinese painting style, dense intricate detail, lush foliage, rhythmic stylized figures, earthy traditional color",
  越南絹畫: "Vietnamese silk painting style, soft translucent layers on silk, gentle muted color, delicate graceful figures",
  // ── media ─────────────────────────────────────────────────────────
  水彩: "watercolor painting, soft translucent washes, bleeding pigments, luminous paper texture, gentle gradients",
  油畫: "oil painting, rich blended color, visible brushwork, deep luminous tones, classical canvas texture",
  壓克力: "acrylic painting, bright opaque color, crisp confident strokes, smooth modern finish",
  素描: "pencil sketch, fine graphite hatching, soft tonal shading, hand-drawn linework on paper",
  鉛筆: "pencil drawing, delicate graphite lines, soft shading, monochrome paper texture",
  彩色鉛筆: "colored-pencil illustration, soft layered strokes, gentle blended hues, subtle paper grain",
  炭筆: "charcoal drawing, bold smudged blacks, dramatic soft shading, expressive grainy texture",
  粉彩: "soft pastel painting, velvety blended color, chalky matte texture, gentle dreamy light",
  水墨: "traditional Chinese ink wash painting, fluid black brushstrokes, soft grey gradients, expressive empty space, rice-paper texture",
  國畫: "traditional Chinese ink wash painting, fluid black brushstrokes, soft grey gradients, expressive empty space, rice-paper texture",
  中國風: "traditional Chinese art style, elegant ink linework, refined classical motifs, harmonious composition",
  浮世繪: "ukiyo-e Japanese woodblock print, bold flat outlines, layered flat color, stylized waves and patterns",
  版畫: "woodcut print, bold carved black lines, high-contrast flat areas, rugged hand-printed texture",
  剪紙: "paper-cut collage, crisp flat silhouettes, bold layered shapes, clean negative space",
  彩繪玻璃: "stained glass style, glowing jewel-toned panels, bold black leading lines, radiant backlight",
  馬賽克: "mosaic art, small colored tiles, textured grout grid, shimmering pieced-together image",
  刺繡: "embroidery art, raised stitched threads, soft fabric texture, intricate needlework detail",
  // ── styles / genres ───────────────────────────────────────────────
  動漫: "anime manga style, clean cel-shaded color, expressive large eyes, crisp linework, vivid backgrounds",
  日漫: "Japanese anime style, clean cel-shaded color, expressive large eyes, crisp linework",
  二次元: "anime style, clean cel shading, bright saturated color, crisp outlines",
  動畫: "animation style, smooth stylized shapes, bright flat color, playful character design",
  漫畫: "comic book style, bold ink outlines, dynamic panels, halftone shading, punchy color",
  卡通: "cartoon style, bold simple outlines, bright flat color, playful exaggerated shapes",
  像素: "pixel art, blocky retro pixels, limited palette, crisp 8-bit shapes",
  點陣: "pixel art, blocky retro pixels, limited palette, crisp 8-bit shapes",
  寫實: "photorealistic, lifelike detail, natural lighting, realistic texture and depth",
  逼真: "photorealistic, lifelike detail, natural lighting, realistic texture and depth",
  印象派: "impressionist painting, soft broken brushstrokes, luminous light, hazy color, blurred edges",
  後印象派: "post-impressionist painting, bold expressive brushwork, vivid non-natural color, structured form",
  表現主義: "expressionist painting, distorted emotional forms, bold clashing color, energetic brushwork",
  超現實: "surrealist style, dreamlike impossible imagery, uncanny juxtapositions, sharp detail",
  立體派: "cubist painting, fragmented geometric planes, multiple viewpoints, angular abstracted forms",
  新藝術: "Art Nouveau style, elegant flowing organic lines, ornate floral motifs, soft decorative color",
  裝飾藝術: "Art Deco style, bold geometric symmetry, sleek metallic gold and black, elegant streamlined forms",
  普普: "Pop Art style, bold flat color, high-contrast outlines, vivid commercial graphic look",
  波普: "Pop Art style, bold flat color, high-contrast outlines, vivid commercial graphic look",
  塗鴉: "graffiti street-art style, bold spray-paint color, dynamic lettering energy, urban wall texture",
  街頭: "street-art style, bold spray-paint color, raw urban energy, layered textures",
  極簡: "minimalist style, clean simple shapes, limited palette, generous negative space",
  簡約: "minimalist style, clean simple shapes, limited palette, generous negative space",
  復古: "vintage retro style, faded warm tones, aged paper texture, nostalgic mid-century look",
  懷舊: "vintage nostalgic style, soft faded color, warm aged atmosphere, sentimental mood",
  哥德: "gothic style, dark moody atmosphere, pointed arches, dramatic shadow, ornate macabre detail",
  歌德: "gothic style, dark moody atmosphere, pointed arches, dramatic shadow, ornate macabre detail",
  暗黑: "dark moody atmosphere, deep shadows, brooding low-key lighting, somber palette",
  夢幻: "dreamy ethereal style, soft glowing light, pastel haze, gentle floating atmosphere",
  奇幻: "fantasy art style, epic magical scenery, rich detailed worldbuilding, luminous atmosphere",
  童話: "fairytale storybook illustration, whimsical soft watercolor, warm enchanting light, charming detail",
  繪本: "storybook illustration, gentle hand-drawn charm, soft warm color, cozy whimsical mood",
  賽博龐克: "cyberpunk style, neon-lit rain-slick city, glowing magenta and cyan, holographic signage, dark high-tech mood",
  電馭叛客: "cyberpunk style, neon-lit rain-slick city, glowing magenta and cyan, holographic signage, dark high-tech mood",
  蒸汽龐克: "steampunk style, brass gears and copper machinery, Victorian industrial design, warm sepia tones, intricate clockwork",
  中世紀: "medieval style, illuminated-manuscript look, ornate gold borders, flat heraldic color, antique parchment",
  霓虹: "neon glow style, vivid glowing light, electric color against darkness, luminous haze",
  唯美: "aesthetic and beautiful style, delicate refined detail, soft harmonious color, graceful mood",
  可愛: "cute kawaii style, soft rounded shapes, pastel candy color, charming adorable characters",
  黑白: "black-and-white monochrome, high-contrast tones, no color, dramatic light and shadow",
  // suffixes — skipped for the subject box via STYLE_SUFFIX_KEYS; matched last by length sort
  畫風: " style",
  風格: " style",
};

// "畫風"/"風格" mean "…style" and only make sense in the STYLE box. When localizing the SUBJECT
// (the character) we skip them, so "貓咪風格" doesn't become "貓咪 style" (a stray style token in
// the character slot). They stay in the lexicon for the style box where they belong.
const STYLE_SUFFIX_KEYS = new Set(["畫風", "風格"]);

/**
 * Replace known Chinese art-style terms with English. Longest keys first so
 * compounds win (e.g. "梵谷畫風" → Van Gogh… , not "梵谷" + leftover "畫風").
 * Free, local, no API call. Also used to localize the subject/character text —
 * pass { skipSuffixes: true } there so the "…style" suffixes are not applied.
 */
export function localizeStyle(input: string, opts: { skipSuffixes?: boolean } = {}): string {
  let out = input;
  for (const key of Object.keys(STYLE_LEXICON).sort((a, b) => b.length - a.length)) {
    if (opts.skipSuffixes && STYLE_SUFFIX_KEYS.has(key)) continue;
    // Pad with spaces so adjacently-typed CJK terms (e.g. "哥德暗黑") don't fuse into
    // "gothicdark moody"; the trailing whitespace-collapse cleans up the doubles.
    if (out.includes(key)) out = out.split(key).join(` ${STYLE_LEXICON[key]} `);
  }
  return out.replace(/\s+/g, " ").trim();
}

/**
 * Quick-pick chips. `zh` is a real STYLE_LEXICON key — clicking inserts the zh term, and
 * buildCardPrompt's localizeStyle expands it to the full rich description at generation time
 * (single source of truth — the chip never duplicates the description). `en` is just the
 * display gloss shown on the chip. Grouped by `group` for the UI section headers.
 */
// Every primary STYLE_LEXICON style gets a chip here (synonyms/aliases omitted — they expand to
// the same description). Keep each group's entries contiguous (the UI derives section order from
// each group's first appearance). Guard: every `zh` MUST be a real lexicon key (node test asserts
// it expands to English) — otherwise the chip inserts un-translatable CJK and the model ignores it.
export const STYLE_PRESETS: { zh: string; en: string; group: string }[] = [
  // ── 西方畫家 ──
  { zh: "達文西", en: "Da Vinci", group: "西方畫家" },
  { zh: "米開朗基羅", en: "Michelangelo", group: "西方畫家" },
  { zh: "拉斐爾", en: "Raphael", group: "西方畫家" },
  { zh: "波提切利", en: "Botticelli", group: "西方畫家" },
  { zh: "卡拉瓦喬", en: "Caravaggio", group: "西方畫家" },
  { zh: "林布蘭", en: "Rembrandt", group: "西方畫家" },
  { zh: "維梅爾", en: "Vermeer", group: "西方畫家" },
  { zh: "維拉斯奎茲", en: "Velázquez", group: "西方畫家" },
  { zh: "哥雅", en: "Goya", group: "西方畫家" },
  { zh: "波希", en: "Bosch", group: "西方畫家" },
  { zh: "透納", en: "Turner", group: "西方畫家" },
  { zh: "莫內", en: "Monet", group: "西方畫家" },
  { zh: "馬內", en: "Manet", group: "西方畫家" },
  { zh: "雷諾瓦", en: "Renoir", group: "西方畫家" },
  { zh: "竇加", en: "Degas", group: "西方畫家" },
  { zh: "塞尚", en: "Cézanne", group: "西方畫家" },
  { zh: "秀拉", en: "Seurat", group: "西方畫家" },
  { zh: "梵谷", en: "Van Gogh", group: "西方畫家" },
  { zh: "高更", en: "Gauguin", group: "西方畫家" },
  { zh: "孟克", en: "Munch", group: "西方畫家" },
  { zh: "克林姆", en: "Klimt", group: "西方畫家" },
  { zh: "慕夏", en: "Mucha", group: "西方畫家" },
  { zh: "馬諦斯", en: "Matisse", group: "西方畫家" },
  { zh: "畢卡索", en: "Picasso", group: "西方畫家" },
  { zh: "達利", en: "Dalí", group: "西方畫家" },
  { zh: "米羅", en: "Miró", group: "西方畫家" },
  { zh: "康丁斯基", en: "Kandinsky", group: "西方畫家" },
  { zh: "蒙德里安", en: "Mondrian", group: "西方畫家" },
  { zh: "沃荷", en: "Warhol", group: "西方畫家" },
  // ── 亞洲畫家 ──
  { zh: "葛飾北齋", en: "Hokusai", group: "亞洲畫家" },
  { zh: "歌川廣重", en: "Hiroshige", group: "亞洲畫家" },
  { zh: "伊藤若冲", en: "Jakuchū", group: "亞洲畫家" },
  { zh: "村上隆", en: "Murakami", group: "亞洲畫家" },
  { zh: "奈良美智", en: "Nara", group: "亞洲畫家" },
  { zh: "草間彌生", en: "Kusama", group: "亞洲畫家" },
  { zh: "張大千", en: "Zhang Daqian", group: "亞洲畫家" },
  { zh: "齊白石", en: "Qi Baishi", group: "亞洲畫家" },
  { zh: "徐悲鴻", en: "Xu Beihong", group: "亞洲畫家" },
  { zh: "吳冠中", en: "Wu Guanzhong", group: "亞洲畫家" },
  { zh: "八大山人", en: "Bada Shanren", group: "亞洲畫家" },
  { zh: "金弘道", en: "Kim Hong-do", group: "亞洲畫家" },
  { zh: "申潤福", en: "Shin Yun-bok", group: "亞洲畫家" },
  { zh: "韓國民畫", en: "Korean minhwa", group: "亞洲畫家" },
  { zh: "拉維瓦爾馬", en: "Ravi Varma", group: "亞洲畫家" },
  { zh: "印度細密畫", en: "Indian miniature", group: "亞洲畫家" },
  { zh: "波斯細密畫", en: "Persian miniature", group: "亞洲畫家" },
  { zh: "唐卡", en: "Thangka", group: "亞洲畫家" },
  { zh: "阿莫索洛", en: "Amorsolo", group: "亞洲畫家" },
  { zh: "泰國壁畫", en: "Thai mural", group: "亞洲畫家" },
  { zh: "峇里島畫", en: "Balinese", group: "亞洲畫家" },
  { zh: "越南絹畫", en: "Vietnamese silk", group: "亞洲畫家" },
  // ── 媒材 ──
  { zh: "水彩", en: "watercolor", group: "媒材" },
  { zh: "油畫", en: "oil", group: "媒材" },
  { zh: "壓克力", en: "acrylic", group: "媒材" },
  { zh: "素描", en: "sketch", group: "媒材" },
  { zh: "鉛筆", en: "pencil", group: "媒材" },
  { zh: "彩色鉛筆", en: "colored pencil", group: "媒材" },
  { zh: "炭筆", en: "charcoal", group: "媒材" },
  { zh: "粉彩", en: "pastel", group: "媒材" },
  { zh: "水墨", en: "Chinese ink", group: "媒材" },
  { zh: "中國風", en: "Chinese style", group: "媒材" },
  { zh: "浮世繪", en: "ukiyo-e", group: "媒材" },
  { zh: "版畫", en: "woodcut", group: "媒材" },
  { zh: "剪紙", en: "paper-cut", group: "媒材" },
  { zh: "彩繪玻璃", en: "stained glass", group: "媒材" },
  { zh: "馬賽克", en: "mosaic", group: "媒材" },
  { zh: "刺繡", en: "embroidery", group: "媒材" },
  // ── 風格 ──
  { zh: "動漫", en: "anime", group: "風格" },
  { zh: "動畫", en: "animation", group: "風格" },
  { zh: "漫畫", en: "comic", group: "風格" },
  { zh: "卡通", en: "cartoon", group: "風格" },
  { zh: "吉卜力", en: "Ghibli", group: "風格" },
  { zh: "像素", en: "pixel art", group: "風格" },
  { zh: "寫實", en: "photoreal", group: "風格" },
  { zh: "印象派", en: "impressionist", group: "風格" },
  { zh: "後印象派", en: "post-impressionist", group: "風格" },
  { zh: "表現主義", en: "expressionist", group: "風格" },
  { zh: "超現實", en: "surreal", group: "風格" },
  { zh: "立體派", en: "cubist", group: "風格" },
  { zh: "新藝術", en: "art nouveau", group: "風格" },
  { zh: "裝飾藝術", en: "art deco", group: "風格" },
  { zh: "普普", en: "pop art", group: "風格" },
  { zh: "塗鴉", en: "graffiti", group: "風格" },
  { zh: "極簡", en: "minimalist", group: "風格" },
  { zh: "復古", en: "vintage", group: "風格" },
  { zh: "懷舊", en: "nostalgic", group: "風格" },
  { zh: "哥德", en: "gothic", group: "風格" },
  { zh: "暗黑", en: "dark", group: "風格" },
  { zh: "夢幻", en: "dreamy", group: "風格" },
  { zh: "奇幻", en: "fantasy", group: "風格" },
  { zh: "童話", en: "fairytale", group: "風格" },
  { zh: "繪本", en: "storybook", group: "風格" },
  { zh: "賽博龐克", en: "cyberpunk", group: "風格" },
  { zh: "蒸汽龐克", en: "steampunk", group: "風格" },
  { zh: "中世紀", en: "medieval", group: "風格" },
  { zh: "霓虹", en: "neon", group: "風格" },
  { zh: "唯美", en: "aesthetic", group: "風格" },
  { zh: "可愛", en: "kawaii", group: "風格" },
  { zh: "黑白", en: "monochrome", group: "風格" },
];

// Default style used when the user gives none — keeps un-styled output looking like a deck.
const DEFAULT_STYLE = "ornate colored-pencil fantasy illustration, Rider-Waite inspired, warm antique palette";

export interface CardPromptInput {
  /** User style text (artist / medium / genre). Optional → DEFAULT_STYLE. */
  style?: string;
  /**
   * Subject / character override — WHO appears as the central figure(s). A noun phrase such as
   * "a fluffy orange cat", "a cartoon robot", "a smiling girl". Empty → the card's RWS default
   * hero. A leading article is stripped so it slots cleanly into "a {hero}" / "a second {hero}".
   * NOTE: when the user uploads a reference photo instead, leave this empty — the image model
   * maps the photo onto the figure on its own (the proven cat-deck path); no text needed here.
   */
  subject?: string;
}

/**
 * Strip a leading article so the subject slots into the scene's own "a {hero}" article.
 * The trailing `(?:\s+|$)` makes a bare article ("the", "a", "an" with nothing after) strip to
 * "" → consistent fallback to the card's hero, while a real word that merely starts with a/an/the
 * ("android", "apple", "theatre mask") is left intact (the article must be a whole word).
 */
function normalizeSubject(s: string): string {
  return s.replace(/^\s*(?:an?|the)(?:\s+|$)/i, "").trim();
}

/**
 * Build the full image-model prompt for one card.
 *
 * Two orthogonal inputs: `style` (HOW it is painted) and `subject` (WHO the figure is). The
 * card's `scene` fixes WHAT happens — composition, props, symbolism — and stays faithful to RWS.
 *
 * FLUX (esp. schnell) has NO negative prompt and mis-reads negations — writing "no text",
 * "no border", "no card name" makes it DRAW garbled text + a frame, because it only has the
 * positive tokens "text / border / card name" to work with. So this prompt:
 *   • describes ONLY what we want (never says no / not / without),
 *   • never mentions "tarot card", "frame", "title" (those cues trigger a bordered, captioned card),
 *   • leads with the style (FLUX weights early tokens most) and restates it at the end.
 * The frame + Roman numeral + card name are added afterwards by our canvas (renderPrintCard.ts).
 */
export function buildCardPrompt(card: TarotCard, input: CardPromptInput = {}): string {
  // Subject: localize known zh terms (skip the "…style" suffixes), strip a leading article,
  // fall back to the card's hero when empty.
  const subject = normalizeSubject(localizeStyle((input.subject ?? "").trim(), { skipSuffixes: true }));
  const hero = subject || card.hero;
  const scene = card.scene.split("{hero}").join(hero);

  const style = localizeStyle((input.style ?? "").trim());
  const lead = style || DEFAULT_STYLE;

  // Style leads — FLUX weights early tokens most. The rich style descriptions are long (~25 words),
  // so the tail uses a SHORT cohesion cue rather than restating the whole block: repeating ~25 words
  // would push the prompt past the encoder window (CLIP-77 / T5-512) and drop the scene. The lead
  // placement carries the style; the tail just asks for internal consistency.
  return `${lead}. ${scene}. Single vertical full-bleed scene in one cohesive consistent art style, rich symbolic detail.`;
}
