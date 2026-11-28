import type { IFunctionalAstrolabe } from 'iztro/lib/astro/FunctionalAstrolabe';

/**
 * 紫微格局判定引擎。
 *
 * 對 zh-TW 命盤逐條比對格局,確定性、零成本。成立條件依 x-iztro `src/pattern/rules/*.rs`
 *   (MIT,見 THIRD_PARTY_NOTICES.md)的規則以 TypeScript 重寫,口徑來源是 iztro-docs《格局》頁與
 *   《紫微斗數全書》;x-iztro 沒有的 4 條(權祿巡逢、雙祿朝垣、命裡逢空、天梁拱月)為本站原有規則。
 * 行運格(祿衰馬困、風雲際會)只在運限盤成立,本命盤不判。
 * 宮位索引同 iztro:0 = 寅宮,順時針遞增;命宮前一宮 = index-1,後一宮 = index+1。
 */

export type PatternKind = 'auspicious' | 'inauspicious' | 'neutral';

export interface ZiweiPattern {
  name: string;
  kind: PatternKind;
  desc: string;
}

type Astro = IFunctionalAstrolabe;
type Star = Astro['palaces'][number]['majorStars'][number];

const SHA6 = ['火星', '鈴星', '擎羊', '陀羅', '地空', '地劫'];
/** 空亡星:旬空、空亡、截路(預設派)、截空(中州派)。 */
const KONG_WANG = ['旬空', '空亡', '截路', '截空'];
/** 空曜(兩重華蓋寬口徑用,去掉主口徑已收的地空)。 */
const KONG_YAO_EXTRA = ['天空', '截空', '旬空'];
const SPL = ['七殺', '破軍', '貪狼'];
const JYTL = ['天機', '太陰', '天同', '天梁'];
const JI6 = ['左輔', '右弼', '文昌', '文曲', '天魁', '天鉞'];
const BRIGHT = ['廟', '旺'];
/** 落陷含「不」(x-iztro view.rs DARK:石中隱玉一節稱戌宮「不」的太陽為反背)。 */
const DARK = ['陷', '不'];

// ---------- 盤面輔助(純讀,不改盤) ----------

export const mod12 = (i: number) => ((i % 12) + 12) % 12;
const at = (a: Astro, i: number) => a.palaces[mod12(i)];
const allStars = (a: Astro, i: number): Star[] => {
  const p = at(a, i);
  return [...p.majorStars, ...p.minorStars, ...p.adjectiveStars];
};
const branch = (a: Astro, i: number) => String(at(a, i).earthlyBranch);
const indexOf = (a: Astro, name: string) => a.palaces.findIndex((p) => p.name === name);
const soulIdx = (a: Astro) => indexOf(a, '命宮');
const soulAndBody = (a: Astro): number[] => {
  const s = soulIdx(a);
  const b = a.palaces.findIndex((p) => p.isBodyPalace);
  return b < 0 || b === s ? [s] : [s, b];
};
export const opp = (i: number) => mod12(i + 6);
export const surround = (i: number) => [mod12(i), opp(i), mod12(i + 4), mod12(i + 8)];
/** 暗合宮(六合):寅亥、卯戌、辰酉、巳申、午未、子丑;以 0=寅 的索引即 9-i。 */
export const hidden = (i: number) => mod12(9 - i);

const find = (a: Astro, i: number, name: string) => allStars(a, i).find((s) => s.name === name);
const has = (a: Astro, i: number, name: string) => !!find(a, i, name);
const hasAll = (a: Astro, i: number, names: string[]) => names.every((n) => has(a, i, n));
const hasAny = (a: Astro, i: number, names: string[]) => names.some((n) => has(a, i, n));
/** 某星落在 i 的三方四正哪一宮;不見回 -1。 */
const inSur = (a: Astro, i: number, name: string) =>
  surround(i).find((p) => has(a, p, name)) ?? -1;
const surHasAll = (a: Astro, i: number, names: string[]) => names.every((n) => inSur(a, i, n) >= 0);
const surHasAny = (a: Astro, i: number, names: string[]) => names.some((n) => inSur(a, i, n) >= 0);

const majors = (a: Astro, i: number) => at(a, i).majorStars.filter((s) => s.type === 'major');
const isEmpty = (a: Astro, i: number) => majors(a, i).length === 0;
/** 宮內主星;空宮借對宮。 */
const majorsBorrowed = (a: Astro, i: number) => (isEmpty(a, i) ? majors(a, opp(i)) : majors(a, i));
const hasMajorB = (a: Astro, i: number, name: string) =>
  majorsBorrowed(a, i).some((s) => s.name === name);
const alone = (a: Astro, i: number, name: string) => {
  const m = majors(a, i);
  return m.length === 1 && m[0].name === name;
};
const brightIn = (a: Astro, i: number, name: string, set: string[]) =>
  set.includes(String(find(a, i, name)?.brightness ?? ''));

const mutagenStar = (a: Astro, i: number, m: string) => allStars(a, i).find((s) => s.mutagen === m);
const hasMutagen = (a: Astro, i: number, m: string) => !!mutagenStar(a, i, m);
const surHasMutagen = (a: Astro, i: number, m: string) => surround(i).some((p) => hasMutagen(a, p, m));
/** 三方四正無煞:火鈴羊陀空劫與化忌一顆都不見。 */
const noSha = (a: Astro, i: number) => !surHasAny(a, i, SHA6) && !surHasMutagen(a, i, '忌');

/** A、B 分夾 i(兩側不限)。 */
const jia = (a: Astro, i: number, x: string, y: string) => {
  const [p, n] = [i - 1, i + 1];
  return (has(a, p, x) && has(a, n, y)) || (has(a, p, y) && has(a, n, x));
};

/** 宮內吉星:六吉星或帶祿權科的星。 */
const auspicious = (a: Astro, i: number) =>
  hasAny(a, i, JI6) || ['祿', '權', '科'].some((m) => hasMutagen(a, i, m));

/** 命宮三方四正太陽、太陰皆明(bright=true)或皆暗。 */
const sunMoon = (a: Astro, s: number, bright: boolean) => {
  const set = bright ? BRIGHT : DARK;
  return ['太陽', '太陰'].every((n) => {
    const p = inSur(a, s, n);
    return p >= 0 && brightIn(a, p, n, set);
  });
};

/** 日月夾某宮:日月分居兩鄰、該宮不坐空亡且有吉星。 */
const riYueJia = (a: Astro, i: number) =>
  i >= 0 && jia(a, i, '太陽', '太陰') && !hasAny(a, i, KONG_WANG) && auspicious(a, i);

/** 同陰同守某宮;本宮無主星借對宮。 */
const tongYin = (a: Astro, i: number) =>
  hasAll(a, i, ['天同', '太陰']) || (isEmpty(a, i) && hasAll(a, opp(i), ['天同', '太陰']));

// ---------- 規則表 ----------

type Rule = { name: string; kind: PatternKind; desc: string; test: (a: Astro) => boolean };
const S = soulIdx;

const RULES: Rule[] = [
  // 紫微、天府、天機系
  {
    name: '君臣慶會格',
    kind: 'auspicious',
    desc: '紫微(或天府)得輔佐諸星環護,如君得良臣:紫破得左右相夾、紫相得昌曲坐對、天府得機陰同梁前後相夾(以上需三方無煞忌),或紫微與左輔右弼同宮。主得人扶持、利領導統御。',
    test: (a) => {
      const s = S(a);
      const clean = noSha(a, s);
      const ziPo = hasAll(a, s, ['紫微', '破軍']) && jia(a, s, '左輔', '右弼');
      const ziXiang =
        hasAll(a, s, ['紫微', '天相']) &&
        ((has(a, s, '文昌') && has(a, opp(s), '文曲')) || (has(a, s, '文曲') && has(a, opp(s), '文昌')));
      const fuJia =
        has(a, s, '天府') && JYTL.every((n) => hasMajorB(a, s - 1, n) || hasMajorB(a, s + 1, n));
      const ziZuoYou = hasAll(a, s, ['紫微', '左輔', '右弼']);
      return (clean && (ziPo || ziXiang || fuJia)) || ziZuoYou;
    },
  },
  {
    name: '紫府同宮',
    kind: 'auspicious',
    desc: '紫微、天府同坐命宮,帝座與庫星相會,主人雍容尊貴、有領導格局,處事較平穩,利擔任要職或自成一家。',
    test: (a) => hasAll(a, S(a), ['紫微', '天府']),
  },
  {
    name: '金輿扶駕格',
    kind: 'auspicious',
    desc: '天府守命於丑或未,太陽、太陰分居左右相夾。如車駕有日月扶持,主得長輩與貴人提攜,處事有依靠;此格少受煞星影響。',
    test: (a) => {
      const s = S(a);
      return ['丑', '未'].includes(branch(a, s)) && has(a, s, '天府') && jia(a, s, '太陽', '太陰');
    },
  },
  {
    name: '紫府夾命格',
    kind: 'auspicious',
    desc: '天機、太陰同守命宮,紫微、天府分居兩側相夾。主得上位者與資源方照應,心思細密、易受器重。',
    test: (a) => {
      const s = S(a);
      return hasAll(a, s, ['天機', '太陰']) && jia(a, s, '紫微', '天府');
    },
  },
  {
    name: '極向離明格',
    kind: 'auspicious',
    desc: '紫微守命於午宮,且命宮三方四正不見煞星與化忌。帝星居離明之地,主氣度恢宏、利居高位、做事有格局。',
    test: (a) => {
      const s = S(a);
      return branch(a, s) === '午' && has(a, s, '紫微') && noSha(a, s);
    },
  },
  {
    name: '極居卯酉格',
    kind: 'neutral',
    desc: '紫微、貪狼同守命宮於卯或酉。古書以為易有出世之想;今多解為重精神追求、興趣廣泛,宜把熱情放在專業或修養上。',
    test: (a) => ['卯', '酉'].includes(branch(a, S(a))) && hasAll(a, S(a), ['紫微', '貪狼']),
  },
  {
    name: '機月同梁格',
    kind: 'auspicious',
    desc: '命在寅申坐天同天梁或天機太陰,或命宮三方四正會齊天機、太陰、天同、天梁。主有正財、宜公職或大機構穩定發展,智慧、享受、照顧家人兼具。',
    test: (a) => {
      const s = S(a);
      const yinShen =
        ['寅', '申'].includes(branch(a, s)) &&
        [['天同', '天梁'], ['天機', '太陰']].some((pair) => pair.every((n) => hasMajorB(a, s, n)));
      const wide = JYTL.every((n) => surround(s).some((p) => hasMajorB(a, p, n)));
      return yinShen || wide;
    },
  },
  {
    name: '善蔭朝綱格',
    kind: 'auspicious',
    desc: '天機、天梁同守命宮或身宮(辰戌)。主心地仁厚、善謀劃、樂於照顧他人,適合顧問、教育、公益與專業服務。',
    test: (a) => soulAndBody(a).some((p) => hasAll(a, p, ['天機', '天梁'])),
  },
  {
    name: '巨機同宮格',
    kind: 'neutral',
    desc: '巨門、天機同守命宮(卯酉,又名機巨同臨)。主口才便給、善分析議論,宜口才/研究/仲介為業;然易有口舌是非,需慎言。',
    test: (a) => hasAll(a, S(a), ['巨門', '天機']),
  },
  {
    name: '機巨居卯格',
    kind: 'auspicious',
    desc: '天機、巨門同守命宮於卯。古書稱乙、辛年生人尤佳。主思路敏捷、能言善辯,專業與口才並用,易在競爭中出頭。',
    test: (a) => branch(a, S(a)) === '卯' && hasAll(a, S(a), ['天機', '巨門']),
  },
  // 日月系
  {
    name: '日月同宮格',
    kind: 'auspicious',
    desc: '太陽、太陰同守命宮(丑未)。日月同臨,主陰陽調和、能剛能柔,處世圓融;需留意情緒起伏,宜培養穩定的節奏。',
    test: (a) => hasAll(a, S(a), ['太陽', '太陰']),
  },
  {
    name: '巨日同宮格',
    kind: 'auspicious',
    desc: '太陽、巨門同守命宮(寅申)。太陽照亮巨門之暗,主口才與名聲並進,利教學、傳播、法律、外交等以言語立業之路。',
    test: (a) => hasAll(a, S(a), ['太陽', '巨門']),
  },
  {
    name: '日照雷門格',
    kind: 'auspicious',
    desc: '太陽、天梁同坐卯宮,落在命宮或官祿宮。旭日東昇,主朝氣勃發、早年得志,積極進取,利開創與公眾事業。',
    test: (a) =>
      [S(a), indexOf(a, '官祿')].some(
        (i) => i >= 0 && branch(a, i) === '卯' && hasAll(a, i, ['太陽', '天梁']),
      ),
  },
  {
    name: '日月並明格',
    kind: 'auspicious',
    desc: '命宮三方四正內太陽、太陰皆廟旺。日月雙明,主思路清晰、名利兼顧,得男性與女性長輩之助。',
    test: (a) => sunMoon(a, S(a), true),
  },
  {
    name: '日月反背格',
    kind: 'inauspicious',
    desc: '命宮三方四正內太陽、太陰皆落陷。光源不足,主早年較辛勞、付出多而回報慢;宜靠專業累積、低調務實,中晚年漸入佳境。',
    test: (a) => sunMoon(a, S(a), false),
  },
  {
    name: '日月照璧格',
    kind: 'auspicious',
    desc: '太陽、太陰同守田宅宮(丑未墓庫)。主家宅光明、易得不動產或祖業庇蔭,居家環境與家庭關係是重要資源。',
    test: (a) => {
      const p = indexOf(a, '田宅');
      return p >= 0 && hasAll(a, p, ['太陽', '太陰']);
    },
  },
  {
    name: '日麗中天格',
    kind: 'auspicious',
    desc: '太陽獨坐午宮守命(又名金燦光輝)。主光明磊落、聲名顯赫,事業如日中天,利貴顯與公眾事業;三方見煞忌則光芒稍減。',
    test: (a) => branch(a, S(a)) === '午' && alone(a, S(a), '太陽'),
  },
  {
    name: '日月藏輝格',
    kind: 'inauspicious',
    desc: '日月反背,命宮三方四正又見巨門。光被遮蔽,主才華不易被看見、易生誤解;宜多溝通、把成果具體化,以耐心換取認可。',
    test: (a) => sunMoon(a, S(a), false) && inSur(a, S(a), '巨門') >= 0,
  },
  {
    name: '丹墀桂墀格',
    kind: 'auspicious',
    desc: '日月並明,且命宮本身坐廟旺的太陽(丹墀)或太陰(桂墀)。主早得青雲之志,宜專業領域揚才,貴顯昌榮。',
    test: (a) => {
      const s = S(a);
      return sunMoon(a, s, true) && (brightIn(a, s, '太陽', BRIGHT) || brightIn(a, s, '太陰', BRIGHT));
    },
  },
  {
    name: '日月夾命格',
    kind: 'auspicious',
    desc: '太陽、太陰分居命宮兩側相夾,命宮不坐空亡且有吉星。主較易得父母長輩照拂,身邊多貴人,處事有依靠。',
    test: (a) => riYueJia(a, S(a)),
  },
  {
    name: '日月夾財格',
    kind: 'auspicious',
    desc: '太陽、太陰分夾財帛宮,財帛宮不坐空亡且有吉星。古云「不權則富」,主財務上較易得到助力。',
    test: (a) => riYueJia(a, indexOf(a, '財帛')),
  },
  {
    name: '月朗天門格',
    kind: 'auspicious',
    desc: '太陰於亥宮坐命。主清秀聰穎、財帛豐盈,溫潤多才,中晚年尤佳。',
    test: (a) => branch(a, S(a)) === '亥' && has(a, S(a), '太陰'),
  },
  {
    name: '月生滄海格',
    kind: 'auspicious',
    desc: '天同、太陰同坐子宮,落在命宮(又名水澄桂萼)或田宅宮。月映水中,主氣質清雅、心思細膩,利文藝與家業。',
    test: (a) =>
      [S(a), indexOf(a, '田宅')].some(
        (i) => i >= 0 && branch(a, i) === '子' && hasAll(a, i, ['天同', '太陰']),
      ),
  },
  {
    name: '明珠出海格',
    kind: 'auspicious',
    desc: '命宮在未而無主星,對宮天同巨門,三合有卯宮太陽、亥宮太陰拱照。主大器晚成、才華經歷練後發光,利名聲與財富。',
    test: (a) => {
      const s = S(a);
      return branch(a, s) === '未' && isEmpty(a, s) && hasAll(a, opp(s), ['天同', '巨門']);
    },
  },
  // 武廉貪巨梁殺破系
  {
    name: '貪武同行格',
    kind: 'auspicious',
    desc: '武曲、貪狼同守命宮或身宮(丑未)。古云「先貧後富」,主中晚年發達、財官並美,先勤後得,宜實業與財經。',
    test: (a) =>
      soulAndBody(a).some((p) => ['丑', '未'].includes(branch(a, p)) && hasAll(a, p, ['武曲', '貪狼'])),
  },
  {
    name: '鈴昌陀武格',
    kind: 'inauspicious',
    desc: '鈴星、文昌、陀羅、武曲齊會命宮三方四正。主行事易受牽絆、決策需防一時衝動;遇不順時宜放慢腳步、尋求支援,避免孤注一擲。',
    test: (a) => surHasAll(a, S(a), ['鈴星', '文昌', '陀羅', '武曲']),
  },
  {
    name: '刑囚夾印格',
    kind: 'neutral',
    desc: '廉貞、天相與天刑或擎羊同守命宮或身宮。古書主武勇;性格剛直、原則感強,宜從事紀律、法務、技術類工作,並留意人際分寸。',
    test: (a) =>
      soulAndBody(a).some((p) => hasAll(a, p, ['廉貞', '天相']) && hasAny(a, p, ['天刑', '擎羊'])),
  },
  {
    name: '生不逢時格',
    kind: 'inauspicious',
    desc: '命宮坐空亡星(旬空、空亡、截路、截空)又逢廉貞(一說破軍亦算)。主努力易遇時機不合,宜重視時機判斷、穩紮穩打,累積實力待時而動。',
    test: (a) => hasAny(a, S(a), KONG_WANG) && hasAny(a, S(a), ['廉貞', '破軍']),
  },
  {
    name: '雄宿朝元格',
    kind: 'auspicious',
    desc: '廉貞獨坐寅或申守命。主才幹出眾、有魄力,能在制度內發揮影響力;三方會煞則成就較平常。',
    test: (a) => ['寅', '申'].includes(branch(a, S(a))) && has(a, S(a), '廉貞'),
  },
  {
    name: '府相朝垣格',
    kind: 'auspicious',
    desc: '天府居官祿宮、天相居財帛宮,財官二宮朝拱命宮。主衣食無憂、財官雙美,為人穩重得人緣,適合穩健經營或任職主管。',
    test: (a) => {
      const c = indexOf(a, '官祿');
      const w = indexOf(a, '財帛');
      return c >= 0 && w >= 0 && has(a, c, '天府') && has(a, w, '天相');
    },
  },
  {
    name: '火貪格',
    kind: 'auspicious',
    desc: '貪狼與火星同會命宮。主機遇常突然而來,行運觸發時進展較快,宜把握時機;來得快也需守成。',
    test: (a) => has(a, S(a), '貪狼') && inSur(a, S(a), '火星') >= 0,
  },
  {
    name: '鈴貪格',
    kind: 'auspicious',
    desc: '貪狼與鈴星同會命宮。同火貪,主際遇常突然而來,利把握意外的機會。',
    test: (a) => has(a, S(a), '貪狼') && inSur(a, S(a), '鈴星') >= 0,
  },
  {
    name: '石中隱玉格',
    kind: 'auspicious',
    desc: '巨門守命宮或身宮於子或午。主大器晚成、深藏不露,歷練後光華乍現,宜專業深耕。',
    test: (a) => soulAndBody(a).some((p) => ['子', '午'].includes(branch(a, p)) && has(a, p, '巨門')),
  },
  {
    name: '梁馬飄蕩格',
    kind: 'inauspicious',
    desc: '天梁與天馬同守命宮或身宮。主好動愛遊、居處與工作變動多;宜把流動轉為優勢,如外勤、旅遊、跨地域工作,並建立穩定的生活據點。',
    test: (a) => soulAndBody(a).some((p) => hasAll(a, p, ['天梁', '天馬'])),
  },
  {
    name: '陽梁昌祿格',
    kind: 'auspicious',
    desc: '太陽、天梁、文昌、祿存齊會命宮三方四正。古云「臚傳第一名」,主利考試、證照與學術,適合以專業資格立身。',
    test: (a) => surHasAll(a, S(a), ['太陽', '天梁', '文昌', '祿存']),
  },
  {
    name: '殺破狼格',
    kind: 'neutral',
    desc: '七殺、破軍、貪狼之一坐命宮或身宮,三星會於三方四正。主人生起伏變動大、開創力強,宜在變動中求發展,忌守成;成敗皆烈。',
    test: (a) => soulAndBody(a).some((p) => hasAny(a, p, SPL) && surHasAll(a, p, SPL)),
  },
  {
    name: '七殺朝斗格',
    kind: 'auspicious',
    desc: '七殺守命於子、午、寅、申(寅子稱仰斗、午申稱朝斗)。主有魄力與執行力,能承擔重任,利在制度內擔當要職。',
    test: (a) => ['子', '午', '寅', '申'].includes(branch(a, S(a))) && has(a, S(a), '七殺'),
  },
  {
    name: '英星入廟格',
    kind: 'auspicious',
    desc: '破軍守命於子或午(破軍入廟)。主破舊立新、敢作敢為,在改革與開創中較易有建樹。',
    test: (a) => ['子', '午'].includes(branch(a, S(a))) && has(a, S(a), '破軍'),
  },
  {
    name: '眾水朝東格',
    kind: 'neutral',
    desc: '破軍與文曲同守命宮於寅或卯。主才思奔放、情感豐富,宜把創意落到具體作品,做事先訂計畫,避免來去匆匆。',
    test: (a) => ['寅', '卯'].includes(branch(a, S(a))) && hasAll(a, S(a), ['破軍', '文曲']),
  },
  // 祿存與四化系
  {
    name: '三奇加會格',
    kind: 'auspicious',
    desc: '化祿、化權、化科三奇會於命宮三方四正。主志向弘遠、機運佳,多貴人之助。(此格《全書》無載,為後世通行說法。)',
    test: (a) => ['祿', '權', '科'].every((m) => surHasMutagen(a, S(a), m)),
  },
  {
    name: '權祿巡逢格',
    kind: 'auspicious',
    desc: '化祿(或祿存)與化權同會命宮。主有專業能力兼經商智謀,朝專業方向研發創新可有大成就(需無煞,逢煞則虛有其表)。',
    test: (a) => {
      const s = S(a);
      return (surHasMutagen(a, s, '祿') || inSur(a, s, '祿存') >= 0) && surHasMutagen(a, s, '權');
    },
  },
  {
    name: '雙祿朝垣格',
    kind: 'auspicious',
    desc: '祿存與化祿並會命宮,雙祿交流。主財源較多元、福澤綿長。',
    test: (a) => inSur(a, S(a), '祿存') >= 0 && surHasMutagen(a, S(a), '祿'),
  },
  {
    name: '祿馬交馳格',
    kind: 'auspicious',
    desc: '祿存與天馬同宮,或同會命宮三方四正。祿主財、馬主動,主動中得財,利外出發展、跨地域與流通型事業。',
    test: (a) =>
      a.palaces.some((_, i) => hasAll(a, i, ['祿存', '天馬'])) ||
      surHasAll(a, S(a), ['祿存', '天馬']),
  },
  {
    name: '祿合鴛鴦格',
    kind: 'auspicious',
    desc: '命宮祿存與化祿成雙(同宮,或命遷對拱)。古云「一世榮」,主財源穩定、福祿雙全。',
    test: (a) => {
      const s = S(a);
      const o = opp(s);
      const cun = has(a, s, '祿存');
      const hua = hasMutagen(a, s, '祿');
      return (cun && hua) || (cun && hasMutagen(a, o, '祿')) || (hua && has(a, o, '祿存'));
    },
  },
  {
    name: '明祿暗祿格',
    kind: 'auspicious',
    desc: '命宮有祿存(或化祿),暗合宮又有化祿(或祿存)。明暗雙祿,主有明面收入之外的暗中助力與財源。',
    test: (a) => {
      const s = S(a);
      const h = hidden(s);
      return (has(a, s, '祿存') && hasMutagen(a, h, '祿')) || (hasMutagen(a, s, '祿') && has(a, h, '祿存'));
    },
  },
  {
    name: '祿馬佩印格',
    kind: 'auspicious',
    desc: '祿存、天馬、天相三星同宮。財、動、印信相合,主因職權或專業而得財,利管理與跨地域事務。',
    test: (a) => a.palaces.some((_, i) => hasAll(a, i, ['祿存', '天馬', '天相'])),
  },
  {
    name: '兩重華蓋格',
    kind: 'neutral',
    desc: '命宮祿存、化祿雙祿坐守又遇空曜。財祿逢空,主重精神而輕物質,利宗教、哲學、藝術與研究,物質規劃宜留餘裕。',
    test: (a) => {
      const s = S(a);
      return has(a, s, '祿存') && hasMutagen(a, s, '祿') && hasAny(a, s, ['地空', '地劫', ...KONG_YAO_EXTRA]);
    },
  },
  {
    name: '權祿生逢格',
    kind: 'auspicious',
    desc: '化權、化祿同守命宮,且兩星皆廟旺。主權柄與財祿兼得,做事有主導權、能把能力化為收入。',
    test: (a) => {
      const s = S(a);
      const q = mutagenStar(a, s, '權');
      const l = mutagenStar(a, s, '祿');
      return !!q && !!l && BRIGHT.includes(String(q.brightness ?? '')) && BRIGHT.includes(String(l.brightness ?? ''));
    },
  },
  {
    name: '科明暗祿格',
    kind: 'auspicious',
    desc: '化科守命宮,暗合宮有祿存(一說化祿亦可)。主名聲在外、暗有財源,以專業口碑帶來收入。',
    test: (a) => {
      const s = S(a);
      const h = hidden(s);
      return hasMutagen(a, s, '科') && (has(a, h, '祿存') || hasMutagen(a, h, '祿'));
    },
  },
  {
    name: '科權祿夾格',
    kind: 'auspicious',
    desc: '化祿、化權、化科其中兩化分居命宮兩側相夾。古稱夾貴,主得周遭環境與人脈扶持。',
    test: (a) => {
      const s = S(a);
      const trio = ['祿', '權', '科'];
      return trio.some((x) =>
        trio.some((y) => x !== y && hasMutagen(a, s - 1, x) && hasMutagen(a, s + 1, y)),
      );
    },
  },
  {
    name: '甲第登庸格',
    kind: 'auspicious',
    desc: '化科守命宮,化權在遷移或三合宮朝拱(再會祿更佳)。主利考試、升遷與專業資格,學以致用。',
    test: (a) => {
      const s = S(a);
      return hasMutagen(a, s, '科') && [opp(s), s + 4, s + 8].some((p) => hasMutagen(a, p, '權'));
    },
  },
  // 輔弼、昌曲、魁鉞、羊陀、空劫系
  {
    name: '羊陀夾命格',
    kind: 'inauspicious',
    desc: '擎羊、陀羅分居命宮兩側相夾(命宮必坐祿存)。主有資源卻易受周遭壓力牽制,宜穩守步調、避免與人硬碰。(此格《全書》無載,為後世說法。)',
    test: (a) => {
      const s = S(a);
      return has(a, s - 1, '陀羅') && has(a, s + 1, '擎羊');
    },
  },
  {
    name: '馬頭帶箭格',
    kind: 'auspicious',
    desc: '命宮在午,擎羊同宮,且天同太陰同守(或貪狼化祿同宮)。古云「鎮御邊疆,富且貴」,主在壓力與競爭中歷練成就。',
    test: (a) => {
      const s = S(a);
      if (branch(a, s) !== '午' || !has(a, s, '擎羊')) return false;
      return tongYin(a, s) || find(a, s, '貪狼')?.mutagen === '祿';
    },
  },
  {
    name: '左右同宮格',
    kind: 'auspicious',
    desc: '左輔、右弼同坐命宮或身宮。主較易得貴人扶持,人緣佳、易成事。',
    test: (a) => soulAndBody(a).some((p) => hasAll(a, p, ['左輔', '右弼'])),
  },
  {
    name: '左右夾命格',
    kind: 'auspicious',
    desc: '左輔、右弼分居命宮兩側相夾。主身邊多助手與同伴,團隊合作得力。',
    test: (a) => jia(a, S(a), '左輔', '右弼'),
  },
  {
    name: '輔弼拱主格',
    kind: 'auspicious',
    desc: '紫微守命,左輔、右弼會於三方四正或兩側相夾。如君得賢臣,主貴顯有助力,成就大事。',
    test: (a) => {
      const s = S(a);
      return has(a, s, '紫微') && (surHasAll(a, s, ['左輔', '右弼']) || jia(a, s, '左輔', '右弼'));
    },
  },
  {
    name: '魁鉞夾命格',
    kind: 'auspicious',
    desc: '天魁、天鉞分居命宮兩側相夾。主關鍵時刻有貴人出手,遇難有解。',
    test: (a) => jia(a, S(a), '天魁', '天鉞'),
  },
  {
    name: '坐貴向貴格',
    kind: 'auspicious',
    desc: '天魁、天鉞一坐命宮、一在遷移宮相對。主遇困難時較易有轉機,常得貴人提攜,關鍵時刻有助力。',
    test: (a) => {
      const s = S(a);
      const o = opp(s);
      return (has(a, s, '天魁') && has(a, o, '天鉞')) || (has(a, s, '天鉞') && has(a, o, '天魁'));
    },
  },
  {
    name: '劫空夾命格',
    kind: 'inauspicious',
    desc: '地劫、地空分居命宮兩側相夾。主計畫易有落空,宜預留彈性與後路,把精力放在可累積的專業上。',
    test: (a) => jia(a, S(a), '地劫', '地空'),
  },
  {
    name: '祿逢兩殺格',
    kind: 'inauspicious',
    desc: '祿存與空亡星同守命宮,三方四正又見地空或地劫。財祿受空,主資源不易累積,宜重視長期累積而非一次到位。',
    test: (a) => {
      const s = S(a);
      return has(a, s, '祿存') && hasAny(a, s, KONG_WANG) && surHasAny(a, s, ['地空', '地劫']);
    },
  },
  {
    name: '文貴文華格',
    kind: 'auspicious',
    desc: '文昌、文曲同坐命宮、身宮或命宮三方四正之一宮。主文采與學養出眾,利文教與創作。(此格《全書》無此名,為後世說法。)',
    test: (a) => {
      const cands = new Set([...soulAndBody(a), ...surround(S(a))]);
      return [...cands].some((p) => hasAll(a, p, ['文昌', '文曲']));
    },
  },
  {
    name: '文星朝命格',
    kind: 'auspicious',
    desc: '文昌、文曲會照命宮三方四正。主聰明多學、文采斐然,利考試、學術、文化事業,氣質出眾;三方見煞忌則效力稍減。',
    test: (a) => surHasAll(a, S(a), ['文昌', '文曲']),
  },
  {
    name: '昌曲夾命格',
    kind: 'auspicious',
    desc: '文昌、文曲分居命宮兩側相夾。主身處書香或專業環境,學習資源豐富,利考試與文職。',
    test: (a) => jia(a, S(a), '文昌', '文曲'),
  },
  {
    name: '文星暗拱格',
    kind: 'auspicious',
    desc: '文昌、文曲夾命,或同坐遷移宮正照命宮。主才學得外界賞識,利考試登科。',
    // 刻意不收 x-iztro 的 surround 口徑(昌曲皆見三方四正):條件與文星朝命格完全相同,收了只會同盤重報。
    test: (a) => {
      const s = S(a);
      return jia(a, s, '文昌', '文曲') || hasAll(a, opp(s), ['文昌', '文曲']);
    },
  },
  // 本站原有、x-iztro 未收
  {
    name: '命裡逢空格',
    kind: 'inauspicious',
    desc: '地空、地劫(或天空、截空)坐命。主想法跳脫不羈、易半途而廢或財來財去,需腳踏實地、按部就班;宜走思想/宗教/研究方向發揮。',
    test: (a) => hasAny(a, S(a), ['地空', '地劫', '天空', '截空']),
  },
  {
    name: '天梁拱月格',
    kind: 'inauspicious',
    desc: '太陰、天梁居陷會煞而無吉解。主辛勞而成就有限、不易聚財、漂泊在外,需修身立業、廣結善緣以轉運。',
    test: (a) => {
      const s = S(a);
      const m = inSur(a, s, '太陰');
      return m >= 0 && !brightIn(a, m, '太陰', BRIGHT) && surHasAll(a, s, ['天梁', '太陰']) &&
        surHasAny(a, s, ['擎羊', '陀羅', '火星', '鈴星', '地空', '地劫']);
    },
  },
];

/** 全部格局名稱(供測試與文件對照)。 */
export const PATTERN_NAMES: readonly string[] = RULES.map((r) => r.name);

/** 比對命盤,回傳所有命中的格局(吉格在前)。 */
export function detectPatterns(astro: IFunctionalAstrolabe): ZiweiPattern[] {
  const matched: ZiweiPattern[] = [];
  for (const r of RULES) {
    let hit = false;
    try {
      hit = r.test(astro);
    } catch {
      hit = false; // 偵測失敗視為不命中,不可讓單一規則炸掉整盤
    }
    if (hit) matched.push({ name: r.name, kind: r.kind, desc: r.desc });
  }
  const order: Record<PatternKind, number> = { auspicious: 0, neutral: 1, inauspicious: 2 };
  return matched.sort((x, y) => order[x.kind] - order[y.kind]);
}
