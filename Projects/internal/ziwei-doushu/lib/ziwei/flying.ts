import type { IFunctionalAstrolabe } from 'iztro/lib/astro/FunctionalAstrolabe';
import type { PalaceName } from 'iztro/lib/i18n';

/**
 * 飛宮四化 (頂規)。
 *
 * 用 iztro `palace.mutagedPlaces()`(該宮天干使祿權科忌各飛入哪一宮)+
 *   `palace.selfMutaged()`(自化)確定性推出「源宮化X入目標宮」結構,再配源宮×化曜
 *   的意涵短語。依生命領域(財富/事業/婚姻/健康/人際)分類,如競品。
 */

type Mutagen = '祿' | '權' | '科' | '忌';
const MUTAGENS: Mutagen[] = ['祿', '權', '科', '忌'];

export interface FlyingStatement {
  domain: string;
  /** 「財帛宮化祿入官祿宮」 */
  flow: string;
  /** 意涵短語 */
  meaning: string;
}

/** 主要源宮 → 生命領域 + 每化的意涵骨架(入目標宮時附目標宮)。 */
const SOURCE: Record<
  string,
  { domain: string; phrase: Record<Mutagen, string> }
> = {
  財帛: {
    domain: '財富',
    phrase: {
      祿: '財源順遂、進財輕鬆,理財有道',
      權: '對錢財掌控慾強、宜自掌財權或獨資',
      科: '財務平穩、量入為出,賺錢不傷神',
      忌: '為財操勞、易破耗,理財需謹慎',
    },
  },
  官祿: {
    domain: '事業',
    phrase: {
      祿: '事業順遂、財官得意,機會多',
      權: '事業企圖心強、能掌實權,宜創業或主管',
      科: '事業有名聲、貴人助,發展平順',
      忌: '工作易變動或不順,需防是非耗神',
    },
  },
  夫妻: {
    domain: '婚姻',
    phrase: {
      祿: '夫妻緣早、感情和睦,配偶有助',
      權: '配偶個性強、家中較有主導權',
      科: '夫妻感情佳、相互體諒扶持',
      忌: '感情易有波折爭執,需用心經營溝通',
    },
  },
  疾厄: {
    domain: '健康',
    phrase: {
      祿: '身體底子佳、少病少災',
      權: '較勞心、責任重,注意操勞傷身',
      科: '健康平穩、有調養之道',
      忌: '需注意慢性或反覆之症,作息宜規律',
    },
  },
  遷移: {
    domain: '人際/外出',
    phrase: {
      祿: '在外機會多、人緣佳、出門近貴',
      權: '在外能掌局面、活躍奔波',
      科: '外出有貴人、聲名佳',
      忌: '在外較奔波或不順,需防小人是非',
    },
  },
  命宮: {
    domain: '本命',
    phrase: {
      祿: '一生福澤所鍾、性樂觀得助',
      權: '個性強勢有主見、能掌握人生',
      科: '氣質清貴、重名聲',
      忌: '個性執著、易自尋煩惱,需放寬心',
    },
  },
};

/** 宮名加「宮」字,但避免「命宮」→「命宮宮」之類重複(命宮/福德等已不需,但 iztro
 *  宮名多為二字如「財帛」需補;此處只在未以「宮」結尾時補)。 */
function pn(name: string): string {
  return name.endsWith('宮') ? name : `${name}宮`;
}

export function analyzeFlying(astro: IFunctionalAstrolabe): FlyingStatement[] {
  const out: FlyingStatement[] = [];

  for (const sourceName of Object.keys(SOURCE)) {
    const src = astro.palace(sourceName as PalaceName);
    if (!src) continue;
    const cfg = SOURCE[sourceName];

    // 自化
    for (const m of MUTAGENS) {
      try {
        if (src.selfMutaged(m)) {
          out.push({
            domain: cfg.domain,
            flow: `${pn(sourceName)}自化${m}`,
            meaning: `${cfg.phrase[m]}(力量回歸自身,起伏更明顯)`,
          });
        }
      } catch {
        /* 跳過 */
      }
    }

    // 化入他宮:mutagedPlaces() → [祿宮, 權宮, 科宮, 忌宮]
    let targets: (ReturnType<typeof astro.palace> | undefined)[] = [];
    try {
      targets = src.mutagedPlaces();
    } catch {
      targets = [];
    }
    targets.forEach((tp, i) => {
      if (!tp) return;
      const m = MUTAGENS[i];
      const targetName = String(tp.name);
      if (targetName === sourceName) return; // 自化已處理
      out.push({
        domain: cfg.domain,
        flow: `${pn(sourceName)}化${m}入${pn(targetName)}`,
        meaning: cfg.phrase[m],
      });
    });
  }

  return out;
}
