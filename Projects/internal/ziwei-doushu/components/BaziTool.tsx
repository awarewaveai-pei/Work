'use client';

import { useState } from 'react';
import BirthForm from '@/components/BirthForm';
import AiReading from '@/components/AiReading';
import { computeBazi, type BaziResult } from '@/lib/bazi';
import { toContext } from '@/lib/divination/systems/bazi';
import { relationTerm, type PillarPosition } from '@/lib/baziRelations';
import type { ChartRequest } from '@/lib/ziwei';
import type { Locale } from '@/lib/i18n/config';
import type { Dictionary } from '@/lib/i18n/dictionaries';

export default function BaziTool({ dict, locale }: { dict: Dictionary; locale: Locale }) {
  const [result, setResult] = useState<BaziResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const t = dict.bazi;

  function handleSubmit(req: ChartRequest) {
    try {
      setError(null);
      setResult(computeBazi({ ...req, locale }));
    } catch {
      setResult(null);
      setError(dict.errors.computeFailed);
    }
  }

  const fill = (tpl: string, v: Record<string, number>) =>
    tpl.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k]));
  const posLabel: Record<PillarPosition, string> = {
    year: t.yearPillar, month: t.monthPillar, day: t.dayPillar, hour: t.hourPillar,
  };
  const where = (ps: PillarPosition[]) => ps.map((x) => posLabel[x]).join(' · ');

  const pillars = result
    ? ([
        [t.yearPillar, result.pillars.year],
        [t.monthPillar, result.pillars.month],
        [t.dayPillar, result.pillars.day],
        [t.hourPillar, result.pillars.hour],
      ] as const)
    : [];

  return (
    <>
      <BirthForm dict={dict} onSubmit={handleSubmit} />
      <p className="mt-3 text-center" style={{ fontSize: '0.75rem', color: 'var(--text-caption)' }}>
        {t.method}
      </p>

      {error ? (
        <div className="error-banner mt-6">{error}</div>
      ) : null}

      {result ? (
        <section className="mt-8">
          <hr className="star-divider" />

          {/* Day master summary */}
          <div
            className="glass-card p-4 mb-5 flex justify-center gap-8 text-sm"
          >
            <span>
              <span style={{ color: 'var(--text-caption)' }}>{t.dayMaster}　</span>
              <span
                style={{
                  fontWeight: 700,
                  color: 'var(--gold-400)',
                  textShadow: '0 0 10px var(--gold-glow)',
                  fontSize: '1.125rem',
                  fontFamily: "var(--font-noto-serif-tc), 'PingFang TC', serif",
                }}
              >
                {result.dayMaster}
              </span>
            </span>
            <span>
              <span style={{ color: 'var(--text-caption)' }}>{t.zodiac}　</span>
              <span style={{ color: 'var(--text-heading)' }}>{result.zodiac}</span>
            </span>
          </div>

          {/* 喜用神 / 格局(扶抑法) */}
          <div className="glass-card p-4 mb-5 flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm">
            <span>
              <span style={{ color: 'var(--text-caption)' }}>{t.pattern}　</span>
              <span style={{ color: 'var(--gold-400)' }}>{result.analysis.pattern}</span>
            </span>
            <span>
              <span style={{ color: 'var(--text-caption)' }}>{t.strength}　</span>
              <span style={{ color: 'var(--text-heading)' }}>{result.analysis.strength}</span>
            </span>
            <span>
              <span style={{ color: 'var(--text-caption)' }}>{t.favorable}　</span>
              <span style={{ color: 'var(--jade-400)', fontWeight: 600 }}>
                {result.analysis.favorable.join('、')}
              </span>
            </span>
            <span>
              <span style={{ color: 'var(--text-caption)' }}>{t.avoid}　</span>
              <span style={{ color: 'var(--rose-400)' }}>
                {result.analysis.avoid.join('、')}
              </span>
            </span>
          </div>

          {/* Four pillars */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {pillars.map(([label, p]) => (
              <div key={label} className="glass-card p-4 text-center">
                <div style={{ fontSize: '0.75rem', color: 'var(--text-caption)', marginBottom: '0.5rem' }}>
                  {label}
                </div>
                <div
                  style={{
                    fontSize: '1.75rem',
                    fontWeight: 700,
                    color: 'var(--gold-400)',
                    textShadow: '0 0 12px var(--gold-glow)',
                    fontFamily: "var(--font-noto-serif-tc), 'PingFang TC', serif",
                    lineHeight: 1.2,
                    marginBottom: '0.5rem',
                  }}
                >
                  {p.ganZhi}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-body)' }}>
                  {t.shiShen}：{p.shiShen}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-body)' }}>
                  {t.hiddenStems}：{p.hiddenStems.join(' ')}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-body)' }}>
                  {t.diShi}：{p.diShi}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-caption)', marginTop: '0.25rem' }}>
                  {t.naYin}：{p.naYin}
                </div>
              </div>
            ))}
          </div>

          <p className="mt-3 text-center" style={{ fontSize: '0.75rem', color: 'var(--text-caption)' }}>
            {t.xunKong}：<span style={{ color: 'var(--text-heading)' }}>{result.xunKong}</span>
          </p>

          {/* 大運(八步,標出目前這步)+ 今年流年 */}
          <div className="glass-card p-4 mt-5">
            <div className="flex flex-wrap justify-between gap-2 mb-3 text-sm">
              <span style={{ color: 'var(--text-heading)', fontWeight: 600 }}>
                {t.luckTitle}
                <span style={{ color: 'var(--text-caption)', fontWeight: 400 }}>
                  　{result.luck.forward ? t.luckForward : t.luckBackward} ·{' '}
                  {fill(t.luckStart, { y: result.luck.start.years, m: result.luck.start.months, d: result.luck.start.days })}
                </span>
              </span>
              <span>
                <span style={{ color: 'var(--text-caption)' }}>{t.liuNian}　</span>
                <span style={{ color: 'var(--gold-400)' }}>
                  {result.luck.liuNian.year} {result.luck.liuNian.ganZhi}
                </span>
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
              {result.luck.steps.map((s, i) => {
                const current = i === result.luck.currentIndex;
                return (
                  <div
                    key={s.startYear}
                    className="text-center"
                    aria-current={current ? 'true' : undefined}
                    style={{
                      padding: '0.5rem 0.25rem',
                      borderRadius: '0.5rem',
                      border: `1px solid ${current ? 'var(--gold-400)' : 'transparent'}`,
                      boxShadow: current ? '0 0 10px var(--gold-glow)' : undefined,
                    }}
                  >
                    <div
                      style={{
                        fontSize: '1.125rem',
                        fontWeight: 700,
                        color: current ? 'var(--gold-400)' : 'var(--text-heading)',
                        fontFamily: "var(--font-noto-serif-tc), 'PingFang TC', serif",
                      }}
                    >
                      {s.ganZhi}
                    </div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-caption)' }}>
                      {fill(t.luckAges, { a: s.startAge, b: s.endAge })}
                    </div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-caption)' }}>
                      {s.startYear}–{s.endYear}
                    </div>
                  </div>
                );
              })}
            </div>
            {result.luck.currentIndex === null ? (
              <p className="mt-2 text-center" style={{ fontSize: '0.75rem', color: 'var(--text-caption)' }}>
                {t.luckOutside}
              </p>
            ) : null}
          </div>

          {/* 合沖刑害 / 神煞 */}
          <div className="grid gap-3 mt-5 sm:grid-cols-2">
            <div className="glass-card p-4 text-sm">
              <div style={{ color: 'var(--text-heading)', fontWeight: 600, marginBottom: '0.5rem' }}>
                {t.relationsTitle}
              </div>
              {result.relations.length === 0 ? (
                <p style={{ color: 'var(--text-caption)' }}>{t.relationsNone}</p>
              ) : (
                <ul className="space-y-1">
                  {result.relations.map((r) => (
                    <li key={`${r.kind}-${r.positions.join('')}-${r.chars.join('')}`}>
                      <span style={{ color: 'var(--text-caption)' }}>{t.relationKinds[r.kind]}　</span>
                      <span style={{ color: 'var(--gold-400)' }}>{relationTerm(r)}</span>
                      <span style={{ color: 'var(--text-caption)' }}>　{where(r.positions)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="glass-card p-4 text-sm">
              <div style={{ color: 'var(--text-heading)', fontWeight: 600, marginBottom: '0.5rem' }}>
                {t.shenshaTitle}
              </div>
              {result.shensha.length === 0 ? (
                <p style={{ color: 'var(--text-caption)' }}>{t.shenshaNone}</p>
              ) : (
                <ul className="space-y-1">
                  {result.shensha.map((s) => (
                    <li key={s.id} title={`${s.basis} · ${s.source}`}>
                      <span style={{ color: 'var(--gold-400)' }}>{t.shenshaNames[s.id]}</span>
                      <span style={{ color: 'var(--text-caption)' }}>　{where(s.positions)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2" style={{ fontSize: '0.7rem', color: 'var(--text-caption)' }}>
                {t.shenshaNote}
              </p>
            </div>
          </div>

          {result.correction ? (
            <p
              className="mt-4 text-center"
              style={{ fontSize: '0.75rem', color: 'var(--jade-400)' }}
            >
              {dict.chart.trueSolarCorrection}{' '}
              {result.correction.correctionMinutes >= 0 ? '+' : ''}
              {result.correction.correctionMinutes} {dict.chart.minutesUnit}
            </p>
          ) : null}

          <AiReading context={toContext(result, locale)} ai={dict.ai} />
        </section>
      ) : null}
    </>
  );
}
