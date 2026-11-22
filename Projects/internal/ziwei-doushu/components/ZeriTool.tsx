'use client';

import { useState } from 'react';
import AiReading from '@/components/AiReading';
import { computeZeri, ZERI_ACTIVITIES, type Ymd, type ZeriActivity, type ZeriDay, type ZeriResult } from '@/lib/zeri';
import { ACTIVITY, animalName, tianShenName, toContext, zhiXingName } from '@/lib/divination/systems/zeri';
import { animalOf } from '@/lib/hehun';
import { yearGanZhi } from '@/lib/liChun';
import type { Locale } from '@/lib/i18n/config';
import type { Dictionary } from '@/lib/i18n/dictionaries';

const pad = (n: number) => String(n).padStart(2, '0');
const toInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function parseDate(v: string): Ymd | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return m ? { year: +m[1], month: +m[2], day: +m[3] } : null;
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

const VERDICT_COLOR: Record<ZeriDay['verdict'], string> = {
  good: 'var(--jade-400)',
  ok: 'var(--text-body)',
  avoid: 'var(--rose-400)',
};

export default function ZeriTool({ dict, locale }: { dict: Dictionary; locale: Locale }) {
  const t = dict.zeri;
  const [activity, setActivity] = useState<ZeriActivity>('ruZhai');
  const [from, setFrom] = useState(() => toInput(new Date()));
  const [to, setTo] = useState(() => toInput(new Date(Date.now() + 30 * 86_400_000)));
  const [birthYear, setBirthYear] = useState('');
  const [result, setResult] = useState<ZeriResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const fill = (s: string, a: string) => s.replace('{a}', a);
  const by = /^\d{4}$/.test(birthYear) ? Number(birthYear) : undefined;
  const byZhi = by !== undefined && by >= 1900 && by <= 2100 ? yearGanZhi(by)[1] : null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const f = parseDate(from);
    const tt = parseDate(to);
    try {
      if (!f || !tt) throw new Error('date');
      setResult(computeZeri({ activity, from: f, to: tt, birthYear: byZhi ? by : undefined }));
      setShowAll(false);
      setError(null);
    } catch {
      setResult(null);
      setError(t.rangeError);
    }
  }

  const row = (d: ZeriDay) => (
    <li key={d.date} className="glass-card p-3 text-sm" style={{ borderColor: d.verdict === 'good' ? 'var(--jade-400)' : undefined }}>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span style={{ color: 'var(--text-heading)', fontWeight: 600 }}>{d.date}</span>
        <span style={{ color: VERDICT_COLOR[d.verdict], fontWeight: 600 }}>{t.verdict[d.verdict]}</span>
        <span style={{ color: 'var(--text-caption)' }}>
          {t.lunar} {d.lunarDate}
        </span>
        <span style={{ color: 'var(--gold-400)' }}>{d.ganZhi}</span>
        <span>
          <span style={{ color: 'var(--text-caption)' }}>{t.zhiXing} </span>
          {zhiXingName(d.zhiXing, locale)}
        </span>
        <span>
          <span style={{ color: 'var(--text-caption)' }}>{t.tianShen} </span>
          {tianShenName(d.tianShen, locale)}
        </span>
        <span style={{ color: 'var(--text-caption)' }}>{fill(t.chong, animalName(d.chong.zhi, d.chong.shengXiao, locale))}</span>
      </div>
      <div className="mt-1" style={{ fontSize: '0.75rem', color: 'var(--text-caption)' }}>
        {d.reasons.map((r) => t.reasons[r]).join(' · ')}
      </div>
    </li>
  );

  const good = result?.days.filter((d) => d.verdict === 'good') ?? [];

  return (
    <>
      <form onSubmit={submit} className="glass-card p-6" style={{ borderRadius: 'var(--radius-xl)' }}>
        <span className="label-dark">{t.activityLabel}</span>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {ZERI_ACTIVITIES.map((k) => (
            <button key={k} type="button" onClick={() => setActivity(k)} style={chipStyle(activity === k)}>
              {ACTIVITY[k][locale]}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="label-dark">{t.fromLabel}</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="field-dark" required />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="label-dark">{t.toLabel}</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="field-dark" required />
          </label>
        </div>
        <p className="mt-1" style={{ fontSize: '0.75rem', color: 'var(--text-caption)' }}>
          {t.rangeHint}
        </p>

        <label className="mt-4 flex flex-col gap-1.5 md:w-1/2">
          <span className="label-dark">{t.birthYearLabel}</span>
          <input
            type="number"
            inputMode="numeric"
            min={1900}
            max={2100}
            value={birthYear}
            onChange={(e) => setBirthYear(e.target.value)}
            className="field-dark"
          />
        </label>
        <p className="mt-1" style={{ fontSize: '0.75rem', color: 'var(--text-caption)' }}>
          {t.birthYearHint}
        </p>
        {byZhi ? (
          <p className="mt-1" style={{ fontSize: '0.8125rem', color: 'var(--jade-400)' }}>
            {fill(t.residentZodiac, animalName(byZhi, animalOf(byZhi), locale))}
          </p>
        ) : null}

        <button type="submit" className="btn-gold mt-5">
          {t.compute}
        </button>
        <p className="mt-3" style={{ fontSize: '0.75rem', color: 'var(--text-caption)' }}>
          {t.method}
        </p>
      </form>

      {error ? <div className="error-banner mt-6">{error}</div> : null}

      {result ? (
        <section data-aw-result className="mt-8">
          <hr className="star-divider" />
          <h2 className="label-dark text-center" style={{ marginBottom: '0.75rem' }}>
            {t.goodTitle} · {ACTIVITY[result.activity][locale]} · {result.from} ~ {result.to}
          </h2>
          {good.length ? (
            <ul className="flex flex-col gap-2">{good.map(row)}</ul>
          ) : (
            <p className="text-center text-sm" style={{ color: 'var(--text-body)' }}>
              {t.goodNone}
            </p>
          )}

          <div className="mt-4 text-center">
            <button type="button" onClick={() => setShowAll((v) => !v)} style={chipStyle(showAll)}>
              {showAll ? t.hideAll : t.showAll}
            </button>
          </div>
          {showAll ? (
            <ul className="mt-4 flex flex-col gap-2">{result.days.filter((d) => d.verdict !== 'good').map(row)}</ul>
          ) : null}

          <AiReading context={toContext(result, locale)} ai={dict.ai} />
        </section>
      ) : null}
    </>
  );
}
