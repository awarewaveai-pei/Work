'use client';

import { useState } from 'react';
import AiReading from '@/components/AiReading';
import { degInSign } from '@/lib/astrologyView';
import {
  currentDasha,
  dashaDate,
  grahaName,
  nakshatraLine,
  rashiName,
  vedicContext,
} from '@/lib/divination/systems/vedic';
import { karanaName, nakshatraName, tithiName, varaName, yogaName, type VedicChart } from '@/lib/vedic';
import { localToday, type Ymd } from '@/lib/today';
import type { Locale } from '@/lib/i18n/config';
import type { Dictionary } from '@/lib/i18n/dictionaries';

const caption = { color: 'var(--text-caption)' } as const;
const cell = { padding: '0.375rem 0.25rem', borderTop: '1px solid var(--glass-border)' } as const;

export default function VedicTool({ dict, locale }: { dict: Dictionary; locale: Locale }) {
  const t = dict.vedic;
  const [date, setDate] = useState('2000-01-01');
  const [time, setTime] = useState('12:00');
  const [tz, setTz] = useState(8);
  const [lat, setLat] = useState(25.03);
  const [lon, setLon] = useState(121.56);
  const [chart, setChart] = useState<VedicChart | null>(null);
  /** 排盤當下的「今天」:目前大運與 AI 事實用同一天 */
  const [today, setToday] = useState<Ymd | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(false);
    setChart(null);
    try {
      const [y, m, d] = date.split('-').map(Number);
      const [hh, mm] = time.split(':').map(Number);
      const res = await fetch('/api/vedic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: y, month: m, day: d, hour: hh, minute: mm, tzOffsetHours: tz, lat, lon }),
      });
      if (!res.ok) throw new Error();
      setChart((await res.json()) as VedicChart);
      setToday(localToday());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  const field = (label: string, input: React.ReactNode) => (
    <label>
      <span className="label-dark" style={{ display: 'block', marginBottom: '0.4rem' }}>{label}</span>
      {input}
    </label>
  );

  const moon = chart?.grahas.find((g) => g.key === 'moon');
  const now = chart && today ? currentDasha(chart, today) : null;

  return (
    <>
      <form onSubmit={submit} className="glass-card p-6" style={{ display: 'grid', gap: '1rem' }}>
        <div className="grid gap-3 sm:grid-cols-2">
          {field(t.birthDate, <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="field-dark" required />)}
          {field(t.birthTime, <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="field-dark" required />)}
          {field(t.timezone, <input type="number" step="0.5" value={tz} onChange={(e) => setTz(Number(e.target.value))} className="field-dark" />)}
          {field(t.latitude, <input type="number" step="0.01" value={lat} onChange={(e) => setLat(Number(e.target.value))} className="field-dark" />)}
          {field(t.longitude, <input type="number" step="0.01" value={lon} onChange={(e) => setLon(Number(e.target.value))} className="field-dark" />)}
        </div>
        <button type="submit" disabled={loading} className="btn-gold" style={{ justifySelf: 'start' }}>
          {loading ? t.computing : t.submit}
        </button>
      </form>

      {error ? <div className="error-banner mt-6">{dict.errors.computeFailed}</div> : null}

      {chart && moon && today ? (
        <section className="mt-8">
          <hr className="star-divider" />

          <div className="glass-card p-4 mb-5 flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm">
            <span>
              <span style={caption}>{t.lagna}　</span>
              <span style={{ color: 'var(--gold-400)', fontWeight: 600 }}>
                {rashiName(chart.ascendant.sign, locale)} {degInSign(chart.ascendant.longitude)}°
              </span>
            </span>
            <span>
              <span style={caption}>{t.moonNakshatra}　</span>
              <span style={{ color: 'var(--text-heading)' }}>{nakshatraLine(moon.nakshatra, locale)}</span>
            </span>
            <span>
              <span style={caption}>{t.ayanamsa}　</span>
              <span style={{ color: 'var(--text-heading)' }}>{chart.ayanamsa.toFixed(2)}°</span>
            </span>
          </div>

          <div className="glass-card p-4">
            <h2 className="label-dark" style={{ marginBottom: '0.5rem' }}>{t.grahas}</h2>
            <div
              role="table"
              style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr 0.6fr 2.2fr 1fr', fontSize: '0.8125rem', textAlign: 'center' }}
            >
              <div role="row" style={{ display: 'contents' }}>
                {[t.colGraha, t.colSign, t.colHouse, t.colNakshatra, t.colD9].map((h) => (
                  <div key={h} role="columnheader" className="label-dark" style={{ fontSize: '0.75rem', padding: '0.25rem' }}>
                    {h}
                  </div>
                ))}
              </div>
              {chart.grahas.map((g) => (
                <div key={g.key} role="row" style={{ display: 'contents' }}>
                  {[
                    `${grahaName(g.key, locale)}${g.retrograde ? ' ℞' : ''}`,
                    `${rashiName(g.sign, locale)} ${degInSign(g.longitude)}°`,
                    String(g.house),
                    `${nakshatraName(g.nakshatra.index, locale)} · ${g.nakshatra.pada}`,
                    rashiName(g.navamsa, locale),
                  ].map((v, i) => (
                    <div key={i} role="cell" style={{ ...cell, color: i === 0 ? 'var(--text-heading)' : 'var(--text-body)' }}>
                      {v}
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <p style={{ ...caption, fontSize: '0.75rem', marginTop: '0.5rem' }}>
              {t.lagnaD9.replace('{sign}', rashiName(chart.ascendant.navamsa, locale))}　℞ = {t.retrograde}
            </p>
          </div>

          <div className="glass-card p-4 mt-5" style={{ fontSize: '0.8125rem' }}>
            <h2 className="label-dark" style={{ marginBottom: '0.5rem' }}>{t.dasha}</h2>
            <ul style={{ display: 'grid', gap: '0.3rem' }}>
              {chart.dasha.mahadashas.map((m) => {
                const active = now?.maha.lord === m.lord && now.maha.startJd === m.startJd;
                return (
                  <li key={m.startJd} style={{ color: active ? 'var(--gold-400)' : 'var(--text-body)', fontWeight: active ? 700 : 400 }}>
                    {grahaName(m.lord, locale)}　{dashaDate(m.startJd, chart)} → {dashaDate(m.endJd, chart)}
                    {active ? `　(${t.current})` : ''}
                  </li>
                );
              })}
            </ul>
            {now ? (
              <>
                <h3 className="label-dark" style={{ margin: '0.75rem 0 0.4rem' }}>
                  {grahaName(now.maha.lord, locale)} · {t.antardasha}
                </h3>
                <ul style={{ display: 'grid', gap: '0.25rem' }}>
                  {now.maha.antardashas.map((a) => {
                    const active = a.startJd === now.antar.startJd;
                    return (
                      <li key={a.startJd} style={{ color: active ? 'var(--gold-400)' : 'var(--text-body)', fontWeight: active ? 700 : 400 }}>
                        {grahaName(a.lord, locale)}　{dashaDate(a.startJd, chart)} → {dashaDate(a.endJd, chart)}
                        {active ? `　(${t.current})` : ''}
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : null}
          </div>

          <div className="glass-card p-4 mt-5" style={{ fontSize: '0.8125rem' }}>
            <h2 className="label-dark" style={{ marginBottom: '0.5rem' }}>{t.panchang}</h2>
            <ul style={{ display: 'grid', gap: '0.3rem' }}>
              {[
                [t.tithi, tithiName(chart.panchang.tithi, locale)],
                [t.vara, varaName(chart.panchang.vara, locale)],
                [t.nakshatra, nakshatraName(chart.panchang.nakshatra, locale)],
                [t.yoga, yogaName(chart.panchang.yoga, locale)],
                [t.karana, karanaName(chart.panchang.karana, locale)],
              ].map(([k, v]) => (
                <li key={k}>
                  <span style={caption}>{k}　</span>
                  <span style={{ color: 'var(--text-heading)' }}>{v}</span>
                </li>
              ))}
            </ul>
            <p style={{ ...caption, fontSize: '0.7rem', marginTop: '0.5rem' }}>{t.note}</p>
          </div>

          <AiReading context={vedicContext(chart, locale, today)} ai={dict.ai} />
        </section>
      ) : null}
    </>
  );
}
