'use client';

import type { ChartResult } from '@/lib/ziwei';
import type { Dictionary } from '@/lib/i18n/dictionaries';

/** 地支 -> 4x4 命盤格座標 (傳統紫微盤固定方位)
 *  巳 午 未 申
 *  辰 [中] [中] 酉
 *  卯 [中] [中] 戌
 *  寅 丑 子 亥
 */
const BRANCH_POS: Record<string, { row: number; col: number }> = {
  巳: { row: 1, col: 1 }, 午: { row: 1, col: 2 }, 未: { row: 1, col: 3 }, 申: { row: 1, col: 4 },
  辰: { row: 2, col: 1 }, 酉: { row: 2, col: 4 },
  卯: { row: 3, col: 1 }, 戌: { row: 3, col: 4 },
  寅: { row: 4, col: 1 }, 丑: { row: 4, col: 2 }, 子: { row: 4, col: 3 }, 亥: { row: 4, col: 4 },
};

const MUTAGEN_CLASS: Record<string, string> = {
  祿: 'mutagen-lu',
  權: 'mutagen-quan',
  科: 'mutagen-ke',
  忌: 'mutagen-ji',
};

function StarTag({ name, brightness, mutagen, kind }: {
  name: string; brightness?: string; mutagen?: string; kind: 'major' | 'minor' | 'adj';
}) {
  const cls =
    kind === 'major' ? 'star-major' :
    kind === 'minor' ? 'star-minor' :
    'star-adj';

  return (
    <span className={`inline-flex items-baseline gap-0.5 ${cls}`}>
      <span>{name}</span>
      {brightness ? (
        <span style={{ fontSize: '0.55rem', color: 'var(--text-caption)' }}>{brightness}</span>
      ) : null}
      {mutagen ? (
        <span className={`${MUTAGEN_CLASS[mutagen] ?? ''}`} style={{ fontSize: '0.6rem', fontWeight: 700 }}>
          {mutagen}
        </span>
      ) : null}
    </span>
  );
}

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
    <div className="mx-auto w-full max-w-4xl">
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
              {/* Stars area */}
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '2px 4px',
                  lineHeight: 1.3,
                }}
              >
                {p.majorStars.map((s) => (
                  <StarTag key={s.name} name={s.name} brightness={s.brightness} mutagen={s.mutagen} kind="major" />
                ))}
                {p.minorStars.map((s) => (
                  <StarTag key={s.name} name={s.name} brightness={s.brightness} mutagen={s.mutagen} kind="minor" />
                ))}
                {p.adjectiveStars.map((s) => (
                  <StarTag key={s.name} name={s.name} kind="adj" />
                ))}
              </div>

              {/* Palace info */}
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: '0.25rem' }}>
                <div className="palace-decade">
                  {p.decadal?.range ? `${p.decadal.range[0]}–${p.decadal.range[1]}` : ''}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '3px' }}>
                    {p.isBodyPalace ? (
                      <span className="body-badge">{t.bodyBadge}</span>
                    ) : null}
                    <span className="palace-name">{p.name}</span>
                  </div>
                  <div className="palace-stem">
                    {p.heavenlyStem}{p.earthlyBranch}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* 中宮：命主資訊 */}
        <div
          className="ziwei-center"
          style={{ gridColumn: '2 / span 2', gridRow: '2 / span 2' }}
        >
          <div
            style={{
              fontSize: '0.8125rem',
              fontWeight: 700,
              color: 'var(--text-heading)',
              fontFamily: "var(--font-noto-serif-tc), 'PingFang TC', serif",
            }}
          >
            {t.soulInfo}
          </div>
          <dl
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto auto',
              gap: '2px 8px',
              fontSize: '0.65rem',
              color: 'var(--text-body)',
            }}
          >
            <dt style={{ color: 'var(--text-caption)' }}>{t.solarDate}</dt>
            <dd>{astrolabe.solarDate}</dd>
            <dt style={{ color: 'var(--text-caption)' }}>{t.lunarDate}</dt>
            <dd>{astrolabe.lunarDate}</dd>
            <dt style={{ color: 'var(--text-caption)' }}>{t.fourPillars}</dt>
            <dd>{astrolabe.chineseDate}</dd>
            <dt style={{ color: 'var(--text-caption)' }}>{t.hour}</dt>
            <dd>{astrolabe.time}</dd>
            <dt style={{ color: 'var(--text-caption)' }}>{t.zodiac}</dt>
            <dd>{astrolabe.zodiac}</dd>
            <dt style={{ color: 'var(--text-caption)' }}>{t.sign}</dt>
            <dd>{astrolabe.sign}</dd>
            <dt style={{ color: 'var(--text-caption)' }}>{t.soul}</dt>
            <dd className="text-gold" style={{ textShadow: 'none' }}>{astrolabe.soul}</dd>
            <dt style={{ color: 'var(--text-caption)' }}>{t.body}</dt>
            <dd style={{ color: 'var(--violet-400)' }}>{astrolabe.body}</dd>
            <dt style={{ color: 'var(--text-caption)' }}>{t.fiveElements}</dt>
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
        </div>
      </div>
    </div>
  );
}
