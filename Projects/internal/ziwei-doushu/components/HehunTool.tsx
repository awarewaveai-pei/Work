'use client';

import { useState } from 'react';
import BirthForm from '@/components/BirthForm';
import BirthZoneNote from '@/components/BirthZoneNote';
import AiReading from '@/components/AiReading';
import { computeHehun, toContext, type BirthDay, type HehunData } from '@/lib/divination/systems/hehun';
import type { HehunItem, Verdict } from '@/lib/hehun';
import type { BaziResult } from '@/lib/bazi';
import type { ChartRequest } from '@/lib/ziwei';
import type { Locale } from '@/lib/i18n/config';
import type { Dictionary } from '@/lib/i18n/dictionaries';

type Mode = 'full' | 'zodiac';

const VERDICT_COLOR: Record<Verdict, string> = {
  合: 'var(--jade-400)',
  平: 'var(--text-heading)',
  沖: 'var(--amber-400)',
};

const SERIF = "var(--font-heading), 'PingFang TC', serif";

function parseDate(v: string): BirthDay {
  const [year, month, day] = v.split('-').map(Number);
  return { year, month, day };
}

export default function HehunTool({ dict, locale }: { dict: Dictionary; locale: Locale }) {
  const t = dict.hehun;
  const [mode, setMode] = useState<Mode>('full');
  const [reqA, setReqA] = useState<ChartRequest | null>(null);
  const [reqB, setReqB] = useState<ChartRequest | null>(null);
  const [dateA, setDateA] = useState('1995-06-15');
  const [dateB, setDateB] = useState('1996-03-20');
  const [result, setResult] = useState<HehunData | null>(null);
  const [error, setError] = useState<string | null>(null);

  function switchMode(m: Mode) {
    setMode(m);
    setResult(null);
    setError(null);
  }

  function run() {
    try {
      setError(null);
      if (mode === 'full') {
        if (!reqA || !reqB) {
          setResult(null);
          setError(dict.form.placeRequired);
          return;
        }
        setResult(computeHehun({ mode: 'full', a: reqA, b: reqB }, locale));
      } else {
        setResult(computeHehun({ mode: 'zodiac', a: parseDate(dateA), b: parseDate(dateB) }, locale));
      }
    } catch {
      setResult(null);
      setError(dict.errors.computeFailed);
    }
  }

  const animal = (zhi: string) => t.animals[zhi as keyof typeof t.animals] ?? zhi;

  function basisLine(it: HehunItem) {
    const { a, b } = it.basis;
    if (it.key === 'elementsAB' || it.key === 'elementsBA') {
      return `${t.basisFavorable} ${a} · ${t.basisSupply} ${b}`;
    }
    if (it.key === 'yearBranch') {
      return `${t.personA} ${a}(${animal(a)}) · ${t.personB} ${b}(${animal(b)})`;
    }
    return `${t.personA} ${a} · ${t.personB} ${b}`;
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap justify-center gap-3" role="group">
        {(['full', 'zodiac'] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => switchMode(m)}
            className={mode === m ? 'btn-gold' : 'btn-violet'}
          >
            {m === 'full' ? t.modeFull : t.modeZodiac}
          </button>
        ))}
      </div>

      {/* 兩種模式都保持掛載,只隱藏:切換模式不會清掉已填的出生資料。 */}
      <div className="flex flex-col gap-5" hidden={mode !== 'full'}>
          {([
            [t.personA, setReqA],
            [t.personB, setReqB],
          ] as const).map(([label, set]) => (
            <section key={label}>
              <h2 className="label-dark mb-2" style={{ fontSize: '1rem' }}>{label}</h2>
              <BirthForm dict={dict} locale={locale} onChange={set} />
            </section>
          ))}
      </div>
      <div className="glass-card p-6" style={{ borderRadius: 'var(--radius-xl)' }} hidden={mode !== 'zodiac'}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {([
              [t.personA, dateA, setDateA],
              [t.personB, dateB, setDateB],
            ] as const).map(([label, value, set]) => (
              <label key={label} className="flex flex-col gap-1.5">
                <span className="label-dark">{label} · {t.birthDate}</span>
                <input
                  type="date"
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  className="field-dark"
                  required
                />
              </label>
            ))}
          </div>
          <p className="mt-3" style={{ fontSize: '0.75rem', color: 'var(--text-caption)' }}>
            {t.zodiacHint}
          </p>
      </div>

      <div className="mt-5 flex justify-center">
        <button type="button" onClick={run} className="btn-gold">
          {t.submit}
        </button>
      </div>

      {error ? <div className="error-banner mt-6">{error}</div> : null}

      {result ? (
        <section data-aw-result className="mt-8">
          <hr className="star-divider" />

          {result.mode === 'full' ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 mb-5">
              {([
                [t.personA, result.a],
                [t.personB, result.b],
              ] as const).map(([label, r]: readonly [string, BaziResult]) => (
                <div key={label} className="glass-card p-4 text-center">
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-caption)', marginBottom: '0.25rem' }}>
                    {label} · {animal(r.pillars.year.zhi)}
                  </div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--gold-400)', fontFamily: SERIF }}>
                    {r.pillars.year.ganZhi} {r.pillars.month.ganZhi} {r.pillars.day.ganZhi} {r.pillars.hour.ganZhi}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-body)', marginTop: '0.25rem' }}>
                    {dict.bazi.dayMaster} {r.dayMaster}({r.analysis.dayElement}) · {dict.bazi.favorable}{' '}
                    {r.analysis.favorable.join('、')}
                  </div>
                  <BirthZoneNote zone={r.zone} dict={dict} />
                </div>
              ))}
            </div>
          ) : null}

          <div className="glass-card p-4 mb-5 flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm">
            <span style={{ color: 'var(--text-caption)' }}>{t.summary}</span>
            {(['合', '平', '沖'] as const).map((v) => (
              <span key={v} style={{ color: VERDICT_COLOR[v], fontWeight: 600 }}>
                {t.verdict[v]} {result.match.summary[v]}
              </span>
            ))}
          </div>

          <ul className="flex flex-col gap-3">
            {result.match.items.map((it) => (
              <li key={it.key} className="glass-card p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span style={{ color: 'var(--text-heading)', fontWeight: 700, fontFamily: SERIF }}>
                    {t.items[it.key].name}
                  </span>
                  <span style={{ color: VERDICT_COLOR[it.verdict], fontWeight: 600 }}>
                    {t.verdict[it.verdict]}
                  </span>
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-body)', marginTop: '0.375rem' }}>
                  {basisLine(it)} →{' '}
                  {it.basis.relations.length
                    ? it.basis.relations.map((r) => t.rel[r]).join('、')
                    : t.noRelation}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-caption)', marginTop: '0.25rem' }}>
                  {t.items[it.key].desc}
                </div>
              </li>
            ))}
          </ul>

          <p className="mt-4 text-center" style={{ fontSize: '0.75rem', color: 'var(--text-caption)' }}>
            {t.note}
          </p>

          <AiReading context={toContext(result, locale)} ai={dict.ai} />
        </section>
      ) : null}
    </>
  );
}
