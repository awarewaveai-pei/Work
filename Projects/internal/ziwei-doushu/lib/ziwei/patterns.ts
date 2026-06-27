import type { IFunctionalAstrolabe } from 'iztro/lib/astro/FunctionalAstrolabe';

/**
 * 紫微格局判定引擎 (頂規)。
 *
 * 用 iztro 的命盤 API(三方四正 surroundedPalaces / 宮內星 palace.has / 廟旺
 *   brightness / 四化 haveMutagen)逐一比對「命格」。確定性、零成本、文化精度 —
 *   競品的招牌功能即此。每個格局含偵測條件 + 古典解說。
 *
 * 命格分吉/凶/中;偵測保守(寧缺勿錯),條件以命宮(及其三方四正)為主。
 */

export type PatternKind = 'auspicious' | 'inauspicious' | 'neutral';

export interface ZiweiPattern {
  name: string;
  kind: PatternKind;
  desc: string;
}

const BRIGHT = ['廟', '旺'] as const;
type Bright = (typeof BRIGHT)[number];

interface StarLoc {
  branch: string;
  brightness: string;
  palaceName: string;
}

/** 找某主星所在(地支/廟旺/宮名);找不到回 null。 */
function findStar(
  astro: IFunctionalAstrolabe,
  star: string,
): StarLoc | null {
  for (const p of astro.palaces) {
    const s = p.majorStars.find((x) => x.name === star);
    if (s) {
      return {
        branch: String(p.earthlyBranch),
        brightness: String(s.brightness ?? ''),
        palaceName: String(p.name),
      };
    }
  }
  return null;
}

function isBright(b: string): boolean {
  return (BRIGHT as readonly string[]).includes(b as Bright);
}

/** 命宮宮位物件。 */
function soul(astro: IFunctionalAstrolabe) {
  return astro.palace('命宮');
}
/** 命宮三方四正。 */
function soulSur(astro: IFunctionalAstrolabe) {
  return astro.surroundedPalaces('命宮');
}

type Rule = {
  name: string;
  kind: PatternKind;
  desc: string;
  test: (astro: IFunctionalAstrolabe) => boolean;
};

const RULES: Rule[] = [
  {
    name: '紫府同宮',
    kind: 'auspicious',
    desc: '紫微、天府同坐命宮,帝座與庫星相會,主人雍容尊貴、有領導格局,一生平穩多福,易居要職或自成一家。',
    test: (a) => !!soul(a)?.has(['紫微', '天府']),
  },
  {
    name: '機月同梁格',
    kind: 'auspicious',
    desc: '命宮三方四正會齊天機、太陰、天同、天梁。主有正財、宜公職或大機構穩定發展,智慧、享受、照顧家人兼具,工作與生活平衡。',
    test: (a) => soulSur(a).have(['天機', '太陰', '天同', '天梁']),
  },
  {
    name: '殺破狼格',
    kind: 'neutral',
    desc: '命宮三方四正會七殺、破軍、貪狼。主人生起伏變動大、開創力強,宜在變動中求發展,忌守成;成敗皆烈。',
    test: (a) => soulSur(a).have(['七殺', '破軍', '貪狼']),
  },
  {
    name: '府相朝垣格',
    kind: 'auspicious',
    desc: '天府、天相分會命宮三方。主衣食無憂、財官雙美,為人穩重得人緣,適合穩健經營或任職主管。',
    test: (a) => soulSur(a).have(['天府', '天相']),
  },
  {
    name: '君臣慶會格',
    kind: 'auspicious',
    desc: '紫微坐命且會左輔右弼(或天府天相)之輔佐。如君得賢臣,主貴顯有助力,成就大事。',
    test: (a) =>
      !!soul(a)?.has(['紫微']) &&
      (soulSur(a).have(['左輔', '右弼']) || soulSur(a).have(['天府', '天相'])),
  },
  {
    name: '三奇加會格',
    kind: 'auspicious',
    desc: '化祿、化權、化科三奇會於命宮三方四正。主志向弘遠、運氣極佳,多意外好運與貴人之助,一生能成大業。',
    test: (a) => {
      const s = soulSur(a);
      return s.haveMutagen('祿') && s.haveMutagen('權') && s.haveMutagen('科');
    },
  },
  {
    name: '權祿巡逢格',
    kind: 'auspicious',
    desc: '化祿(或祿存)與化權同會命宮。主有專業能力兼經商智謀,朝專業方向研發創新可有大成就(需無煞,逢煞則虛有其表)。',
    test: (a) => {
      const s = soulSur(a);
      return (s.haveMutagen('祿') || s.have(['祿存'])) && s.haveMutagen('權');
    },
  },
  {
    name: '雙祿朝垣格',
    kind: 'auspicious',
    desc: '祿存與化祿並會命宮,雙祿交流。主財源豐厚、福澤綿長,一生少缺財,富而有餘。',
    test: (a) => soulSur(a).have(['祿存']) && soulSur(a).haveMutagen('祿'),
  },
  {
    name: '文星拱命格',
    kind: 'auspicious',
    desc: '文昌、文曲會照命宮。主聰明多學、文采斐然,利考試、學術、文化事業,氣質出眾。',
    test: (a) => soulSur(a).have(['文昌', '文曲']),
  },
  {
    name: '左右同宮格',
    kind: 'auspicious',
    desc: '左輔、右弼同會命宮。主一生多得貴人扶持、助力不斷,人緣佳、易成事。',
    test: (a) => soulSur(a).have(['左輔', '右弼']),
  },
  {
    name: '坐貴向貴格',
    kind: 'auspicious',
    desc: '天魁、天鉞分坐命遷會照。主逢凶化吉、遇難呈祥,一生多貴人提攜,關鍵時刻有助力。',
    test: (a) => soulSur(a).have(['天魁', '天鉞']),
  },
  {
    name: '火貪格',
    kind: 'auspicious',
    desc: '貪狼與火星同會命宮。主橫發資財、機遇突來,行運觸發時可暴起,宜把握良機;然來得快亦需守成。',
    test: (a) => !!soul(a)?.hasOneOf(['貪狼']) && soulSur(a).have(['火星', '貪狼']),
  },
  {
    name: '鈴貪格',
    kind: 'auspicious',
    desc: '貪狼與鈴星同會命宮。同火貪,主意外橫發、際遇突來,利偏財與機遇財。',
    test: (a) => !!soul(a)?.hasOneOf(['貪狼']) && soulSur(a).have(['鈴星', '貪狼']),
  },
  {
    name: '巨機同宮格',
    kind: 'neutral',
    desc: '巨門、天機同會命宮。主口才便給、善分析議論,宜口才/研究/仲介為業;然易有口舌是非,需慎言。',
    test: (a) => !!soul(a)?.has(['巨門', '天機']),
  },
  {
    name: '貪武同行格',
    kind: 'auspicious',
    desc: '貪狼、武曲會照命宮。主中晚年發達、財官並美,先勤後得,宜實業與財經。',
    test: (a) => soulSur(a).have(['貪狼', '武曲']),
  },
  {
    name: '石中隱玉格',
    kind: 'auspicious',
    desc: '巨門坐命於子或午宮。主大器晚成、深藏不露,歷練後光華乍現,宜專業深耕。',
    test: (a) => {
      const m = findStar(a, '巨門');
      return !!m && m.palaceName === '命宮' && (m.branch === '子' || m.branch === '午');
    },
  },
  {
    name: '日麗中天格',
    kind: 'auspicious',
    desc: '太陽於午宮廟旺坐命。主光明磊落、聲名顯赫,事業如日中天,利貴顯與公眾事業。',
    test: (a) => {
      const m = findStar(a, '太陽');
      return !!m && m.palaceName === '命宮' && m.branch === '午' && isBright(m.brightness);
    },
  },
  {
    name: '月朗天門格',
    kind: 'auspicious',
    desc: '太陰於亥宮廟旺坐命。主清秀聰穎、財帛豐盈,溫潤多才,中晚年尤佳。',
    test: (a) => {
      const m = findStar(a, '太陰');
      return !!m && m.palaceName === '命宮' && m.branch === '亥' && isBright(m.brightness);
    },
  },
  {
    name: '日照雷門格',
    kind: 'auspicious',
    desc: '太陽於卯宮旺地坐命。主朝氣勃發、早年得志,積極進取,利開創。',
    test: (a) => {
      const m = findStar(a, '太陽');
      return !!m && m.palaceName === '命宮' && m.branch === '卯' && isBright(m.brightness);
    },
  },
  {
    name: '丹墀桂墀格',
    kind: 'auspicious',
    desc: '太陽、太陰俱廟旺會命(日為丹墀、月為桂墀)。主貴顯昌榮,宜專業領域揚才,特定條件下亦主大富。',
    test: (a) => {
      const sun = findStar(a, '太陽');
      const moon = findStar(a, '太陰');
      return !!sun && !!moon && isBright(sun.brightness) && isBright(moon.brightness) &&
        soulSur(a).have(['太陽', '太陰']);
    },
  },
  {
    name: '命裡逢空格',
    kind: 'inauspicious',
    desc: '地空、地劫(或天空、截空)坐命。主想法跳脫不羈、易半途而廢或財來財去,需腳踏實地、忌投機;宜走思想/宗教/研究化解。',
    test: (a) => !!soul(a)?.hasOneOf(['地空', '地劫', '天空', '截空']),
  },
  {
    name: '天梁拱月格',
    kind: 'inauspicious',
    desc: '太陰、天梁居陷會煞而無吉解。主辛勞而成就有限、不易聚財、漂泊在外,需修身立業、廣結善緣以轉運。',
    test: (a) => {
      const moon = findStar(a, '太陰');
      return !!moon && !isBright(moon.brightness) && soulSur(a).have(['天梁', '太陰']) &&
        soulSur(a).haveOneOf(['擎羊', '陀羅', '火星', '鈴星', '地空', '地劫']);
    },
  },
];

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
