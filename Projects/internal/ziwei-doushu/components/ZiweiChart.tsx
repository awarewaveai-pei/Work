'use client';

import type { ChartResult } from '@/lib/ziwei';
import BirthZoneNote from '@/components/BirthZoneNote';
import type { Dictionary } from '@/lib/i18n/dictionaries';

/** 地支 -> 4x4 命盤格座標 (傳統紫微盤固定方位)
 *  巳 午 未 申
 *  辰 [中] [中] 酉
 *  卯 [中] [中] 戌
 *  寅 丑 子 亥
 */
const ZH_POS: Record<string, { row: number; col: number }> = {
  巳: { row: 1, col: 1 }, 午: { row: 1, col: 2 }, 未: { row: 1, col: 3 }, 申: { row: 1, col: 4 },
  辰: { row: 2, col: 1 }, 酉: { row: 2, col: 4 },
  卯: { row: 3, col: 1 }, 戌: { row: 3, col: 4 },
  寅: { row: 4, col: 1 }, 丑: { row: 4, col: 2 }, 子: { row: 4, col: 3 }, 亥: { row: 4, col: 4 },
};
/** iztro 英文盤的地支是拼音(午 = woo);只查中文鍵時英文盤十二宮全部不顯示。 */
const EN_BRANCH: Record<string, string> = {
  si: '巳', woo: '午', wei: '未', shen: '申', chen: '辰', you: '酉',
  mao: '卯', xu: '戌', yin: '寅', chou: '丑', zi: '子', hai: '亥',
};
const BRANCH_POS: Record<string, { row: number; col: number }> = {
  ...ZH_POS,
  ...Object.fromEntries(Object.entries(EN_BRANCH).map(([en, zh]) => [en, ZH_POS[zh]])),
};

const MUTAGEN_CLASS: Record<string, string> = {
  祿: 'mutagen-lu',
  權: 'mutagen-quan',
  科: 'mutagen-ke',
  忌: 'mutagen-ji',
  // iztro 英文盤四化:A 祿、B 權、C 科、D 忌
  A: 'mutagen-lu',
  B: 'mutagen-quan',
  C: 'mutagen-ke',
  D: 'mutagen-ji',
};

function StarTag({ name, brightness, mutagen, kind }: {
  name: string; brightness?: string; mutagen?: string; kind: 'major' | 'minor' | 'adj';
}) {
  const cls =
    kind === 'major' ? 'star-major' :
    kind === 'minor' ? 'star-minor' :
    'star-adj';

  return (
    <span className={`star-tag ${cls}`}>
      <span>{name}</span>
      {brightness ? <span className="star-brightness">{brightness}</span> : null}
      {mutagen ? <span className={`star-mutagen ${MUTAGEN_CLASS[mutagen] ?? ''}`}>{mutagen}</span> : null}
    </span>
  );
}

/**
 * 命盤大小由內容決定(不是容器寬度):列高 = 最高那一宮的內容,整張盤在桌機一個畫面內看完。
 * 宮內分三層:主星(大)/ 輔星(中)/ 雜曜(小),底列 大限|身・宮名・干支。窄寬度的字級在 globals.css 的 @container。
 */
export default function ZiweiChart({
  result,
  dict,
}: {
  result: ChartResult;
  dict: Dictionary;
}) {
  const { astrolabe, correction } = result;
  const t = dict.chart;

  return (
    <div className="ziwei-chart mx-auto w-full max-w-4xl" data-ziwei-chart>
      <div className="ziwei-grid">
        {astrolabe.palaces.map((p) => {
          const pos = BRANCH_POS[p.earthlyBranch];
          if (!pos) return null;
          return (
            <div
              key={p.index}
              className="ziwei-palace"
              style={{ gridColumn: pos.col, gridRow: pos.row }}
            >
              {p.majorStars.length ? (
                <div className="palace-stars">
                  {p.majorStars.map((s) => (
                    <StarTag key={s.name} name={s.name} brightness={s.brightness} mutagen={s.mutagen} kind="major" />
                  ))}
                </div>
              ) : null}
              {p.minorStars.length ? (
                <div className="palace-stars">
                  {p.minorStars.map((s) => (
                    <StarTag key={s.name} name={s.name} brightness={s.brightness} mutagen={s.mutagen} kind="minor" />
                  ))}
                </div>
              ) : null}
              {p.adjectiveStars.length ? (
                <div className="palace-stars palace-stars-adj">
                  {p.adjectiveStars.map((s) => (
                    <StarTag key={s.name} name={s.name} kind="adj" />
                  ))}
                </div>
              ) : null}

              <div className="palace-foot">
                <span className="palace-decade">
                  {p.decadal?.range ? `${p.decadal.range[0]}–${p.decadal.range[1]}` : ''}
                </span>
                <span className="palace-title">
                  {p.isBodyPalace ? <span className="body-badge">{t.bodyBadge}</span> : null}
                  <span className="palace-name">{p.name}</span>
                  <span className="palace-stem">
                    {/* 英文盤干支是拼音(jia woo),中間要空格;中文照舊相連 */}
                    {p.earthlyBranch in EN_BRANCH ? `${p.heavenlyStem} ${p.earthlyBranch}` : `${p.heavenlyStem}${p.earthlyBranch}`}
                  </span>
                </span>
              </div>
            </div>
          );
        })}

        {/* 中宮：命主資訊 */}
        <div className="ziwei-center">
          <div className="ziwei-center-title">{t.soulInfo}</div>
          <dl className="ziwei-center-info">
            <dt>{t.solarDate}</dt>
            <dd>{astrolabe.solarDate}</dd>
            <dt>{t.lunarDate}</dt>
            <dd>{astrolabe.lunarDate}</dd>
            <dt>{t.fourPillars}</dt>
            <dd>{astrolabe.chineseDate}</dd>
            <dt>{t.hour}</dt>
            <dd>{astrolabe.time}</dd>
            <dt>{t.zodiac}</dt>
            <dd>{astrolabe.zodiac}</dd>
            <dt>{t.sign}</dt>
            <dd>{astrolabe.sign}</dd>
            <dt>{t.soul}</dt>
            <dd className="text-gold" style={{ textShadow: 'none' }}>{astrolabe.soul}</dd>
            <dt>{t.body}</dt>
            <dd style={{ color: 'var(--violet-400)' }}>{astrolabe.body}</dd>
            <dt>{t.fiveElements}</dt>
            <dd>{astrolabe.fiveElementsClass}</dd>
          </dl>
          {correction ? (
            <p className="correction-text">
              {t.trueSolarCorrection} {correction.correctionMinutes >= 0 ? '+' : ''}
              {correction.correctionMinutes} {t.minutesUnit}
            </p>
          ) : (
            <p className="no-correction-text">{t.trueSolarOff}</p>
          )}
          <BirthZoneNote zone={result.zone} dict={dict} />
        </div>
      </div>
    </div>
  );
}
