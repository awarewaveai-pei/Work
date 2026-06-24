'use client';

import type { ChartResult } from '@/lib/ziwei';
import type { Dictionary } from '@/lib/i18n/dictionaries';

/** 地支 -> 4x4 命盤格座標 (傳統紫微盤固定方位)
 *  巳 午 未 申
 *  辰 [中] [中] 酉
 *  卯 [中] [中] 戌
 *  寅 丑 子 亥
 *
 *  註:地支 key 為紫微盤固定結構代碼,非顯示字串,故不進 i18n。
 *  星曜名/宮名/命主等「資料」由 iztro 依 locale 在地化 (見 lib/ziwei.ts)。
 */
const BRANCH_POS: Record<string, { row: number; col: number }> = {
  巳: { row: 1, col: 1 }, 午: { row: 1, col: 2 }, 未: { row: 1, col: 3 }, 申: { row: 1, col: 4 },
  辰: { row: 2, col: 1 }, 酉: { row: 2, col: 4 },
  卯: { row: 3, col: 1 }, 戌: { row: 3, col: 4 },
  寅: { row: 4, col: 1 }, 丑: { row: 4, col: 2 }, 子: { row: 4, col: 3 }, 亥: { row: 4, col: 4 },
};

const MUTAGEN_COLOR: Record<string, string> = {
  祿: 'text-emerald-600',
  權: 'text-amber-600',
  科: 'text-sky-600',
  忌: 'text-rose-600',
};

function StarTag({ name, brightness, mutagen, kind }: {
  name: string; brightness?: string; mutagen?: string; kind: 'major' | 'minor' | 'adj';
}) {
  const base =
    kind === 'major'
      ? 'font-semibold text-slate-900'
      : kind === 'minor'
      ? 'text-slate-600'
      : 'text-slate-400 text-[10px]';
  return (
    <span className={`inline-flex items-baseline gap-0.5 ${base}`}>
      <span>{name}</span>
      {brightness ? <span className="text-[9px] text-slate-400">{brightness}</span> : null}
      {mutagen ? (
        <span className={`text-[10px] font-bold ${MUTAGEN_COLOR[mutagen] ?? 'text-slate-500'}`}>
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
      <div className="grid aspect-square grid-cols-4 grid-rows-4 gap-px rounded-lg bg-slate-200 p-px text-xs">
        {astrolabe.palaces.map((p) => {
          const pos = BRANCH_POS[p.earthlyBranch];
          if (!pos) return null;
          return (
            <div
              key={p.index}
              style={{ gridColumn: pos.col, gridRow: pos.row }}
              className="flex flex-col justify-between bg-white p-1.5"
            >
              {/* 星曜區 */}
              <div className="flex flex-wrap gap-x-1.5 gap-y-0.5 leading-tight">
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

              {/* 宮位資訊區 */}
              <div className="mt-1 flex items-end justify-between">
                <div className="text-[10px] text-slate-400">
                  <div>{p.decadal?.range ? `${p.decadal.range[0]}-${p.decadal.range[1]}` : ''}</div>
                </div>
                <div className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {p.isBodyPalace ? (
                      <span className="rounded bg-rose-100 px-1 text-[9px] text-rose-600">{t.bodyBadge}</span>
                    ) : null}
                    <span className="text-sm font-bold text-indigo-700">{p.name}</span>
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {p.heavenlyStem}{p.earthlyBranch}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* 中宮：命主資訊 */}
        <div
          style={{ gridColumn: '2 / span 2', gridRow: '2 / span 2' }}
          className="flex flex-col items-center justify-center gap-1 bg-slate-50 p-3 text-center"
        >
          <div className="text-sm font-bold text-slate-700">{t.soulInfo}</div>
          <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-1 text-[11px] text-slate-600">
            <dt className="text-slate-400">{t.solarDate}</dt>
            <dd>{astrolabe.solarDate}</dd>
            <dt className="text-slate-400">{t.lunarDate}</dt>
            <dd>{astrolabe.lunarDate}</dd>
            <dt className="text-slate-400">{t.fourPillars}</dt>
            <dd>{astrolabe.chineseDate}</dd>
            <dt className="text-slate-400">{t.hour}</dt>
            <dd>{astrolabe.time}</dd>
            <dt className="text-slate-400">{t.zodiac}</dt>
            <dd>{astrolabe.zodiac}</dd>
            <dt className="text-slate-400">{t.sign}</dt>
            <dd>{astrolabe.sign}</dd>
            <dt className="text-slate-400">{t.soul}</dt>
            <dd>{astrolabe.soul}</dd>
            <dt className="text-slate-400">{t.body}</dt>
            <dd>{astrolabe.body}</dd>
            <dt className="text-slate-400">{t.fiveElements}</dt>
            <dd>{astrolabe.fiveElementsClass}</dd>
          </dl>
          {correction ? (
            <p className="mt-1 text-[10px] text-emerald-600">
              {t.trueSolarCorrection} {correction.correctionMinutes >= 0 ? '+' : ''}
              {correction.correctionMinutes} {t.minutesUnit}
            </p>
          ) : (
            <p className="mt-1 text-[10px] text-slate-300">{t.trueSolarOff}</p>
          )}
        </div>
      </div>
    </div>
  );
}
