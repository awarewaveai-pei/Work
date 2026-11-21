'use client';

import { useState } from 'react';
import AiReading from '@/components/AiReading';
import { computeFengshui, toContext, type FengshuiResult } from '@/lib/divination/systems/fengshui';
import { type Palace } from '@/lib/fengshui/feixing';
import { liChunYear } from '@/lib/liChun';
import { localToday } from '@/lib/dates';
import { AUSPICIOUS, INAUSPICIOUS } from '@/lib/fengshui/bazhai';
import type { Gender } from '@/lib/ziwei';
import type { Locale } from '@/lib/i18n/config';
import type { Dictionary } from '@/lib/i18n/dictionaries';

/** 上南下北:東在左、西在右 */
const GRID: readonly Palace[] = [4, 9, 2, 3, 5, 7, 8, 1, 6];
const QUICK = [
  ['N', 0], ['NE', 45], ['E', 90], ['SE', 135],
  ['S', 180], ['SW', 225], ['W', 270], ['NW', 315],
] as const;

function parseDate(v: string) {
  const [year, month, day] = v.split('-').map(Number);
  return { year, month, day };
}

const chipStyle = (active: boolean) => ({
  padding: '0.375rem 0.75rem',
  borderRadius: '0.5rem',
  border: `1px solid ${active ? 'var(--gold-400)' : 'var(--text-dim)'}`,
  background: 'transparent',
  color: active ? 'var(--gold-400)' : 'var(--text-body)',
  fontSize: '0.8125rem',
  cursor: 'pointer',
});

export default function FengshuiTool({ dict, locale }: { dict: Dictionary; locale: Locale }) {
  const t = dict.fengshui;
  const [degree, setDegree] = useState('180');
  const [moveIn, setMoveIn] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [birth, setBirth] = useState('');
  const [result, setResult] = useState<FengshuiResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const deg = Number(degree);
    if (!Number.isFinite(deg) || deg < 0 || deg >= 360 || !moveIn) {
      setResult(null);
      setError(dict.errors.computeFailed);
      return;
    }
    try {
      const today = localToday();
      setResult(
        computeFengshui({
          facingDegree: deg,
          moveIn: parseDate(moveIn),
          flowYear: liChunYear(today.year, today.month, today.day),
          occupant: gender && birth ? { birth: parseDate(birth), gender } : undefined,
        }),
      );
      setError(null);
    } catch {
      setResult(null);
      setError(dict.errors.computeFailed);
    }
  }

  const f = result?.feixing;
  const fill = (s: string, vars: Record<string, string | number>) =>
    Object.entries(vars).reduce((acc, [k, v]) => acc.replace(`{${k}}`, String(v)), s);

  return (
    <>
      <form onSubmit={submit} className="glass-card p-6" style={{ borderRadius: 'var(--radius-xl)' }}>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="label-dark">{t.facingLabel}</span>
            <input
              type="number"
              min={0}
              max={359.9}
              step="any"
              value={degree}
              onChange={(e) => setDegree(e.target.value)}
              className="field-dark"
              required
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-caption)' }}>{t.facingHint}</span>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="label-dark">{t.moveInLabel}</span>
            <input
              type="date"
              value={moveIn}
              onChange={(e) => setMoveIn(e.target.value)}
              className="field-dark"
              required
            />
          </label>
        </div>

        <div className="mt-4">
          <span className="label-dark">{t.quick}</span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {QUICK.map(([d, deg]) => (
              <button
                key={d}
                type="button"
                onClick={() => setDegree(String(deg))}
                style={chipStyle(Number(degree) === deg)}
              >
                {t.directions[d]} {deg}°
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5">
          <span className="label-dark">{t.occupantLabel}</span>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {([['男', t.male], ['女', t.female], [null, t.skip]] as const).map(([g, label]) => (
              <button key={label} type="button" onClick={() => setGender(g)} style={chipStyle(gender === g)}>
                {label}
              </button>
            ))}
          </div>
          {gender ? (
            <label className="mt-3 flex flex-col gap-1.5 md:w-1/2">
              <span className="label-dark">{t.birthLabel}</span>
              <input
                type="date"
                value={birth}
                onChange={(e) => setBirth(e.target.value)}
                className="field-dark"
                required
              />
            </label>
          ) : null}
        </div>

        <button type="submit" className="btn-gold mt-5">
          {t.compute}
        </button>
        <p className="mt-3" style={{ fontSize: '0.75rem', color: 'var(--text-caption)' }}>
          {t.method}
        </p>
      </form>

      {error ? <div className="error-banner mt-6">{error}</div> : null}

      {result && f ? (
        <section className="mt-8">
          <hr className="star-divider" />

          <div className="glass-card p-4 mb-5 flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm">
            <span>
              <span style={{ color: 'var(--text-caption)' }}>{t.sitting}　</span>
              <span style={{ color: 'var(--text-heading)' }}>{f.sitting.mountain}</span>
              <span style={{ color: 'var(--text-caption)' }}>　{t.facing}　</span>
              <span style={{ color: 'var(--text-heading)' }}>
                {f.facing.mountain} {f.facingDegree}°
              </span>
            </span>
            <span style={{ color: 'var(--text-heading)' }}>{fill(t.period, { n: f.period })}</span>
            <span>
              <span style={{ color: 'var(--text-caption)' }}>{t.pattern}　</span>
              <span style={{ color: 'var(--gold-400)', fontWeight: 600 }}>{t.patterns[f.pattern]}</span>
            </span>
            {f.facing.jian ? (
              <span style={{ color: 'var(--text-body)' }}>{fill(t.jian, { m: f.facing.jian })}</span>
            ) : null}
            <span style={{ color: 'var(--text-body)' }}>
              {fill(t.annual, { y: f.flowYear, n: f.annualCenter })}
            </span>
          </div>

          <h2 className="label-dark text-center" style={{ marginBottom: '0.25rem' }}>
            {t.chartTitle}
          </h2>
          <p className="text-center" style={{ fontSize: '0.75rem', color: 'var(--text-caption)', marginBottom: '0.75rem' }}>
            {t.chartLegend}
          </p>
          <div className="mx-auto grid max-w-md grid-cols-3 gap-2">
            {GRID.map((p) => {
              const s = f.palaces[p - 1];
              const mark =
                p === f.facing.palace ? t.facing : p === f.sitting.palace ? t.sitting : null;
              return (
                <div key={p} className="glass-card p-3" style={{ aspectRatio: '1', display: 'flex', flexDirection: 'column' }}>
                  <div className="flex justify-between" style={{ fontSize: '1.125rem', fontWeight: 700 }}>
                    <span style={{ color: 'var(--jade-400)' }}>{s.mountain}</span>
                    <span style={{ color: 'var(--gold-400)' }}>{s.facing}</span>
                  </div>
                  <div
                    className="text-center"
                    style={{
                      flex: 1,
                      fontSize: '1.5rem',
                      color: 'var(--text-heading)',
                      fontFamily: "var(--font-noto-serif-tc), 'PingFang TC', serif",
                    }}
                  >
                    {s.period}
                  </div>
                  <div className="flex justify-between" style={{ fontSize: '0.7rem', color: 'var(--text-caption)' }}>
                    <span>
                      {t.directions[s.direction]}
                      {mark ? ` · ${mark}` : ''}
                    </span>
                    <span style={{ color: 'var(--sky-400)' }}>{s.annual}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {result.bazhai ? (
            <div className="glass-card p-5 mt-6">
              <h2 className="label-dark" style={{ marginBottom: '0.5rem' }}>
                {t.bazhaiTitle} · {t.mingGua} {result.bazhai.gua} ·{' '}
                {result.bazhai.group === 'east' ? t.east : t.west}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 text-sm">
                {(
                  [
                    [t.supportive, AUSPICIOUS, 'var(--jade-400)'],
                    [t.lessSupportive, INAUSPICIOUS, 'var(--text-caption)'],
                  ] as const
                ).map(([title, list, color]) => (
                  <div key={title}>
                    <div style={{ color, marginBottom: '0.25rem' }}>{title}</div>
                    {list.map((star) => (
                      <div key={star} className="flex justify-between" style={{ color: 'var(--text-body)' }}>
                        <span>{t.stars[star]}</span>
                        <span>{t.directions[result.bazhai!.stars[star]]}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <p className="mt-3" style={{ fontSize: '0.75rem', color: 'var(--text-caption)' }}>
                {t.bazhaiHint}
              </p>
            </div>
          ) : null}

          <AiReading context={toContext(result, locale)} ai={dict.ai} />
        </section>
      ) : null}
    </>
  );
}
