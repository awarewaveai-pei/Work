'use client';

import { useState } from 'react';
import BirthForm from '@/components/BirthForm';
import AiReading from '@/components/AiReading';
import { computeBazi, type BaziResult } from '@/lib/bazi';
import { toContext } from '@/lib/divination/systems/bazi';
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
                <div style={{ fontSize: '0.7rem', color: 'var(--text-caption)', marginTop: '0.25rem' }}>
                  {t.naYin}：{p.naYin}
                </div>
              </div>
            ))}
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
