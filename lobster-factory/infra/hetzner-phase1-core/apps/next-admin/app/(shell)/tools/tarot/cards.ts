// 78-card tarot dataset for the print-file generator.
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
   * Cards whose focus is non-human (Aces = a hand from a cloud, Wheel, Moon, 3 of Swords, 8 of
   * Wands) contain no `{hero}` token and are simply unaffected by subject replacement.
   */
  scene: string;
  /**
   * Default protagonist when the user supplies no subject — a bare noun core WITHOUT a leading
   * article (the scene template supplies "a"/"the"/"two"). RWS-faithful human identity.
   */
  hero: string;
  /**
   * The card's core RWS action in one short sentence written with `{hero}`. buildCardPrompt puts it FIRST, before
   * the style lead: FLUX weights early tokens most and schnell truncates long prompts, so the action must not sit
   * behind a 1200-char style. Present on every card whose scene has `{hero}`.
   */
  pose?: string;
  /** The action needs held props or hand gestures. With a non-human subject buildCardPrompt then stands the hero
   *  up like a person using its front paws as hands; otherwise a cat or dog is drawn on all fours holding nothing. */
  upright?: true;
  /** The scene puts a figure off the ground on purpose (falling, rising, hanging, floating); buildCardPrompt then
   *  skips the grounding sentence. Floating OBJECTS (cups, coins, symbols) do not need this flag. */
  airborne?: true;
}
// An airborne card loses the grounding sentence for ALL its figures, so its scene text must itself put any
// standing figure on the ground (THE LOVERS: the pair on the grass, the angel in the clouds).

const MAJOR: TarotCard[] = [
  { id: 0, name: "THE FOOL", roman: "0", type: "major", theme: "new beginnings, adventure, innocence", colors: ["#f0c040", "#fff8dc"], symbols: ["sun", "mountains", "flower"], hero: "carefree young traveler in bright ragged clothes", pose: "a {hero} striding across the flat cliff top toward its edge, both feet planted on the rock, body leaning slightly forward, head tilted up smiling at the sky", upright: true, scene: "a {hero} walking on the flat top of a high cliff to its very edge with both feet on the rock while gazing up at the sky, the {hero} holding a white rose in one hand and a knapsack tied to a slender staff resting on the {hero}'s own shoulder; exactly one small white dog running free on its own four paws, leaping playfully at the {hero}'s heels on the cliff top; a bright golden morning sky and snowy mountains far below" },
  { id: 1, name: "THE MAGICIAN", roman: "I", type: "major", theme: "willpower, skill, manifestation", colors: ["#c0392b", "#fff"], symbols: ["infinity", "wand", "pentagram"], hero: "robed magician", pose: "a {hero} standing tall, the right hand raising a wand high overhead and the left hand pointing one finger straight down at the ground", upright: true, scene: "a {hero} standing behind a low altar, one arm raised holding a wand toward the sky and the other hand pointing down to the earth, a glowing infinity symbol floating above the head, a serpent belt at the waist, a cup a sword a pentacle and a wand laid on the altar, red roses and white lilies blooming around" },
  { id: 2, name: "THE HIGH PRIESTESS", roman: "II", type: "major", theme: "intuition, mystery, inner wisdom", colors: ["#1a1a6e", "#c8b8f8"], symbols: ["crescent moon", "pillars", "veil"], hero: "serene priestess", pose: "a {hero} seated perfectly still and upright between two pillars, facing straight ahead, a half-hidden scroll held in the lap", upright: true, scene: "a {hero} seated calmly between one black pillar and one white pillar, a horned crown bearing a full moon on the brow, a crescent moon resting at the feet, a tapestry veil patterned with pomegranates and palms behind, a partly hidden scroll in the lap" },
  { id: 3, name: "THE EMPRESS", roman: "III", type: "major", theme: "abundance, fertility, nature", colors: ["#2d6a4f", "#b7e4c7"], symbols: ["wheat", "venus", "crown"], hero: "crowned empress", pose: "a {hero} reclining at ease on red cushions in a wheat field, crowned with stars, gazing out serenely", scene: "a {hero} reclining on lush red cushions in a golden field of ripe wheat, a crown of twelve stars on the head, a heart-shaped shield bearing the symbol of Venus resting beside, a waterfall and deep green forest behind" },
  { id: 4, name: "THE EMPEROR", roman: "IV", type: "major", theme: "authority, structure, fatherhood", colors: ["#6b2d8b", "#e8c8f8"], symbols: ["throne", "ram", "scepter"], hero: "stern bearded emperor", pose: "a {hero} seated stern and upright on a stone throne, an ankh scepter raised in one hand and a golden orb held in the other", upright: true, scene: "a {hero} seated upright on a massive stone throne carved with four ram heads, holding an ankh scepter in one hand and a golden orb in the other, armor showing beneath flowing red robes, jagged barren red mountains behind" },
  { id: 5, name: "THE HIEROPHANT", roman: "V", type: "major", theme: "tradition, faith, institutions", colors: ["#8b4513", "#f5deb3"], symbols: ["cross", "pillars", "keys"], hero: "high priest in sacred vestments", pose: "a {hero} seated on a throne, one hand raised in blessing with two fingers up, the other hand holding a triple cross staff", upright: true, scene: "a {hero} wearing a triple-tiered crown seated between two stone pillars, one hand raised in blessing while holding a triple cross staff, two tonsured acolytes kneeling below, a pair of crossed golden keys at the feet" },
  { id: 6, name: "THE LOVERS", roman: "VI", type: "major", theme: "love, choice, union", colors: ["#e91e63", "#fce4ec"], symbols: ["angel", "sun", "hearts"], hero: "nude figure", airborne: true, pose: "a {hero} and a second {hero} standing apart on the grass facing each other, both gazing up toward an angel above", scene: "a {hero} and a second {hero} standing apart with their feet on the grass of a green garden, beneath a great winged angel in the clouds with outstretched arms haloed by a radiant sun, behind one a tree bearing flames, behind the other a tree entwined with a serpent and fruit" },
  { id: 7, name: "THE CHARIOT", roman: "VII", type: "major", theme: "victory, control, determination", colors: ["#1565c0", "#e3f2fd"], symbols: ["armor", "sphinxes", "stars"], hero: "crowned warrior in armor", pose: "a {hero} standing erect and proud inside a chariot, chest out, facing straight forward, one hand holding a short scepter", upright: true, scene: "a {hero} standing erect in a stone chariot beneath a starry blue canopy, the chariot drawn by one black sphinx and one white sphinx resting in front, a winged sun emblem on the chariot, a walled city behind" },
  { id: 8, name: "STRENGTH", roman: "VIII", type: "major", theme: "strength, courage, patience", colors: ["#ff8f00", "#fff8e1"], symbols: ["infinity", "lion", "flowers"], hero: "gentle woman in a white robe", pose: "a {hero} leaning calmly over a great lion, gently closing its jaws with both hands", upright: true, scene: "a {hero} wearing a garland of flowers calmly closing the jaws of a great tawny lion with both hands, a glowing infinity symbol floating above the head, a tranquil green meadow under a soft sky" },
  { id: 9, name: "THE HERMIT", roman: "IX", type: "major", theme: "solitude, introspection, guidance", colors: ["#546e7a", "#eceff1"], symbols: ["lantern", "staff", "mountain"], hero: "grey-hooded hermit", pose: "a {hero} standing with the head bowed, one hand raising a glowing lantern and the other gripping a tall staff", upright: true, scene: "a {hero} standing alone on a snowy mountain peak at night, raising a lantern that holds a glowing six-pointed star, leaning on a tall wooden staff, a deep blue sky behind" },
  { id: 10, name: "WHEEL OF FORTUNE", roman: "X", type: "major", theme: "fate, cycles, turning point", colors: ["#6d4c41", "#efebe9"], symbols: ["wheel", "sphinx", "serpent"], hero: "sphinx", airborne: true, scene: "a great golden wheel rising in the sky inscribed with mystic letters, a blue sphinx with a sword resting on top, a red serpent descending the left side, a jackal-headed figure rising on the right, and an angel an eagle a bull and a lion reading books in the four corners among clouds" },
  { id: 11, name: "JUSTICE", roman: "XI", type: "major", theme: "justice, truth, law", colors: ["#c62828", "#ffebee"], symbols: ["scales", "sword", "crown"], hero: "crowned judge in red robes", pose: "a {hero} seated facing straight ahead, an upright sword raised in the right hand and golden scales held level in the left", upright: true, scene: "a {hero} seated between two stone pillars with a purple veil behind, holding an upright double-edged sword in the right hand and perfectly balanced golden scales in the left" },
  { id: 12, name: "THE HANGED MAN", roman: "XII", type: "major", theme: "sacrifice, waiting, new perspective", colors: ["#00695c", "#e0f2f1"], symbols: ["tree", "halo", "rope"], hero: "serene man", airborne: true, pose: "a {hero} hanging upside down by one ankle, the free leg bent behind into a figure four, hands behind the back, face calm", scene: "a {hero} hanging upside down suspended by one ankle from a living T-shaped wooden cross, the free leg crossed behind to form a four, hands clasped behind the back, a bright halo of light glowing around the head, a calm peaceful expression" },
  { id: 13, name: "DEATH", roman: "XIII", type: "major", theme: "transformation, endings, rebirth", colors: ["#212121", "#9e9e9e"], symbols: ["skeleton", "rose", "dawn"], hero: "skeleton in black armor", pose: "a {hero} sitting upright astride a white horse, holding a tall black banner with a white rose", upright: true, scene: "a {hero} riding slowly on a white horse and carrying a black banner emblazoned with a white five-petaled rose, a fallen figure and kneeling onlookers before it, a rising sun glowing between two distant towers on the horizon" },
  { id: 14, name: "TEMPERANCE", roman: "XIV", type: "major", theme: "balance, moderation, patience", colors: ["#1b5e20", "#f1f8e9"], symbols: ["angel wings", "water", "triangle"], hero: "great winged angel", pose: "a {hero} standing with one foot in the water and one on land, pouring liquid from one golden cup into another held in both hands", upright: true, scene: "a {hero} standing with one foot on land and one foot resting in a pool, pouring shimmering liquid in an arc between two golden cups, a triangle within a square on the chest, yellow irises blooming nearby, a winding path leading to mountains crowned by a glowing crown of light" },
  { id: 15, name: "THE DEVIL", roman: "XV", type: "major", theme: "bondage, materialism, shadow", colors: ["#4a148c", "#f3e5f5"], symbols: ["chains", "torch", "pentagram"], hero: "horned figure with bat wings", pose: "a {hero} crouching on a black pedestal, one hand raised open and the other holding a torch pointed down", upright: true, scene: "a {hero} perched on a black half-cube, an inverted pentagram glowing on the brow, one hand raised and a downward-pointing torch in the other, two horned and tailed captives loosely chained by the neck to the cube below" },
  { id: 16, name: "THE TOWER", roman: "XVI", type: "major", theme: "sudden change, revelation, chaos", colors: ["#b71c1c", "#ffcdd2"], symbols: ["lightning", "crown", "flames"], hero: "falling figure", airborne: true, pose: "a {hero} and a second {hero} falling headfirst from a burning tower, arms flung out", scene: "a tall grey stone tower on a rocky peak struck by a jagged bolt of lightning, its golden crown blasted off, flames bursting from the windows, a {hero} and a second {hero} plunging headfirst into the darkness, sparks like flames scattered across the night sky" },
  { id: 17, name: "THE STAR", roman: "XVII", type: "major", theme: "hope, inspiration, renewal", colors: ["#0277bd", "#e1f5fe"], symbols: ["stars", "water", "naked figure"], hero: "kneeling nude woman", pose: "a {hero} kneeling at the edge of a pool, pouring water from a jug held in each hand", upright: true, scene: "a {hero} kneeling at the edge of a still pool with one foot resting in the water and one knee on the grassy bank, pouring water from two jugs, one streaming onto the land and one into the pool, one great radiant eight-pointed star and seven smaller stars shining above, an ibis bird perched in a tree" },
  { id: 18, name: "THE MOON", roman: "XVIII", type: "major", theme: "illusion, fear, subconscious", colors: ["#1a237e", "#e8eaf6"], symbols: ["moon", "wolf", "path"], hero: "wolf", scene: "a full moon with a serene face shedding luminous dewdrops, set between two tall grey towers, a dog and a wolf howling upward, a crayfish crawling out of a pool in the foreground, a long winding path leading back toward distant hills" },
  { id: 19, name: "THE SUN", roman: "XIX", type: "major", theme: "joy, success, vitality", colors: ["#f57f17", "#fff9c4"], symbols: ["sun face", "sunflowers", "child"], hero: "joyful naked child", pose: "a {hero} riding a white horse with arms spread wide in joy, one hand holding a large red banner", upright: true, scene: "a {hero} wearing a wreath and riding a calm white horse while holding a large red banner, beneath a great radiant sun with a gentle face and straight and wavy rays, a stone wall lined with tall sunflowers behind" },
  { id: 20, name: "JUDGEMENT", roman: "XX", type: "major", theme: "awakening, judgement, rebirth", colors: ["#880e4f", "#fce4ec"], symbols: ["angel", "trumpet", "rising"], hero: "rising figure", airborne: true, pose: "a {hero} and a second {hero} rising from open coffins with arms raised toward an angel above", upright: true, scene: "a great winged angel blowing a golden trumpet hung with a white-and-red cross banner from the clouds above, and below a {hero}, a second {hero} and a small child rising with arms uplifted from open grey coffins floating on a calm sea, snowy mountains in the far distance" },
  { id: 21, name: "THE WORLD", roman: "XXI", type: "major", theme: "completion, integration, achievement", colors: ["#004d40", "#e0f2f1"], symbols: ["wreath", "dancer", "four elements"], hero: "dancing figure draped in a violet sash", airborne: true, pose: "a {hero} dancing in mid-air within a laurel wreath, one leg crossed behind the other, a short wand in each hand", upright: true, scene: "a {hero} floating within a great oval laurel wreath bound at top and bottom by red ribbons, holding a short wand in each hand, a human head an eagle a bull and a lion appearing in the four corners among soft clouds" },
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
type MinorScene = { hero: string; pose?: string; upright?: true; scene: string; airborne?: true };
const MINOR_SCENES: Record<TarotSuit, Record<string, MinorScene>> = {
  major: {},
  wands: {
    ACE: { hero: "figure", scene: "a hand emerging from a cloud grasping a stout sprouting wooden wand with fresh green leaves budding from it, a castle on a distant hilltop above a winding river and rolling green hills" },
    TWO: { hero: "robed man", pose: "a {hero} standing on a battlement, holding a small globe in one hand and gripping a tall wand with the other, gazing out to sea", upright: true, scene: "a {hero} standing on a castle battlement holding a small globe of the world in one hand while gripping one tall wand fixed to the wall, a second wand standing beside, gazing out over land and sea" },
    THREE: { hero: "cloaked merchant", pose: "a {hero} seen from behind standing on a cliff, one hand resting on a tall wand, watching ships at sea", upright: true, scene: "a {hero} standing on a cliff with the back turned, watching three ships sail across a golden sea, one hand resting on one of three tall wands planted in the ground around" },
    FOUR: { hero: "celebrating figure", pose: "two {hero} figures raising bouquets high above their heads in welcome", upright: true, scene: "four tall wands standing upright bound at the top with a flowered garland forming a canopy, two {hero} figures raising bouquets in welcome beneath it, a manor house and bright sky behind" },
    FIVE: { hero: "youth", pose: "five {hero} figures swinging tall wooden staves at one another in a lively mock fight", upright: true, scene: "five {hero} figures brandishing tall wooden staves at one another in lively mock combat on open ground under a clear sky" },
    SIX: { hero: "rider", pose: "a {hero} riding a white horse in triumph, holding high a staff topped with a laurel wreath", upright: true, scene: "a {hero} crowned with a laurel wreath riding a white horse in a victory procession, holding a tall staff topped with a laurel wreath, a crowd of marchers carrying five more upright staves around" },
    SEVEN: { hero: "man", pose: "a {hero} standing braced on a hilltop, gripping a staff in both hands to fend off staves from below", upright: true, scene: "a {hero} standing firm on a hilltop defending with a raised staff against six other staves thrust up from below" },
    EIGHT: { hero: "figure", scene: "eight flowering wands flying swiftly in parallel through the open air over a green river landscape under a clear sky" },
    NINE: { hero: "wary wounded man", pose: "a {hero} with a bandaged head leaning on a staff gripped in both hands, glancing sideways warily", upright: true, scene: "a {hero} with a bandaged head leaning watchfully on a staff, eight more staves standing upright in a row behind like a fence" },
    TEN: { hero: "burdened man", pose: "a {hero} bent forward, hugging a heavy bundle of ten staves in both arms while trudging toward a town", upright: true, scene: "a {hero} bent forward carrying a heavy bundle of all ten wooden staves in both arms, struggling toward a town in the near distance" },
    PAGE: { hero: "young page", pose: "a {hero} standing with both hands on a tall flowering staff, gazing up at its tip", upright: true, scene: "a {hero} in a patterned tunic standing in a desert with pyramids behind, both hands resting on a tall flowering staff, gazing up at its tip with curiosity" },
    KNIGHT: { hero: "armored knight", pose: "a {hero} riding a rearing horse, holding a flowering staff aloft", upright: true, scene: "a {hero} on a rearing chestnut horse, wearing a tunic patterned with salamanders, holding a flowering staff, desert and pyramids behind" },
    QUEEN: { hero: "queen", pose: "a {hero} seated on a throne, a flowering staff in one hand and a sunflower in the other", upright: true, scene: "a {hero} seated on a stone throne carved with lions and sunflowers, holding a flowering staff in one hand and a large sunflower in the other, a black cat sitting at the feet" },
    KING: { hero: "king", pose: "a {hero} seated on a throne, leaning slightly forward, gripping a flowering staff", upright: true, scene: "a {hero} seated on a throne carved with lions and salamanders, holding a flowering staff, robes patterned with fire lizards, a small live salamander at the feet" },
  },
  cups: {
    ACE: { hero: "figure", scene: "a hand emerging from a cloud holding an overflowing golden chalice with five streams of water spilling over, a white dove descending with a round wafer toward the cup, a calm sea dotted with water lilies below" },
    TWO: { hero: "figure", pose: "a {hero} and a second {hero} facing each other, each holding out a golden cup toward the other", upright: true, scene: "a {hero} and a second {hero} facing each other and pledging two golden cups in a vow, between them a winged lion's head above a caduceus of two entwined serpents, a green landscape and a small house behind" },
    THREE: { hero: "dancing woman", pose: "three {hero} figures dancing in a circle, each raising a golden cup high in a toast", upright: true, scene: "three {hero} figures dancing in a circle on a grassy meadow and raising golden cups together in a joyful toast, ripe fruit and a harvest of pumpkins at their feet" },
    FOUR: { hero: "youth", pose: "a {hero} sitting under a tree with arms folded, gazing down at three cups", upright: true, scene: "a {hero} sitting under a tree with arms folded, looking discontent at three golden cups on the ground in front, a hand from a cloud offering a fourth cup" },
    FIVE: { hero: "cloaked figure", pose: "a {hero} in a black cloak standing with the head bowed over spilled cups", scene: "a {hero} in a long black cloak standing with the head bowed in grief over three spilled cups, two upright cups still standing behind, a bridge leading to a castle across a river" },
    SIX: { hero: "child", pose: "a {hero} child bending to hand a cup of white flowers to a smaller {hero} child", upright: true, scene: "a {hero} child handing a cup filled with white flowers to a smaller {hero} child in a peaceful village courtyard, six large flower-filled cups arranged around them" },
    SEVEN: { hero: "figure", pose: "a {hero} seen from behind, gazing up in wonder at seven floating cups", scene: "a {hero} seen from behind gazing up in wonder at seven golden cups floating in the clouds, each cup holding a different vision: a castle, jewels, a laurel wreath, a dragon, a glowing head, a coiled snake, and a shrouded glowing figure" },
    EIGHT: { hero: "cloaked traveler", pose: "a {hero} seen from behind, walking away with a staff toward distant mountains", upright: true, scene: "a {hero} in a red cloak walking away with a staff toward distant mountains, leaving behind eight golden cups stacked with a gap in the row, an eclipsed moon in the night sky above" },
    NINE: { hero: "satisfied man", pose: "a {hero} seated proudly with arms crossed and a broad smile", upright: true, scene: "a {hero} seated contentedly with arms crossed and a broad smile, nine golden cups arranged in an arc on a curved blue-draped table behind" },
    TEN: { hero: "figure", pose: "a {hero} and a second {hero} standing side by side, arms raised in joy toward a rainbow", upright: true, scene: "a {hero} and a second {hero} standing on a green lawn with arms raised in joy beneath a great rainbow holding ten golden cups, two small {hero} children dancing on the grass nearby, a cottage and green hills behind" },
    PAGE: { hero: "young page", pose: "a {hero} standing by the sea, holding up a golden cup and looking at a fish rising from it", upright: true, scene: "a {hero} in a tunic patterned with lotus flowers standing by a wavy sea, holding up a golden cup from which a small fish curiously rises" },
    KNIGHT: { hero: "knight", pose: "a {hero} riding a white horse slowly, holding a golden cup out in front", upright: true, scene: "a {hero} in armor riding a white horse slowly and gracefully, a winged helmet on the head, holding out a golden cup, a river winding through the landscape" },
    QUEEN: { hero: "queen", pose: "a {hero} seated on a throne, holding a closed golden chalice in both hands and gazing at it", upright: true, scene: "a {hero} seated on an ornate throne carved with cherubs at the water's edge, gazing tenderly at a closed ornate golden chalice held in both hands" },
    KING: { hero: "king", pose: "a {hero} seated on a throne above the sea, a golden cup in one hand and a short scepter in the other", upright: true, scene: "a {hero} seated on a stone throne set on a broad stone block rising from a choppy sea, holding a golden cup in one hand and a short scepter in the other, a fish amulet at the neck, a ship and a leaping fish in the waves behind" },
  },
  swords: {
    ACE: { hero: "figure", scene: "a hand emerging from a cloud gripping a single upright double-edged sword, its tip crowned with a golden crown wreathed in laurel and palm, jagged grey mountains below" },
    TWO: { hero: "blindfolded woman", pose: "a {hero} seated blindfolded, arms crossed over the chest, holding two long swords upright", upright: true, scene: "a {hero} seated on a stone bench by the sea, arms crossed and holding two long swords upright in perfect balance, a crescent moon in the evening sky behind" },
    THREE: { hero: "figure", scene: "a large red human heart pierced cleanly through by three crossed swords, heavy grey rain falling from storm clouds behind" },
    FOUR: { hero: "armored knight", pose: "a {hero} lying flat on a stone tomb, hands pressed together in prayer", scene: "a {hero} lying still in repose on top of a stone tomb like a carved effigy, hands pressed together in prayer, three swords hanging on the wall above and one sword carved beneath, a stained-glass window glowing nearby" },
    FIVE: { hero: "smirking figure", pose: "a {hero} gathering up swords with a smug smile while two defeated {hero} figures walk away", upright: true, scene: "a {hero} gathering up three swords from the ground with a smug expression, two more swords lying at the feet, two defeated {hero} figures walking away dejected under a ragged stormy sky" },
    SIX: { hero: "ferryman", pose: "a {hero} standing in a small boat, pushing it forward with a long pole", upright: true, scene: "a {hero} poling a small wooden boat across calm water, ferrying a cloaked {hero} and a small {hero} child seated low, six swords standing upright in the boat, a calm far shore ahead" },
    SEVEN: { hero: "stealthy man", pose: "a {hero} sneaking away on tiptoe, five swords bundled in the arms, glancing back", upright: true, scene: "a {hero} creeping away on tiptoe carrying five swords bundled in the arms and glancing back with a sly grin, two swords left standing in the ground, a military camp with tents behind" },
    EIGHT: { hero: "bound woman", pose: "a {hero} standing still, bound and blindfolded among upright swords", scene: "a {hero} standing bound and blindfolded and loosely wrapped in red cloth, surrounded by eight upright swords forming a cage in a grey marsh, a castle on a hill above" },
    NINE: { hero: "figure", pose: "a {hero} sitting up in bed, the face buried in both hands", upright: true, scene: "a {hero} sitting up in bed in the dark with the face buried in both hands in distress, nine horizontal swords mounted on the black wall behind" },
    TEN: { hero: "fallen figure", pose: "a {hero} lying face down on the ground with swords in the back", scene: "a {hero} lying face down and still on the ground with ten swords driven into the back, a black sky lifting to a golden dawn over calm water on the horizon" },
    PAGE: { hero: "alert youth", pose: "a {hero} striding along a hilltop, holding a sword upright in both hands, glancing back", upright: true, scene: "a {hero} striding on a windswept hilltop, holding a sword upright in both hands and glancing back warily, ragged clouds and bending trees, birds wheeling in the turbulent sky" },
    KNIGHT: { hero: "charging knight", pose: "a {hero} charging forward on a galloping horse, sword raised high to strike", upright: true, scene: "a {hero} in full armor charging at a furious gallop on a grey horse, sword raised high to strike, the cloak streaming, storm-bent trees and racing clouds behind" },
    QUEEN: { hero: "queen", pose: "a {hero} seated on a throne, one sword held upright in the right hand, the left hand extended open", upright: true, scene: "a {hero} seated on a stone throne carved with a butterfly and a cherub, holding a single sword upright in the right hand and extending the left hand, a stern composed face, billowing clouds and one bird above" },
    KING: { hero: "king", pose: "a {hero} seated facing straight ahead, holding a single upright sword", upright: true, scene: "a {hero} seated frontally on a stone throne carved with butterflies and angels, wearing a blue robe, holding a single upright sword tilted slightly, a serious commanding gaze, a blue sky with a few clouds" },
  },
  pentacles: {
    ACE: { hero: "figure", scene: "a hand emerging from a cloud holding up a single large golden coin engraved with a five-pointed pentagram, below it a lush garden with white lilies and an arched trellis of roses opening onto a path toward distant mountains" },
    TWO: { hero: "young man", pose: "a {hero} dancing on one foot while juggling two golden pentacles", upright: true, scene: "a {hero} dancing on the sandy shore while juggling two golden pentacles linked by a green ribbon looped into an infinity sign, two ships rising and dipping on big waves in the sea behind" },
    THREE: { hero: "sculptor", pose: "a {hero} standing on a bench carving a stone arch, turning to listen to a {hero} monk and a {hero} architect holding plans", upright: true, scene: "a {hero} standing on a bench carving stone in a cathedral and pausing to consult a {hero} monk and a {hero} architect holding plans, three pentacles set into the carved archway above" },
    FOUR: { hero: "miser", pose: "a {hero} seated, clutching a golden pentacle tightly to the chest with both arms", upright: true, scene: "a {hero} seated on a stool clutching one golden pentacle tightly to the chest, one pentacle balanced on the crown of the head and one beneath each foot, a grey town skyline behind" },
    FIVE: { hero: "ragged beggar", pose: "a {hero} and a second {hero} trudging through snow, one leaning on crutches", upright: true, scene: "a {hero} and a second {hero}, one on crutches with a bandaged leg, trudging through falling snow past a glowing stained-glass church window set with five pentacles" },
    SIX: { hero: "well-dressed merchant", pose: "a {hero} standing, holding a balance scale in one hand and dropping coins into the outstretched hands of two kneeling {hero} beggars", upright: true, scene: "a {hero} holding a balance scale and dropping coins into the hands of two kneeling {hero} beggars, six pentacles arranged in the air around them" },
    SEVEN: { hero: "young farmer", pose: "a {hero} leaning on a hoe handle with both hands, gazing at pentacles growing on a bush", upright: true, scene: "a {hero} leaning thoughtfully on the handle of a hoe and gazing at seven golden pentacles growing on a leafy green bush beside, a cultivated field around" },
    EIGHT: { hero: "craftsman", pose: "a {hero} seated at a bench, hammering a chisel into a golden pentacle", upright: true, scene: "a {hero} seated at a bench carefully carving a golden pentacle with a chisel, six finished pentacles mounted on a post above and two below, a town in the far distance" },
    NINE: { hero: "elegant woman", pose: "a {hero} standing in a vineyard, a hooded falcon perched on one raised gloved hand", upright: true, scene: "a {hero} in a richly embroidered gown standing in a lush vineyard heavy with grapes, a hooded falcon perched on one gloved hand, nine golden pentacles among the vines, a manor house behind" },
    TEN: { hero: "white-bearded elder", pose: "a {hero} seated under an archway, resting one hand on the head of a dog", upright: true, scene: "a {hero} seated under an archway with two dogs, a {hero} couple and a small {hero} child nearby, ten golden pentacles arranged across the scene, a walled town beyond" },
    PAGE: { hero: "young page", pose: "a {hero} standing, holding up a golden pentacle in both hands and gazing at it", upright: true, scene: "a {hero} standing in a flowering green field, holding up a single golden pentacle in both hands and gazing at it intently, a freshly plowed field and trees behind" },
    KNIGHT: { hero: "knight", pose: "a {hero} sitting still on a heavy black horse, holding a golden pentacle out on an open palm", upright: true, scene: "a {hero} in armor sitting still on a heavy black plow-horse at rest, holding a golden pentacle out on an open palm, gazing over freshly plowed fields" },
    QUEEN: { hero: "queen", pose: "a {hero} seated on a throne, cradling a golden pentacle in the lap with both hands", upright: true, scene: "a {hero} seated on a throne carved with goats fruit and cherubs in a blooming garden, cradling a golden pentacle in the lap, a rabbit sitting in the grass in the foreground, roses arching overhead" },
    KING: { hero: "king", pose: "a {hero} seated on a throne, one hand resting on a golden pentacle and the other holding a scepter", upright: true, scene: "a {hero} seated on a throne draped with grapevines and carved with bulls, wearing robes embroidered with grapes, one hand resting on a golden pentacle and the other holding a scepter, a castle behind" },
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
      ...(s.pose ? { pose: s.pose } : {}),
      ...(s.upright ? { upright: true as const } : {}),
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
// Figure-less cards (Aces, Moon, 3 of Swords, 8 of Wands) skip it so it cannot add people to them.
export const GROUNDING =
  "Every figure and land animal stands, sits, kneels or lies on a solid visible surface such as ground, floor, rock or a seat, feet touching it.";

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
   * The subject is an animal or other non-human creature. Set from the explicit 「主角是動物」 checkbox, never
   * inferred: the translate step only runs for non-Latin text, and guessing from words ("a teddy bear", "a robot")
   * misfires. Only takes effect together with a non-empty subject on an `upright` card.
   */
  nonHumanSubject?: boolean;
}

// With a non-human subject on an `upright` card. One-figure cards get the singular: "Each {hero}" made FLUX add
// extra cats there (DEATH). Cards whose pose names several figures get the plural so every one stands up.
// Every acting figure in a pose is written with {hero}, which is what isGroupPose counts.
export const UPRIGHT_SENTENCE =
  "The {hero} stands or sits upright like a person, using its front paws as hands.";
export const UPRIGHT_SENTENCE_GROUP =
  "Every {hero} figure stands or sits upright like a person, using its front paws as hands.";

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
  const fill = (t: string) => t.split("{hero}").join(hero);
  const scene = fill(card.scene);
  const upright = subject && input.nonHumanSubject && card.upright
    ? ` ${fill(isGroupPose(card.pose ?? "") ? UPRIGHT_SENTENCE_GROUP : UPRIGHT_SENTENCE)}`
    : "";
  const pose = card.pose ? capitalize(fill(card.pose)) : "";

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
  const head = pose ? `${pose}, ${anchor.charAt(0).toLowerCase()}${anchor.slice(1)}.${upright} ` : "";
  const grounding = card.scene.includes("{hero}") && !card.airborne ? ` ${GROUNDING}` : "";
  return `${head}${lead}. ${scene}.${grounding} ${anchor}, one cohesive consistent art style across a single vertical full-bleed scene, rich symbolic detail.`;
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
  const b = cut.lastIndexOf(", ");
  return b > 20 ? cut.slice(0, b) : cut;
}
