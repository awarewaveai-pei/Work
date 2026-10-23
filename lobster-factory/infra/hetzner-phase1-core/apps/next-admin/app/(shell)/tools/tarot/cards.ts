// 78-card tarot dataset for the print-file generator.
// Ground truth for every scene: agency-os/docs/tarot_cards/ (78_Tarot_Card_Visual_Descriptions_EN.md + the 78 original
// RWS images in "Tarot card Images/"). Check a scene change against the image, not only the text: sides, worn vs
// draped clothing and counts were wrong in text that read fine (2026-10-23).
// Each card carries a Rider-Waite-Smith (RWS, 1909, public domain) faithful `scene` plus a
// swappable protagonist token `{hero}`:
//   • `scene` fixes the composition, props and symbolism (the part that must stay faithful);
//   • `{hero}` marks the central figure(s) so the user can replace WHO appears — a cat, a
//     cartoon character, a real person — while the scene stays correct. No subject → the
//     card's RWS-faithful default `hero` is used.
// Style (artist / medium / genre) is layered separately by buildCardPrompt and never touches
// the scene. Visual meta (colors/symbols) feeds the canvas print-card frame (renderPrintCard.ts).

import { STYLE_CATALOG } from "./tarotStyles";

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
   * Every protagonist is a `{hero}`, also a non-human one (the Aces' hand from a cloud, the Wheel's sphinx, the Moon's
   * dog and wolf): a swapped subject left those cards with no trace of it. Only 3 of Swords and 8 of Wands, which have
   * no figure, carry no `{hero}`. Secondary figures (acolytes, Death's onlookers) stay as written.
   */
  scene: string;
  /**
   * Default protagonist when the user supplies no subject — a bare noun core WITHOUT a leading
   * article (the scene template supplies "a"/"the"/"two"). RWS-faithful human identity.
   * The protagonist's clothing lives HERE, never in `scene` / `pose` / `natural`: a swapped subject then drops it with
   * the default hero, so
   * a 「動物・自然」 cat wears no robe, while the default king still wears his (a robe "draped over the throne" was
   * the earlier workaround and moved the robe off the RWS figure). Symbols that carry the meaning (a crown, a victory
   * wreath, a blindfold, a bandage) stay in the text for any subject.
   */
  hero: string;
  /**
   * The card's core RWS action in one short sentence written with `{hero}`. buildCardPrompt puts it FIRST, before
   * the style lead: FLUX weights early tokens most and schnell truncates long prompts, so the action must not sit
   * behind a 1200-char style. Present on every card whose scene has `{hero}`.
   */
  pose?: string;
  /** The action needs held props or hand gestures. With an animal subject buildCardPrompt then either stands the hero
   *  up using its front paws as hands (「動物・擬人」) or uses `natural` (「動物・自然」). */
  upright?: true;
  /** 「動物・自然」: the whole four-legged action, written with `{hero}` like `pose`, which it replaces. It keeps the
   *  posture, gaze, direction and the gesture that carries the meaning (THE MAGICIAN: a paw to the sky, the tail to
   *  the ground) and places the props in the mouth / beside / between the paws. Every `upright` card has one. The
   *  `scene` of an `upright` card names no hands or holding: a hand clause there contradicted this sentence and FLUX
   *  drew the cat standing (2026-10-22); the held props live in `pose` / `natural`. */
  natural?: string;
  /** The scene puts a figure off the ground on purpose (falling, rising, hanging, floating); buildCardPrompt then
   *  skips the grounding sentence. Floating OBJECTS (cups, coins, symbols) do not need this flag. */
  airborne?: true;
  /** THE LOVERS: the first `{hero}` in pose/scene is figure A, the second is figure B; buildCardPrompt genders them
   *  from `CardPromptInput.couple` (RWS: A = the woman on the left before the serpent tree, looking up at the angel;
   *  B = the man on the right before the tree of flames). FLUX places the first-named figure and tree on the left, so
   *  the text runs left to right: naming the right-hand man first swapped the trees (seed 7, 2026-10-23). */
  couple?: true;
  /** Two different protagonists (THE MOON: the tame dog and the wild wolf). As with `couple`, each text's first `{hero}`
   *  is figure A and its next is B. No subject → `figures`; a subject → "<mod> <subject>" for each, so the
   *  tame-versus-wild meaning survives the swap. `hero` is unused on such a card. */
  duo?: { figures: [string, string]; mods: [string, string] };
  /** Two..Ten: the counted suit objects with their exact total and arrangement, said ONCE, at `{objects}` in pose and
   *  natural; scene never names them. Each repeat read as more objects: "juggling two golden pentacles" + "exactly two
   *  round golden coins" + "two golden pentacles linked by a ribbon" drew four coins (FLUX schnell, 2026-10-23). */
  objects?: string;
}

// An airborne card loses the grounding sentence for ALL its figures, so its scene text must itself put any
// standing figure on the ground (THE LOVERS: the pair on the grass, the angel in the clouds).

const MAJOR: TarotCard[] = [
  { id: 0, name: "THE FOOL", roman: "0", type: "major", theme: "new beginnings, adventure, innocence", colors: ["#f0c040", "#fff8dc"], symbols: ["sun", "mountains", "flower"], hero: "carefree young traveler in a flowered tunic, yellow boots and a red-feathered cap", pose: "a {hero} striding across the flat cliff top toward its edge, a white rose in the left hand and a knapsack tied to a slender staff resting over the right shoulder, head tilted up smiling at the sky", upright: true, natural: "a {hero} trotting on all four paws across the flat cliff top toward its edge, head tilted up toward the sky, a white rose in its mouth and a small knapsack tied to a slender staff lying on the rock beside it", scene: "a {hero} at the very edge of a high flat cliff top; exactly one small white dog standing on the rock at its heels, looking up and barking; a radiant white sun in the upper right of a golden morning sky, snowy mountains in the distance" },
  { id: 1, name: "THE MAGICIAN", roman: "I", type: "major", theme: "willpower, skill, manifestation", colors: ["#c0392b", "#fff"], symbols: ["infinity", "wand", "pentagram"], hero: "robed magician", pose: "a {hero} standing tall behind an altar, the right hand raising a wand high toward the sky and the left hand pointing one finger straight down at the ground", upright: true, natural: "a {hero} sitting upright on its haunches behind the altar, one front paw lifted high toward the sky and its tail hanging straight down to the ground, a wand lying on the altar before it", scene: "a {hero} behind a low stone altar, a glowing infinity symbol floating above the head, a serpent belt at the waist, a cup a sword a pentacle and a wand laid on the altar, red roses and white lilies blooming around" },
  { id: 2, name: "THE HIGH PRIESTESS", roman: "II", type: "major", theme: "intuition, mystery, inner wisdom", colors: ["#1a1a6e", "#c8b8f8"], symbols: ["crescent moon", "pillars", "veil"], hero: "serene priestess", pose: "a {hero} seated perfectly still and upright between two pillars, facing the viewer, a half-hidden scroll held in the lap", upright: true, natural: "a {hero} sitting perfectly still on its haunches between the two pillars, facing the viewer, a rolled scroll lying half-hidden between its front paws", scene: "a {hero} between one black pillar and one white pillar, a horned crown bearing a full moon on the brow, a crescent moon resting at the feet, a tapestry veil patterned with pomegranates and tall fronded date trees behind" },
  { id: 3, name: "THE EMPRESS", roman: "III", type: "major", theme: "abundance, fertility, nature", colors: ["#2d6a4f", "#b7e4c7"], symbols: ["wheat", "venus", "crown"], hero: "crowned empress", pose: "a {hero} seated at ease on a cushioned throne, crowned with twelve stars, the right hand raising a golden scepter topped with an orb", upright: true, natural: "a {hero} lying at ease on the heaped red cushions of the throne, crowned with twelve stars, a golden scepter topped with an orb lying beside its front paws", scene: "a {hero} on a throne heaped with lush red cushions in a golden field of ripe wheat, a heart-shaped shield bearing the symbol of Venus resting beside, a waterfall and deep green forest behind" },
  { id: 4, name: "THE EMPEROR", roman: "IV", type: "major", theme: "authority, structure, fatherhood", colors: ["#6b2d8b", "#e8c8f8"], symbols: ["throne", "ram", "scepter"], hero: "stern white-bearded emperor in a red robe over armor", pose: "a {hero} seated stern and upright on a stone throne, an ankh scepter raised in the right hand and a golden orb held in the left", upright: true, natural: "a {hero} sitting stern and upright on its haunches on the stone throne, chin lifted, an ankh scepter and a golden orb lying before its front paws", scene: "a {hero} on a massive stone throne carved with four ram heads, jagged barren red mountains behind" },
  { id: 5, name: "THE HIEROPHANT", roman: "V", type: "major", theme: "tradition, faith, institutions", colors: ["#8b4513", "#f5deb3"], symbols: ["cross", "pillars", "keys"], hero: "high priest in sacred vestments", pose: "a {hero} seated on a throne, the right hand raised in blessing with two fingers up, the left hand holding a triple cross staff", upright: true, natural: "a {hero} sitting upright on its haunches on the throne, one front paw lifted in blessing, a triple cross staff leaning against the throne beside it", scene: "a {hero} wearing a triple-tiered crown on a throne between two stone pillars, two tonsured acolytes kneeling below, a pair of crossed golden keys at the feet" },
  { id: 6, name: "THE LOVERS", roman: "VI", type: "major", theme: "love, choice, union", colors: ["#e91e63", "#fce4ec"], symbols: ["angel", "sun", "hearts"], hero: "nude figure", airborne: true, couple: true, pose: "a {hero} on the left and a second {hero} on the right apart on the grass, the left one gazing up toward an angel above, the right one looking toward the left one", scene: "a {hero} on the left and a second {hero} on the right apart on the grass of a green garden, a tall mountain rising in the distance between them, beneath a great winged angel in the clouds with outstretched arms haloed by a radiant sun, behind the left figure a fruit tree entwined with a serpent, behind the right figure a bare dark tree whose branch tips each burn with a small candle flame, twelve flames on the tree" },
  { id: 7, name: "THE CHARIOT", roman: "VII", type: "major", theme: "victory, control, determination", colors: ["#1565c0", "#e3f2fd"], symbols: ["armor", "sphinxes", "stars"], hero: "crowned warrior in armor", pose: "a {hero} standing erect and proud inside a chariot, chest out, facing the viewer, one hand holding a short scepter", upright: true, natural: "a {hero} standing proud on all four legs inside the chariot, chest out, facing the viewer, a short golden scepter lying at its front paws", scene: "a {hero} in a stone chariot beneath a starry blue canopy, the chariot drawn by one black sphinx and one white sphinx resting in front, a winged sun emblem on the chariot, a walled city behind" },
  { id: 8, name: "STRENGTH", roman: "VIII", type: "major", theme: "strength, courage, patience", colors: ["#ff8f00", "#fff8e1"], symbols: ["infinity", "lion", "flowers"], hero: "gentle woman in a white robe", pose: "a {hero} leaning calmly over a great lion, gently closing its jaws with both hands", upright: true, natural: "a {hero} standing calmly on all four legs beside a great red-gold lion, one front paw resting gently on the lion's muzzle as it closes its jaws", scene: "a {hero} wearing a garland of flowers beside a great red-gold lion, a glowing infinity symbol floating above the head, a tranquil green meadow under a soft sky" },
  { id: 9, name: "THE HERMIT", roman: "IX", type: "major", theme: "solitude, introspection, guidance", colors: ["#546e7a", "#eceff1"], symbols: ["lantern", "staff", "mountain"], hero: "grey-hooded hermit", pose: "a {hero} standing with the head bowed, one hand raising a glowing lantern and the other gripping a tall staff", upright: true, natural: "a {hero} standing on all four legs with the head bowed, a glowing lantern hanging from its mouth by the handle, a tall wooden staff leaning against its side", scene: "a {hero} alone on a snowy mountain peak at night, a six-pointed star glowing inside the lantern, a deep blue sky behind" },
  { id: 10, name: "WHEEL OF FORTUNE", roman: "X", type: "major", theme: "fate, cycles, turning point", colors: ["#6d4c41", "#efebe9"], symbols: ["wheel", "sphinx", "serpent"], hero: "blue sphinx", airborne: true, pose: "a {hero} perched on top of a great golden wheel, holding a sword upright", scene: "a great golden wheel rising in the sky inscribed with mystic letters, a {hero} with a sword resting on top, a serpent descending the left side, a jackal-headed figure rising on the right, and a winged angel, a winged eagle, a winged bull and a winged lion reading open books in the four corners among clouds" },
  { id: 11, name: "JUSTICE", roman: "XI", type: "major", theme: "justice, truth, law", colors: ["#c62828", "#ffebee"], symbols: ["scales", "sword", "crown"], hero: "crowned judge in red robes", pose: "a {hero} seated facing the viewer, an upright sword raised in the right hand and golden scales held level in the left", upright: true, natural: "a {hero} sitting upright on its haunches, facing the viewer with a steady gaze, a double-edged sword standing upright at its right side and golden scales hanging level at its left", scene: "a {hero} between two stone pillars, a pair of golden balance scales hanging level at its left side, a purple veil behind" },
  { id: 12, name: "THE HANGED MAN", roman: "XII", type: "major", theme: "sacrifice, waiting, new perspective", colors: ["#00695c", "#e0f2f1"], symbols: ["tree", "halo", "rope"], hero: "serene man", airborne: true, pose: "a {hero} hanging upside down by one ankle, the free leg bent behind into a figure four, hands behind the back, face calm", scene: "a {hero} hanging upside down suspended by one ankle from a living T-shaped wooden cross, the free leg crossed behind to form a four, hands clasped behind the back, a bright halo of light glowing around the head, a calm peaceful expression" },
  { id: 13, name: "DEATH", roman: "XIII", type: "major", theme: "transformation, endings, rebirth", colors: ["#212121", "#9e9e9e"], symbols: ["skeleton", "rose", "dawn"], hero: "skeleton in black armor", pose: "a {hero} sitting upright astride a white horse, holding a tall black banner emblazoned with a white rose", upright: true, natural: "a {hero} sitting on the back of a slow white horse, the pole of a tall black banner emblazoned with a white rose clamped in its jaws", scene: "a {hero} on a white horse moving slowly forward, a fallen king lying before the horse, a bishop standing in prayer, a maiden kneeling and turning her face away, and a small child offering flowers, a rising sun glowing between two distant towers on the horizon" },
  { id: 14, name: "TEMPERANCE", roman: "XIV", type: "major", theme: "balance, moderation, patience", colors: ["#1b5e20", "#f1f8e9"], symbols: ["angel wings", "water", "triangle"], hero: "angel in a white robe", pose: "a {hero} with great red wings standing with one foot in the water and one on land, pouring liquid from one golden cup into another held in both hands", upright: true, natural: "a {hero} with great red wings standing on all four legs with one front paw in the pool and the others on land, two golden cups set before it with a shimmering arc of water flowing from one into the other", scene: "a {hero} at the edge of a pool, a triangle within a square on the chest, yellow irises blooming nearby, a winding path leading to mountains crowned by a glowing crown of light" },
  { id: 15, name: "THE DEVIL", roman: "XV", type: "major", theme: "bondage, materialism, shadow", colors: ["#4a148c", "#f3e5f5"], symbols: ["chains", "torch", "pentagram"], hero: "bearded devil", pose: "a {hero} with bat wings and curved goat horns crouching on a black pedestal above two horned and tailed captives chained by the neck, one hand raised open and the other holding a torch pointed down", upright: true, natural: "a {hero} with bat wings and curved goat horns crouching on all four legs on the black pedestal above two horned and tailed captives chained by the neck, glaring down, a burning torch planted upside down in the stone beside it", scene: "a {hero} perched on a black half-cube, an inverted pentagram glowing on the brow, the two naked captives chained loosely to the cube below" },
  { id: 16, name: "THE TOWER", roman: "XVI", type: "major", theme: "sudden change, revelation, chaos", colors: ["#b71c1c", "#ffcdd2"], symbols: ["lightning", "crown", "flames"], hero: "falling figure", airborne: true, pose: "a {hero} and a second {hero} falling headfirst from a burning tower, arms flung out", scene: "a tall grey stone tower on a rocky peak struck by a jagged bolt of lightning, its golden crown blasted off, flames bursting from the windows, a {hero} and a second crowned {hero} plunging headfirst into the darkness, sparks like flames scattered across the night sky" },
  { id: 17, name: "THE STAR", roman: "XVII", type: "major", theme: "hope, inspiration, renewal", colors: ["#0277bd", "#e1f5fe"], symbols: ["stars", "water", "naked figure"], hero: "kneeling nude woman", pose: "a {hero} kneeling at the edge of a pool, pouring water from a jug held in each hand", upright: true, natural: "a {hero} crouching at the edge of the pool with one front paw in the water, two jugs tipped over beside it, one pouring water onto the land and one into the pool", scene: "a {hero} at the edge of a still pool on the grassy bank, one great radiant eight-pointed star and seven smaller stars shining above, an ibis bird perched in a tree" },
  { id: 18, name: "THE MOON", roman: "XVIII", type: "major", theme: "illusion, fear, subconscious", colors: ["#1a237e", "#e8eaf6"], symbols: ["moon", "wolf", "path"], hero: "dog", duo: { figures: ["dog", "wolf"], mods: ["tame", "wild"] }, pose: "a {hero} and a {hero} howling up at the moon from either side of a winding path", scene: "a great full moon with a serene closed-eyed face shedding golden dewdrops, a {hero} on the left and a {hero} on the right of the path, a red crayfish crawling out of a pool in the foreground, the path running between two tall grey towers toward distant mountains" },
  { id: 19, name: "THE SUN", roman: "XIX", type: "major", theme: "joy, success, vitality", colors: ["#f57f17", "#fff9c4"], symbols: ["sun face", "sunflowers", "child"], hero: "joyful naked child", pose: "a {hero} riding a white horse, the right arm stretched wide in joy and the left hand holding a large red banner", upright: true, natural: "a {hero} sitting joyfully on the back of a calm white horse, head thrown back in delight, the pole of a large red banner clamped in its jaws, the banner flying above", scene: "a {hero} wearing a wreath of flowers topped with a red feather on a calm white horse, beneath a great radiant sun with a gentle face and straight and wavy rays, a stone wall lined with tall sunflowers behind" },
  { id: 20, name: "JUDGEMENT", roman: "XX", type: "major", theme: "awakening, judgement, rebirth", colors: ["#880e4f", "#fce4ec"], symbols: ["angel", "trumpet", "rising"], hero: "rising figure", airborne: true, pose: "a {hero} and a second {hero} rising from open coffins with arms raised toward an angel above", upright: true, natural: "a {hero} and a second {hero} climbing up out of open coffins on all four legs, heads lifted high toward the angel", scene: "a great winged angel blowing a golden trumpet hung with a white-and-red cross banner from the clouds above, and below a {hero}, a second {hero} and a small child rising from open grey coffins floating on a calm sea, snowy mountains in the far distance" },
  { id: 21, name: "THE WORLD", roman: "XXI", type: "major", theme: "completion, integration, achievement", colors: ["#004d40", "#e0f2f1"], symbols: ["wreath", "dancer", "four elements"], hero: "dancing figure draped in a violet sash", airborne: true, pose: "a {hero} dancing in mid-air within a laurel wreath, one leg crossed behind the other, a short wand in each hand", upright: true, natural: "a {hero} leaping in mid-air within a laurel wreath, legs stretched out as if dancing, two short wands floating on either side of it", scene: "a {hero} floating within a great oval laurel wreath bound at top and bottom by red ribbons, a human head an eagle a bull and a lion appearing in the four corners among soft clouds" },
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
// full RWS composition with `{hero}` where the figure(s) appear. The Aces' protagonist is the hand from the cloud
// (default hero "hand"); 8 of Wands and 3 of Swords have no figure, carry no `{hero}`, and `hero` is unused there.
type MinorScene = { hero: string; objects?: string; pose?: string; upright?: true; natural?: string; scene: string; airborne?: true };
const MINOR_SCENES: Record<TarotSuit, Record<string, MinorScene>> = {
  major: {},
  wands: {
    ACE: { hero: "hand", airborne: true, pose: "a {hero} reaching out of a cloud on the right, grasping a stout sprouting wooden wand", scene: "a {hero} emerging from a cloud on the right, the wooden wand budding fresh green leaves and a few leaves falling, a castle on a distant hilltop above a winding river and rolling green hills" },
    TWO: { hero: "robed man", objects: "exactly two tall wooden wands, one beside it and one fixed to the wall by an iron ring", pose: "a {hero} standing on a castle battlement holding a small globe, gazing out to sea, {objects}", upright: true, natural: "a {hero} standing on all four legs on the battlement, gazing out over land and sea, a small globe resting between its front paws, {objects}", scene: "a {hero} on a castle battlement, land and sea stretching out below" },
    THREE: { hero: "cloaked merchant", objects: "exactly three tall wooden wands planted in the ground around it", pose: "a {hero} seen from behind standing on a cliff watching ships at sea, {objects}", upright: true, natural: "a {hero} seen from behind sitting on the cliff edge, gazing out at the ships at sea, {objects}", scene: "a {hero} seen from behind on a cliff, three ships sailing across a golden sea" },
    FOUR: { hero: "celebrating figure", objects: "a flowered garland held up by exactly four tall wooden wands", pose: "two {hero} figures raising bouquets high in welcome beneath {objects}", upright: true, natural: "two {hero} figures sitting side by side on their haunches beneath {objects}, heads lifted happily, each with a bouquet of flowers in its mouth", scene: "two {hero} figures in celebration, a castle and bright sky behind" },
    FIVE: { hero: "youth", objects: "exactly five tall wooden wands, one each,", pose: "five {hero} figures swinging {objects} at one another in a lively mock fight", upright: true, natural: "five {hero} figures tussling playfully on all four legs, {objects} clamped crosswise in their jaws and clashing", scene: "five {hero} figures on open ground under a clear sky" },
    SIX: { hero: "rider", objects: "exactly six tall wooden wands, one topped with a laurel wreath and five carried upright by a crowd of marchers", pose: "a {hero} riding a white horse in triumph among {objects}, holding the wreathed one high", upright: true, natural: "a {hero} sitting proudly on the back of a white horse in a victory procession among {objects}, the wreathed one clamped in its jaws", scene: "a {hero} crowned with a laurel wreath on a white horse in a victory procession" },
    SEVEN: { hero: "man", objects: "exactly seven wooden wands, one braced crosswise before it and six thrust up at it from below", pose: "a {hero} standing braced on a hilltop fending off attackers, {objects}", upright: true, natural: "a {hero} braced on all four legs on the hilltop, {objects}", scene: "a {hero} on a hilltop" },
    EIGHT: { hero: "figure", objects: "exactly eight flowering wooden wands flying swiftly in parallel through the open air", pose: "{objects}", scene: "a green river landscape below under a clear sky" },
    NINE: { hero: "wary wounded man", objects: "exactly nine wooden wands, one at its side and eight standing upright in a row behind like a fence", pose: "a {hero} with a bandaged head glancing sideways warily, {objects}", upright: true, natural: "a {hero} with a bandaged head standing warily on all four legs, glancing sideways, {objects}", scene: "a {hero} with a bandaged head, green hills behind" },
    TEN: { hero: "burdened man", objects: "a heavy bundle of exactly ten wooden wands", pose: "a {hero} bent forward, hugging {objects} in both arms while trudging toward a town", upright: true, natural: "a {hero} trudging bent low on all four legs toward a town, {objects} strapped across its back", scene: "a {hero} struggling toward a town in the near distance" },
    PAGE: { hero: "young page", pose: "a {hero} standing with both hands on a tall flowering staff, gazing up at its tip", upright: true, natural: "a {hero} sitting on its haunches beside a tall flowering staff planted in the sand, gazing up at its tip with curiosity", scene: "a {hero} in a desert with pyramids behind, beside a tall flowering staff" },
    KNIGHT: { hero: "armored knight in a yellow tunic patterned with salamanders", pose: "a {hero} riding a rearing horse, holding a flowering staff aloft", upright: true, natural: "a {hero} riding on the back of a rearing chestnut horse, a flowering staff clamped in its jaws", scene: "a {hero} on a rearing chestnut horse, desert and pyramids behind" },
    QUEEN: { hero: "queen", pose: "a {hero} seated on a throne, a flowering staff in one hand and a sunflower in the other", upright: true, natural: "a {hero} sitting upright on its haunches on the throne, a flowering staff leaning against its side and a large sunflower lying at its front paws", scene: "a {hero} on a stone throne carved with lions and sunflowers, a black cat sitting at the feet" },
    KING: { hero: "king", pose: "a {hero} seated on a throne, leaning slightly forward, gripping a flowering staff", upright: true, natural: "a {hero} sitting on its haunches on the throne, leaning slightly forward, a flowering staff leaning against the throne beside it", scene: "a {hero} on a throne carved with lions and salamanders, a small live salamander at the feet" },
  },
  cups: {
    ACE: { hero: "hand", airborne: true, pose: "a {hero} reaching out of a cloud on the right, holding up an overflowing golden chalice", scene: "a {hero} emerging from a cloud on the right, five streams of water spilling over the chalice, a white dove descending with a round wafer toward the cup, a pond dotted with water lilies below" },
    TWO: { hero: "figure", objects: "exactly two golden cups", pose: "a {hero} and a second {hero} facing each other, each holding out one of {objects} toward the other", upright: true, natural: "a {hero} and a second {hero} sitting face to face, gazing at each other, {objects} standing on the ground between them", scene: "a {hero} and a second {hero} facing each other, a winged lion's head above a caduceus of two entwined serpents, a green landscape and a small house behind" },
    THREE: { hero: "dancing woman", objects: "exactly three golden cups, one each,", pose: "three {hero} figures dancing in a circle, raising {objects} high in a toast", upright: true, natural: "three {hero} figures dancing in a circle on all four legs, heads lifted joyfully, {objects} standing on the grass before them", scene: "three {hero} figures in a circle on a grassy meadow, ripe fruit and a harvest of pumpkins at their feet" },
    FOUR: { hero: "youth", objects: "exactly four golden cups, three on the ground before it and a fourth offered out of a cloud", pose: "a {hero} sitting under a tree with arms folded, gazing down sullenly, {objects}", upright: true, natural: "a {hero} lying under a tree with its head turned away, gazing down sullenly, {objects}", scene: "a {hero} under a tree" },
    FIVE: { hero: "figure in a long black cloak", objects: "exactly five golden cups, three spilled on the ground before it and two still standing behind", pose: "a {hero} standing with the head bowed in grief, {objects}", scene: "a {hero} standing with the head bowed in grief, a bridge leading to a castle across a river" },
    SIX: { hero: "child", objects: "exactly six golden cups filled with white flowers, one passing between them and five arranged around", pose: "a young {hero} bending to a smaller young {hero}, {objects}", upright: true, natural: "a young {hero} bending down to a smaller young {hero}, {objects}", scene: "a young {hero} and a smaller young {hero} in a peaceful village courtyard" },
    SEVEN: { hero: "figure", objects: "exactly seven golden cups floating in the clouds, each with a different vision inside: a castle, jewels, a laurel wreath, a dragon, a glowing head, a coiled snake, and a shrouded glowing figure", pose: "a {hero} seen from behind, gazing up in wonder at {objects}", scene: "a {hero} seen from behind standing in wonder" },
    EIGHT: { hero: "traveler in a red cloak", objects: "exactly eight golden cups stacked behind it with a gap in the row", pose: "a {hero} seen from behind, walking away with a staff toward distant mountains, {objects}", upright: true, natural: "a {hero} seen from behind walking away on all four legs toward distant mountains, a staff clamped crosswise in its jaws, never looking back, {objects}", scene: "a {hero} seen from behind walking away toward distant mountains, an eclipsed moon in the night sky above" },
    NINE: { hero: "satisfied man", objects: "exactly nine golden cups arranged in an arc on a curved blue-draped table behind", pose: "a {hero} seated proudly with arms crossed and a broad smile, {objects}", upright: true, natural: "a {hero} sitting proudly on its haunches with its chest puffed out and a broad satisfied smile, {objects}", scene: "a {hero} seated contentedly" },
    TEN: { hero: "figure", objects: "a great rainbow set with exactly ten golden cups", pose: "a {hero} and a second {hero} standing side by side, arms raised in joy toward {objects}", upright: true, natural: "a {hero} and a second {hero} standing side by side on all four legs, heads lifted in joy toward {objects}", scene: "a {hero} and a second {hero} on a green lawn, two small {hero} children dancing on the grass nearby, a cottage and green hills behind" },
    PAGE: { hero: "young page", pose: "a {hero} standing by the sea, holding up a golden cup and looking at a fish rising from it", upright: true, natural: "a {hero} sitting on its haunches by the sea, gazing curiously at a small fish peeking out of a golden cup standing before it", scene: "a {hero} by a wavy sea, a small fish curiously rising from a golden cup" },
    KNIGHT: { hero: "knight", pose: "a {hero} riding a white horse slowly, holding a golden cup out in front", upright: true, natural: "a {hero} sitting on the back of a white horse walking slowly and gracefully, a golden cup carried by its stem in its jaws", scene: "a {hero} on a white horse moving slowly and gracefully, a winged helmet on the head, a river winding through the landscape" },
    QUEEN: { hero: "queen", pose: "a {hero} seated on a throne, holding a closed golden chalice in both hands and gazing at it", upright: true, natural: "a {hero} sitting on its haunches on the throne at the water's edge, gazing tenderly at a closed ornate golden chalice standing between its front paws", scene: "a {hero} on an ornate throne carved with cherubs at the water's edge" },
    KING: { hero: "king", pose: "a {hero} seated on a throne above the sea, a golden cup in one hand and a short scepter in the other", upright: true, natural: "a {hero} sitting upright on its haunches on the throne above the choppy sea, calm and steady, a golden cup standing before it and a short scepter lying at its front paws", scene: "a {hero} on a stone throne set on a broad stone block rising from a choppy sea, a fish amulet at the neck, a ship and a leaping fish in the waves behind" },
  },
  swords: {
    ACE: { hero: "hand", airborne: true, pose: "a {hero} reaching out of a cloud on the left, gripping a single upright double-edged sword", scene: "a {hero} emerging from a cloud on the left, the sword's tip crowned with a golden crown wreathed in laurel and palm, jagged grey mountains below" },
    TWO: { hero: "woman", objects: "exactly two long swords crossed upright before the chest", pose: "a {hero} seated blindfolded, arms crossed over the chest, holding {objects}", upright: true, natural: "a blindfolded {hero} sitting perfectly still on its haunches on the stone bench, facing the viewer, {objects}", scene: "a blindfolded {hero} on a stone bench by the sea, a crescent moon in the evening sky behind" },
    THREE: { hero: "figure", objects: "a large red human heart pierced cleanly through by exactly three crossed swords", pose: "{objects}", scene: "heavy grey rain falling from storm clouds behind" },
    FOUR: { hero: "armored knight", objects: "exactly four swords, three hanging on the wall above and one carved beneath", pose: "a {hero} lying flat on a stone tomb like a carved effigy, hands pressed together in prayer, {objects}", scene: "a {hero} lying still in repose on top of a stone tomb, a stained-glass window glowing nearby" },
    FIVE: { hero: "smirking figure", objects: "exactly five swords, three gathered up beside the smug one and two lying on the ground", pose: "a smug {hero} watching two defeated {hero} figures walk away, {objects}", upright: true, natural: "a smug {hero} watching two defeated {hero} figures slink away, {objects}", scene: "a {hero} and two defeated {hero} figures walking away dejected under a ragged stormy sky" },
    SIX: { hero: "ferryman", objects: "exactly six swords standing upright in the bow", pose: "a {hero} standing in a small boat, pushing it forward with a long pole, {objects}", upright: true, natural: "a {hero} standing on all four legs at the stern of a small wooden boat, a long boat pole clamped in its jaws pushing against the water, {objects}", scene: "a small wooden boat crossing calm water with a {hero} at the stern, ferrying a cloaked {hero} and a small {hero} child seated low, a calm far shore ahead" },
    SEVEN: { hero: "stealthy man", objects: "exactly seven swords, five carried off and two left standing in the ground", pose: "a {hero} sneaking away on tiptoe with a sly grin, glancing back, {objects}", upright: true, natural: "a {hero} creeping away on tiptoe on all four legs, glancing back slyly, {objects}", scene: "a {hero} creeping away, a military camp with tents behind" },
    EIGHT: { hero: "woman in a long red dress", objects: "exactly eight swords planted upright in a ring around it with one side left open", pose: "a {hero} standing still, blindfolded and bound around the body with white cloth bands, {objects}", scene: "a {hero} standing in a grey marsh, a castle on a hill above" },
    NINE: { hero: "figure", objects: "exactly nine horizontal swords mounted on the black wall behind", pose: "a {hero} sitting up in bed, the face buried in both hands, {objects}", upright: true, natural: "a {hero} sitting up in bed in the dark with its face buried in its front paws, {objects}", scene: "a {hero} sitting up in bed in the dark in distress" },
    TEN: { hero: "fallen figure", objects: "exactly ten swords driven into its back", pose: "a {hero} lying face down and still on the ground, {objects}", scene: "a {hero} lying on the ground, a black sky lifting to a golden dawn over calm water on the horizon" },
    PAGE: { hero: "alert youth", pose: "a {hero} striding along a hilltop, holding a sword upright in both hands, glancing back", upright: true, natural: "a {hero} striding along the hilltop on all four legs, a sword clamped crosswise in its jaws, glancing back warily", scene: "a {hero} on a windswept hilltop glancing back warily, ragged clouds and bending trees, birds wheeling in the turbulent sky" },
    KNIGHT: { hero: "charging knight", pose: "a {hero} charging forward on a galloping horse, sword raised high to strike", upright: true, natural: "a {hero} crouched forward on the back of a white horse charging at a furious gallop, a sword clamped crosswise in its jaws", scene: "a {hero} on a white horse charging at a furious gallop, storm-bent trees and racing clouds behind" },
    QUEEN: { hero: "queen", pose: "a {hero} seated on a throne, one sword held upright in the right hand, the left hand extended open", upright: true, natural: "a {hero} sitting upright on its haunches on the throne with a stern composed face, one front paw extended forward, a single upright sword standing beside it", scene: "a {hero} on a stone throne carved with a butterfly and a cherub, billowing clouds and one bird above" },
    KING: { hero: "king in a blue robe", pose: "a {hero} seated facing the viewer, holding a single upright sword", upright: true, natural: "a {hero} sitting frontally on its haunches on the throne with a serious commanding gaze, a single upright sword standing beside it", scene: "a {hero} seated frontally on a stone throne carved with butterflies and angels, a blue sky with a few clouds" },
  },
  pentacles: {
    ACE: { hero: "hand", airborne: true, pose: "a {hero} reaching out of a cloud on the left, holding up a single large golden coin engraved with a five-pointed pentagram", scene: "a {hero} emerging from a cloud on the left, below it a lush garden with white lilies and an arched trellis of roses opening onto a path toward distant mountains" },
    TWO: { hero: "young man", objects: "exactly two golden coins engraved with pentagrams, linked by a green ribbon looped into an infinity sign", pose: "a {hero} dancing on one foot while juggling {objects}", upright: true, natural: "a {hero} balancing playfully on three legs on the sandy shore, one front paw batting {objects}", scene: "a {hero} on the sandy shore, two ships rising and dipping on big waves in the sea behind" },
    THREE: { hero: "sculptor", objects: "exactly three golden coins engraved with pentagrams set into the carved archway above", pose: "a {hero} standing on a bench carving a stone arch, turning to listen to a {hero} monk and a {hero} architect holding plans, {objects}", upright: true, natural: "a {hero} perched on the bench beside the carved stone arch, turning to listen to a {hero} monk and a {hero} architect, the plans spread on the ground before them, {objects}", scene: "a {hero} on a bench in a cathedral beside a half-carved stone archway, a {hero} monk and a {hero} architect with plans" },
    FOUR: { hero: "miser", objects: "exactly four golden coins engraved with pentagrams, one hugged to the chest, one balanced on the head and one beneath each foot", pose: "a {hero} seated stiffly, arms wrapped tight, {objects}", upright: true, natural: "a {hero} sitting stiffly on its haunches, front paws wrapped tight, {objects}", scene: "a {hero} on a stool, a grey town skyline behind" },
    FIVE: { hero: "ragged beggar", objects: "a glowing stained-glass church window set with exactly five golden coins engraved with pentagrams", pose: "a {hero} and a second {hero} trudging through snow, one leaning on crutches, passing {objects}", upright: true, natural: "a {hero} and a second {hero} trudging through falling snow on all four legs, one limping on a bandaged leg, passing {objects}", scene: "a {hero} and a second {hero} in falling snow" },
    SIX: { hero: "well-dressed merchant", objects: "exactly six golden coins engraved with pentagrams floating in the air around them", pose: "a {hero} standing, holding a balance scale in the left hand and dropping alms with the right into the outstretched hand of one of two kneeling {hero} beggars, {objects}", upright: true, natural: "a {hero} standing beside a balance scale above one of two kneeling {hero} beggars looking up hopefully, {objects}", scene: "a {hero} with a balance scale above two kneeling {hero} beggars" },
    SEVEN: { hero: "young farmer", objects: "exactly seven golden coins engraved with pentagrams, six growing on a leafy green bush and one lying on the ground", pose: "a {hero} leaning on a hoe handle with both hands, gazing thoughtfully at {objects}", upright: true, natural: "a {hero} sitting on its haunches beside a hoe lying on the ground, gazing thoughtfully at {objects}", scene: "a {hero} in a cultivated field" },
    EIGHT: { hero: "craftsman", objects: "exactly eight golden coins engraved with pentagrams, six mounted on a post above, one being carved and one at the foot of the bench", pose: "a {hero} seated at a bench, hammering a chisel, {objects}", upright: true, natural: "a {hero} lying at the workbench gazing intently, a hammer and chisel beside it, {objects}", scene: "a {hero} at a workbench, a town in the far distance" },
    NINE: { hero: "elegant woman", objects: "exactly nine golden coins engraved with pentagrams among the vines", pose: "a {hero} standing in a vineyard, a falcon wearing a small leather hood perched on one raised gloved hand, {objects}", upright: true, natural: "a {hero} standing elegantly on all four legs in the vineyard, a falcon wearing a small leather hood perched on its back, {objects}", scene: "a {hero} in a lush vineyard heavy with grapes, a manor house behind" },
    TEN: { hero: "white-bearded elder", objects: "exactly ten golden coins engraved with pentagrams arranged across the scene", pose: "a {hero} seated under an archway, resting one hand on the head of a dog, {objects}", upright: true, natural: "a {hero} lying under the archway, one front paw resting on the head of a dog, {objects}", scene: "a {hero} under an archway with two dogs, a {hero} couple and a small {hero} child nearby, a walled town beyond" },
    PAGE: { hero: "young page", pose: "a {hero} standing, holding up a golden pentacle in both hands and gazing at it", upright: true, natural: "a {hero} sitting on its haunches in the flowering field, gazing intently at a golden pentacle resting between its front paws", scene: "a {hero} in a flowering green field, a freshly plowed field and trees behind" },
    KNIGHT: { hero: "knight", pose: "a {hero} sitting still on a heavy black horse, holding a golden pentacle out on an open palm", upright: true, natural: "a {hero} sitting still on the back of a heavy black plow-horse at rest, gazing over the fields, a golden pentacle resting on the saddle before it", scene: "a {hero} on a heavy black plow-horse at rest, gazing over freshly plowed fields" },
    QUEEN: { hero: "queen", pose: "a {hero} seated on a throne, cradling a golden pentacle in the lap with both hands", upright: true, natural: "a {hero} curled on the throne with a golden pentacle cradled between its front paws", scene: "a {hero} on a throne carved with goats fruit and cherubs in a blooming garden, a rabbit sitting in the grass in the foreground, roses arching overhead" },
    KING: { hero: "king in a robe embroidered with grapevines", pose: "a {hero} seated on a throne, one hand resting on a golden pentacle and the other holding a scepter", upright: true, natural: "a {hero} sitting on its haunches on the throne, one front paw resting on a golden pentacle, a scepter lying beside it", scene: "a {hero} on a throne draped with grapevines and carved with bulls, a castle behind" },
  },
};

// Standard upright meaning per minor card (Waite, Pictorial Key to the Tarot 1911, and the common modern reading).
const MINOR_THEMES: Record<Exclude<TarotSuit, "major">, Record<string, string>> = {
  wands: {
    ACE: "inspiration, new venture, creative spark", TWO: "planning, future vision, decisions", THREE: "expansion, foresight, progress",
    FOUR: "celebration, harmony, homecoming", FIVE: "competition, conflict, rivalry", SIX: "victory, recognition, public success",
    SEVEN: "defense, perseverance, standing your ground", EIGHT: "swift action, movement, news", NINE: "resilience, persistence, guardedness",
    TEN: "burden, responsibility, overload", PAGE: "enthusiasm, exploration, discovery", KNIGHT: "energy, adventure, impulsive action",
    QUEEN: "confidence, warmth, determination", KING: "leadership, vision, boldness",
  },
  cups: {
    ACE: "new love, emotional opening, compassion", TWO: "partnership, mutual attraction, union", THREE: "friendship, celebration, community",
    FOUR: "apathy, contemplation, missed opportunity", FIVE: "grief, regret, loss", SIX: "nostalgia, childhood memories, innocence",
    SEVEN: "illusion, fantasy, choices", EIGHT: "walking away, seeking deeper meaning", NINE: "contentment, satisfaction, wishes fulfilled",
    TEN: "family happiness, harmony, emotional fulfillment", PAGE: "creative curiosity, intuitive message", KNIGHT: "romance, charm, following the heart",
    QUEEN: "compassion, emotional depth, intuition", KING: "emotional balance, diplomacy, calm control",
  },
  swords: {
    ACE: "clarity, breakthrough, truth", TWO: "indecision, stalemate, blocked emotions", THREE: "heartbreak, sorrow, painful truth",
    FOUR: "rest, recovery, contemplation", FIVE: "conflict, hollow victory, defeat", SIX: "transition, moving on, recovery",
    SEVEN: "deception, strategy, stealth", EIGHT: "restriction, self-imprisonment, feeling trapped", NINE: "anxiety, worry, nightmares",
    TEN: "painful ending, rock bottom, release", PAGE: "curiosity, vigilance, new ideas", KNIGHT: "ambition, haste, decisive action",
    QUEEN: "clear judgement, independence, honesty", KING: "intellectual authority, truth, fairness",
  },
  pentacles: {
    ACE: "new opportunity, prosperity, manifestation", TWO: "balance, adaptability, juggling priorities", THREE: "teamwork, craftsmanship, collaboration",
    FOUR: "security, control, holding on", FIVE: "hardship, poverty, isolation", SIX: "generosity, giving and receiving, charity",
    SEVEN: "patience, long-term investment, assessment", EIGHT: "diligence, skill, apprenticeship", NINE: "independence, luxury, self-sufficiency",
    TEN: "wealth, legacy, family", PAGE: "study, ambition, practical opportunity", KNIGHT: "reliability, hard work, steady progress",
    QUEEN: "nurturing, practicality, abundance", KING: "abundance, security, material mastery",
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
      theme: MINOR_THEMES[suit.key as Exclude<TarotSuit, "major">][rank] ?? suit.theme,
      colors: [suit.color, suit.bg],
      symbols: [suit.element, suit.name.toLowerCase()],
      hero: s.hero,
      scene: s.scene,
      ...(s.objects ? { objects: s.objects } : {}),
      ...(s.pose ? { pose: s.pose } : {}),
      ...(s.upright ? { upright: true as const } : {}),
      ...(s.natural ? { natural: s.natural } : {}),
      ...(s.airborne ? { airborne: true as const } : {}),
    });
  });
}

export const TAROT_CARDS: TarotCard[] = [...MAJOR, ...MINOR];

/** The card used for the single style-preview generation. */
export const PREVIEW_CARD: TarotCard = MAJOR[0]; // THE FOOL

/**
 * Quick-pick chips + style resolution, derived from STYLE_CATALOG (auto-generated from the
 * 生圖風格 PROMPT docs). One button per style (103 total). `zh` is the display label
 * shown in the textarea; its matching English `prompt` is what reaches the image model.
 */
export const STYLE_PRESETS: { zh: string; group: string }[] = STYLE_CATALOG.map((s) => ({ zh: s.zh, group: s.group }));

const STYLE_BY_LABEL = new Map(STYLE_CATALOG.map((s) => [s.zh, s.prompt] as const));

// A painter's NAME is the single strongest style signal an image model has — it carries the whole
// learned look in two tokens, far more than any technique description. The catalog prompts describe
// only technique (brushwork / palette / composition), so for the painter groups we prepend
// "In the style of <name>." as the lead. Genre / medium groups (媒材 / 風格) and tradition entries
// with no individual name (e.g. 唐卡 / 細密畫 — already named inside their prompt) get no prefix.
const PAINTER_GROUPS = new Set(["西方畫家", "亞洲畫家"]);
/** Latin name inside a zh label: strip the leading CJK run, take the text before any "｜" marker.
 *  "梵谷 Van Gogh" -> "Van Gogh"; "歌川廣重 Hiroshige｜…" -> "Hiroshige"; "唐卡｜…" -> "" (skipped). */
function artistName(zh: string): string {
  const afterCjk = zh.replace(/^[　-〿一-鿿豈-﫿·•\s]+/, "");
  const head = afterCjk.split("｜")[0].trim();
  if (/[A-Za-z]/.test(head)) return head;
  // Some labels put the Latin name AFTER the "｜" (e.g. "韓國民畫｜Minhwa …"): take its leading Latin run.
  const tail = afterCjk.split("｜").slice(1).join("｜").match(/[A-Za-z][A-Za-z .\-]*/);
  return tail ? tail[0].trim() : "";
}
const STYLE_LEAD_BY_LABEL = new Map(
  STYLE_CATALOG
    .filter((s) => PAINTER_GROUPS.has(s.group))
    .map((s) => [s.zh, artistName(s.zh)] as const)
    .filter((pair) => pair[1].length > 0),
);

/**
 * Resolve the style textarea (comma-separated zh labels) into the English actually sent to the
 * image model. Each zh label maps to its catalog English prompt (STYLE_CATALOG / tarotStyles.ts);
 * painter-group labels are led by "In the style of <name>." — the name is the primary style anchor
 * and the catalog text reinforces the technique. An unrecognised free-typed token passes through
 * unchanged. zh labels never contain commas, so splitting on comma cleanly recovers the labels.
 */
export function resolveStylePrompt(raw: string): string {
  const tokens = raw.split(",").map((t) => t.trim()).filter(Boolean);
  if (!tokens.length) return "";
  return tokens
    .map((t) => {
      const body = STYLE_BY_LABEL.get(t) ?? t;
      const name = STYLE_LEAD_BY_LABEL.get(t);
      return name ? `In the style of ${name}. ${body}` : body;
    })
    .join(". ");
}

// FLUX schnell paints verbs like "leaping" / "stepping toward the edge" as figures hanging in mid-air. Cards with a
// figure get this sentence unless `airborne`. Phrased positively on purpose: FLUX draws what a negation names.
// Figure-less cards (3 of Swords, 8 of Wands) skip it so it cannot add people to them; the Aces are `airborne`.
export const GROUNDING = "Every figure and animal stands, sits, kneels or lies on solid ground, feet touching it.";

// Default style used when the user gives none — keeps un-styled output looking like a deck.
const DEFAULT_STYLE = "ornate colored-pencil fantasy illustration, Rider-Waite inspired, warm antique palette";

export interface CardPromptInput {
  /** User style text as zh labels (resolved via resolveStylePrompt). Optional → DEFAULT_STYLE. */
  style?: string;
  /**
   * Pre-resolved English style, used VERBATIM as the lead (still length-capped) and bypassing
   * resolveStylePrompt. Lets the UI send a user-edited English prompt exactly as typed. When set
   * and non-empty it wins over `style`.
   */
  styleResolved?: string;
  /**
   * Subject / character override — WHO appears as the central figure(s). A noun phrase such as
   * "a fluffy orange cat", "a cartoon robot", "a smiling girl". Empty → the card's RWS default
   * hero. A leading article is stripped so it slots cleanly into "a {hero}" / "a second {hero}".
   * NOTE: when the user uploads a reference photo instead, leave this empty — the image model
   * maps the photo onto the figure on its own (the proven cat-deck path); no text needed here.
   */
  subject?: string;
  /**
   * 「主角類型」 buttons, never inferred: the translate step only runs for non-Latin text, and guessing from words
   * ("a teddy bear", "a robot") misfires. "animal-upright" stands the hero up and uses its front paws as hands;
   * "animal-natural" keeps it on four legs with the card's objects placed around it. Only takes effect together
   * with a non-empty subject on an `upright` card. Absent = "person".
   */
  heroKind?: HeroKind;
  /** 「戀人組合」 buttons for a `couple` card (THE LOVERS). Absent = "man-woman" (RWS). */
  couple?: Couple;
  /** From lib/tarot/model-specs.ts `promptOrder`. "content-first" puts the scene before the long style detail for
   *  models that cut (FLUX schnell: 256 T5 tokens, silent) or weaken (Ideogram: ~150 words) late words; the painter's
   *  name stays in the first sentence. Absent = "style-second". */
  order?: "content-first" | "style-second";
}

export type Couple = "man-woman" | "man-man" | "woman-woman";

/** A `couple` card's two figures: [A, B]. Default hero "nude figure" becomes "nude man" / "nude woman"; a user subject
 *  gets "male …" / "female …". */
export function coupleHeroes(base: string, isDefault: boolean, couple: Couple = "man-woman"): [string, string] {
  const g = (w: "man" | "woman") => (isDefault ? base.replace(/\bfigure\b/, w) : `${w === "man" ? "male" : "female"} ${base}`);
  const [a, b] = couple === "man-man" ? ["man", "man"] as const : couple === "woman-woman" ? ["woman", "woman"] as const : ["woman", "man"] as const;
  return [g(a), g(b)];
}

export type HeroKind = "person" | "animal-upright" | "animal-natural";

// With an animal subject on an `upright` card. One-figure cards get the singular: "Each {hero}" made FLUX add
// extra cats there (DEATH). Cards whose pose names several figures get the plural so every one is covered.
// Every acting figure in a pose is written with {hero}, which is what isGroupPose counts.
export const UPRIGHT_SENTENCE =
  "The {hero} stands or sits upright like a person, using its front paws as hands.";
export const UPRIGHT_SENTENCE_GROUP =
  "Every {hero} figure stands or sits upright like a person, using its front paws as hands.";
// 「動物・自然」: with no hand word anywhere FLUX schnell still stood a backpacked cat up like a hiker (3 of 4, seeds
// 7/3038, 2026-10-22); naming it an ordinary four-legged animal right after the subject kept all 4 on four paws.
export const NATURAL_BODY = "an ordinary real four-legged animal";
export const NATURAL_BODY_GROUP = "ordinary real four-legged animals";
export function isGroupPose(pose: string): boolean {
  return pose.split("{hero}").length > 2 || /\b(?:two|three|four|five) \{hero\}/.test(pose);
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
 *   • order: [hero + pose] → [full style lead] → [scene] → [grounding] → [short style recap].
 *     FLUX weights early tokens most and schnell cuts the prompt at its encoder limit; with the style first
 *     a swapped hero (a blue cat) kept the style but dropped the card's action, so the pose leads.
 * The frame + Roman numeral + card name are added afterwards by our canvas (renderPrintCard.ts).
 */
export function buildCardPrompt(card: TarotCard, input: CardPromptInput = {}): string {
  // Subject: strip a leading article, fall back to the card's hero when empty.
  const subject = normalizeSubject((input.subject ?? "").trim());
  const hero = subject || card.hero;
  // A `couple` / `duo` card fills its first {hero} with figure A and the next with figure B (and so on, alternating).
  const pair: [string, string] | null = card.couple
    ? coupleHeroes(hero, !subject, input.couple)
    : card.duo
      ? (subject ? [`${card.duo.mods[0]} ${subject}`, `${card.duo.mods[1]} ${subject}`] : card.duo.figures)
      : null;
  // "a nude man and a second nude woman" reads as two women (FLUX drew two, 2026-10-22): "second" only stays when
  // both figures are the same kind.
  const fill = (t: string) => pair
    ? t.split("{hero}").reduce((acc, part, i) => {
      const before = pair[0] !== pair[1] && i % 2 === 1 ? part.replace(/\bsecond $/, "") : part;
      return acc + (i === 0 ? "" : pair[(i - 1) % 2]) + before;
    }, "")
    : t.split("{hero}").join(hero);
  const natural = heroKindFor(card, subject, input) === "animal-natural" && card.natural ? card.natural : null;
  // "two blue cat figures" reads as cat-headed people: a natural-mode group is "animals" (Four of Wands danced upright).
  const asAnimals = (t: string) => (natural ? t.replace(/\{hero\} figures/g, "{hero} animals") : t);
  const scene = fill(asAnimals(card.scene));
  const group = isGroupPose(card.pose ?? "");
  const kind = heroKindFor(card, subject, input);
  const naturalGroup = natural !== null && isGroupPose(natural);
  const animal = kind === "animal-upright" ? ` ${fill(group ? UPRIGHT_SENTENCE_GROUP : UPRIGHT_SENTENCE)}` : "";
  // 「動物・自然」 REPLACES the pose with the card's own four-legged action (TarotCard.natural).
  // A sentence after the style for a group came too late: two cats still danced upright holding bouquets.
  const action = natural
    ? (naturalGroup ? `${NATURAL_BODY_GROUP}, ${asAnimals(natural)}` : natural.replace("{hero}", `{hero}, ${NATURAL_BODY},`))
    : card.pose;
  const pose = action ? capitalize(fill(action.replace("{objects}", card.objects ?? ""))) : "";

  // Style: a user-edited English override (styleResolved) wins and is used verbatim; otherwise
  // resolve the zh chip labels → their catalog English prompt (unknown free text passes through).
  const overrideEn = (input.styleResolved ?? "").trim();
  let lead = (overrideEn || resolveStylePrompt((input.style ?? "").trim())) || DEFAULT_STYLE;

  // Cap the style so the tarot SCENE always fits inside the model's prompt window. Catalog prompts
  // are long (up to ~1500 chars); stacking two (e.g. painter + medium) overflows FLUX's encoder,
  // which then drops the scene entirely → "no tarot card". Trimming the style at a clean comma/period
  // boundary guarantees the scene reaches the model. (The full catalog text is untouched; gpt-image,
  // with its larger window, still benefits from a long lead within the cap.)
  const STYLE_CAP = 1200;
  if (lead.length > STYLE_CAP) {
    const cut = lead.slice(0, STYLE_CAP);
    const b = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(", "));
    lead = b > 300 ? cut.slice(0, b) : cut;
  }

  // Catalog prompts end in "." already; strip it so the join never yields "..".
  lead = lead.replace(/[.\s]+$/, "");

  // The pose sentence carries the style's short anchor ("in the style of Van Gogh") so moving the lead behind it
  // does not weaken the style: flux-dev drifted toward flat cartoon when the first ~45 words named no style.
  const anchor = styleRecap(lead);
  const grounding = card.scene.includes("{hero}") && !card.airborne ? ` ${GROUNDING}` : "";
  const finish = "one cohesive consistent art style across a single vertical full-bleed scene, rich symbolic detail.";
  if (input.order === "content-first") {
    // Anchor + first technique phrases open the prompt, the rest follows the scene in the order the look needs most,
    // each said once and with no closing filler. Measured with the T5 v1.1 tokenizer: the old order was 306–356
    // tokens and schnell (255) cut the swirls and the palette, so its "Van Gogh" had smooth fur (2026-10-22).
    const { brief, rest } = splitStyleDetail(lead, anchor);
    const style = `${anchor}${brief ? `: ${brief}` : ""}`;
    const open = pose ? `${pose}, ${lowerFirst(style)}.${animal} ` : `${style}. `;
    return `${open}${scene}.${grounding}${rest ? ` ${rest}.` : ""}`;
  }
  const head = pose ? `${pose}, ${lowerFirst(anchor)}.${animal} ` : "";
  return `${head}${lead}. ${scene}.${grounding} ${anchor}, ${finish}`;
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

// Content-first only: the lead minus its anchor, split into the first technique phrases (up to ~100 chars, cut at a
// comma) and the remainder. Every catalog prompt (tarotStyles.ts) is five sentences: technique, composition / light,
// forms, palette, mood. The remainder is ordered technique, palette, forms, composition, mood so a cut drops
// composition (the card fixes it anyway) and mood first; each sentence is ranked by its catalog position, so two
// picked presets interleave instead of the second one's technique and palette coming last. Anchors ("In the style
// of X") and free-typed text rank with technique; a sentence the 1200-char cap cut short ranks with the one before.
const STYLE_RANK = [0, 3, 2, 1, 4]; // catalog sentence index -> output rank
const CATALOG_SENTENCE_RANK = new Map<string, number>(
  STYLE_CATALOG.flatMap((c) => c.prompt.replace(/[.\s]+$/, "").split(". ").map((t, i) => [t, STYLE_RANK[i] ?? 4] as [string, number])),
);

function splitStyleDetail(lead: string, anchor: string): { brief: string; rest: string } {
  const detail = lead.slice(anchor.length).replace(/^[.,:;\s]+/, "").replace(/[.\s]+$/, "");
  if (!detail) return { brief: "", rest: "" };
  const sentences = detail.split(". ");
  const first = sentences[0];
  let cut = first.length <= 100 ? first.length : first.slice(0, 100).lastIndexOf(", ");
  if (cut < 20) cut = first.slice(0, 100).lastIndexOf(" ");
  if (cut < 20) return { brief: "", rest: detail };
  let prev = 0;
  const ranked = sentences.slice(1).map((t, i) => {
    const r = /^In the style of /.test(t) ? 0 : CATALOG_SENTENCE_RANK.get(t) ?? prev;
    prev = r;
    return { t, r, i };
  });
  ranked.sort((a, b) => a.r - b.r || a.i - b.i);
  const firstRest = first.slice(cut).replace(/^[.,:;\s]+/, "").trim();
  const rest = [firstRest, ...ranked.map((x) => x.t)].filter(Boolean).join(". ");
  return { brief: lowerFirst(first.slice(0, cut).trim()), rest: capitalize(rest) };
}

function heroKindFor(card: TarotCard, subject: string, input: CardPromptInput): HeroKind | undefined {
  return subject && card.upright ? input.heroKind : undefined;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// The lead's first sentence ("In the style of Van Gogh") re-anchors the style after the scene; a long technique
// sentence is cut at a comma so the recap stays short.
function styleRecap(lead: string): string {
  const first = lead.split(". ")[0];
  if (first.length <= 90) return first;
  const cut = first.slice(0, 90);
  // No comma → cut at a space: splitStyleDetail slices the lead at this length, so a mid-word cut splits a word.
  const b = cut.lastIndexOf(", ");
  if (b > 20) return cut.slice(0, b);
  const s = cut.lastIndexOf(" ");
  return s > 20 ? cut.slice(0, s) : cut;
}
