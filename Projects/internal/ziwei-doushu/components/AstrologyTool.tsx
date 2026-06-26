'use client';

import { useState } from 'react';
import AiReading from '@/components/AiReading';
import {
  astrologyContext,
  bodyName,
  signName,
  degInSign,
} from '@/lib/astrologyView';
import type { WesternChart } from '@/lib/astrology';
import type { Locale } from '@/lib/i18n/config';
import type { Dictionary } from '@/lib/i18n/dictionaries';

export default function AstrologyTool({
  dict,
  locale,
}: {
  dict: Dictionary;
  locale: Locale;
}) {
  const t = dict.astrology;
  const [date, setDate] = useState('2000-01-01');
  const [time, setTime] = useState('12:00');
  const [tz, setTz] = useState(8);
  const [lat, setLat] = useState(25.03);
  const [lon, setLon] = useState(121.56);
  const [chart, setChart] = useState<WesternChart | null>(null);
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
      const res = await fetch('/api/astrology', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: y, month: m, day: d, hour: hh, minute: mm,
          tzOffsetHours: tz, lat, lon,
        }),
      });
      if (!res.ok) throw new Error();
      setChart((await res.json()) as WesternChart);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <form onSubmit={submit} className="glass-card p-6" style={{ display: 'grid', gap: '1rem' }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            <span className="label-dark" style={{ display: 'block', marginBottom: '0.4rem' }}>{t.birthDate}</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="field-dark" required />
          </label>
          <label>
            <span className="label-dark" style={{ display: 'block', marginBottom: '0.4rem' }}>{t.birthTime}</span>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="field-dark" required />
          </label>
          <label>
            <span className="label-dark" style={{ display: 'block', marginBottom: '0.4rem' }}>{t.timezone}</span>
            <input type="number" step="0.5" value={tz} onChange={(e) => setTz(Number(e.target.value))} className="field-dark" />
          </label>
          <label>
            <span className="label-dark" style={{ display: 'block', marginBottom: '0.4rem' }}>{t.latitude}</span>
            <input type="number" step="0.01" value={lat} onChange={(e) => setLat(Number(e.target.value))} className="field-dark" />
          </label>
          <label>
            <span className="label-dark" style={{ display: 'block', marginBottom: '0.4rem' }}>{t.longitude}</span>
            <input type="number" step="0.01" value={lon} onChange={(e) => setLon(Number(e.target.value))} className="field-dark" />
          </label>
        </div>
        <button type="submit" disabled={loading} className="btn-gold" style={{ justifySelf: 'start' }}>
          {loading ? t.computing : t.submit}
        </button>
      </form>

      {error ? <div className="error-banner mt-6">{dict.errors.computeFailed}</div> : null}

      {chart ? (
        <section className="mt-8">
          <hr className="star-divider" />

          <div className="glass-card p-4 mb-5 flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm">
            <span>
              <span style={{ color: 'var(--text-caption)' }}>{t.ascendant}　</span>
              <span style={{ color: 'var(--gold-400)', fontWeight: 600 }}>{signName(chart.ascendant.signIndex, locale)}</span>
            </span>
            <span>
              <span style={{ color: 'var(--text-caption)' }}>{t.mc}　</span>
              <span style={{ color: 'var(--text-heading)' }}>{signName(chart.mc.signIndex, locale)}</span>
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
              gap: '0.6rem',
            }}
          >
            {chart.planets.map((p) => (
              <div key={p.body} className="glass-card p-3" style={{ fontSize: '0.8125rem' }}>
                <div style={{ color: 'var(--text-heading)', fontWeight: 600, marginBottom: '0.25rem' }}>
                  {bodyName(p.body, locale)}
                  {p.retrograde ? <span style={{ color: 'var(--rose-400)', fontSize: '0.7rem' }}>　℞</span> : null}
                </div>
                <div style={{ color: 'var(--gold-400)' }}>
                  {signName(p.signIndex, locale)} {degInSign(p.longitude)}°
                </div>
                <div style={{ color: 'var(--text-caption)', fontSize: '0.7rem' }}>
                  {t.house} {p.house}
                </div>
              </div>
            ))}
          </div>

          <AiReading context={astrologyContext(chart, locale)} ai={dict.ai} />
        </section>
      ) : null}
    </>
  );
}
