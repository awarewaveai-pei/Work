'use client';

import { useState } from 'react';
import BirthForm from '@/components/BirthForm';
import AiReading from '@/components/AiReading';
import { computeDailyFortune, dailyContext, type DailyFortune } from '@/lib/daily';
import type { ChartRequest } from '@/lib/ziwei';
import type { Locale } from '@/lib/i18n/config';
import type { Dictionary } from '@/lib/i18n/dictionaries';

function GoldStars({ n }: { n: number }) {
  return (
    <span>
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          style={{
            color: i < n ? 'var(--gold-400)' : 'var(--text-dim)',
            textShadow: i < n ? '0 0 6px var(--gold-glow)' : 'none',
            fontSize: '1rem',
          }}
        >
          ★
        </span>
      ))}
    </span>
  );
}

export default function DailyTool({ dict, locale }: { dict: Dictionary; locale: Locale }) {
  const [result, setResult] = useState<DailyFortune | null>(null);
  const [error, setError] = useState<string | null>(null);
  const t = dict.daily;

  function handleSubmit(req: ChartRequest) {
    try {
      setError(null);
      const now = new Date();
      setResult(
        computeDailyFortune(
          { ...req },
          { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() },
          locale,
        ),
      );
    } catch {
      setResult(null);
      setError(dict.errors.computeFailed);
    }
  }

  const rows = result
    ? ([
        ['overall', t.overall],
        ['love', t.love],
        ['career', t.career],
        ['wealth', t.wealth],
        ['health', t.health],
      ] as const)
    : [];

  return (
    <>
      <BirthForm dict={dict} onSubmit={handleSubmit} />

      {error ? (
        <div className="error-banner mt-6">{error}</div>
      ) : null}

      {result ? (
        <section className="mt-8 space-y-4">
          <hr className="star-divider" />

          {/* Score panel */}
          <div className="glass-card p-5">
            <div
              style={{
                textAlign: 'center',
                fontSize: '0.8125rem',
                color: 'var(--text-caption)',
                marginBottom: '1rem',
                letterSpacing: '0.04em',
              }}
            >
              {result.date}
            </div>
            {rows.map(([k, label]) => (
              <div key={k} className="fortune-row">
                <span style={{ color: 'var(--text-body)', fontSize: '0.875rem' }}>{label}</span>
                <GoldStars n={result.scores[k]} />
              </div>
            ))}
          </div>

          {/* Lucky info */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', textAlign: 'center' }}>
            <div className="glass-card p-4">
              <div style={{ fontSize: '0.75rem', color: 'var(--text-caption)', marginBottom: '0.5rem' }}>
                {t.luckyColor}
              </div>
              <div style={{ fontWeight: 600, color: 'var(--text-heading)', fontSize: '0.875rem' }}>
                {result.luckyColors.join(' / ')}
              </div>
            </div>
            <div className="glass-card p-4">
              <div style={{ fontSize: '0.75rem', color: 'var(--text-caption)', marginBottom: '0.5rem' }}>
                {t.luckyNumber}
              </div>
              <div
                style={{
                  fontWeight: 700,
                  color: 'var(--gold-400)',
                  textShadow: '0 0 8px var(--gold-glow)',
                  fontSize: '1rem',
                }}
              >
                {result.luckyNumbers.join(' / ')}
              </div>
            </div>
            <div className="glass-card p-4">
              <div style={{ fontSize: '0.75rem', color: 'var(--text-caption)', marginBottom: '0.5rem' }}>
                {t.luckyDirection}
              </div>
              <div style={{ fontWeight: 600, color: 'var(--text-heading)', fontSize: '0.875rem' }}>
                {result.luckyDirection}
              </div>
            </div>
          </div>

          {/* Yi / Ji */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div className="yi-card">
              <div
                style={{
                  fontWeight: 700,
                  color: 'var(--jade-400)',
                  fontSize: '0.875rem',
                  marginBottom: '0.375rem',
                }}
              >
                {t.yi}
              </div>
              <div style={{ color: 'var(--text-body)', fontSize: '0.8125rem' }}>
                {result.yi.join('、')}
              </div>
            </div>
            <div className="ji-card">
              <div
                style={{
                  fontWeight: 700,
                  color: 'var(--rose-400)',
                  fontSize: '0.875rem',
                  marginBottom: '0.375rem',
                }}
              >
                {t.ji}
              </div>
              <div style={{ color: 'var(--text-body)', fontSize: '0.8125rem' }}>
                {result.ji.join('、')}
              </div>
            </div>
          </div>

          <AiReading context={dailyContext(result, locale)} ai={dict.ai} tier="light" />
        </section>
      ) : null}
    </>
  );
}
