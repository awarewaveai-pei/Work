'use client';

import { useState } from 'react';
import AiReading from '@/components/AiReading';
import PlaceField, { defaultPlace } from '@/components/PlaceField';
import { PrefillNotice, useBirthPrefill } from '@/components/BirthPrefill';
import { solarDateText, timeText } from '@/lib/member/birthPrefill';
import { XALEN_YEAR_MAX, XALEN_YEAR_MIN } from '@/lib/divination/fields';
import {
  astrologyContext,
  aspectDetail,
  aspectName,
  bodyName,
  dignityLine,
  lotLine,
  profectionLine,
  sectName,
  signName,
  degInSign,
  solarReturnLine,
  synastryAspectLabel,
  synastryContext,
  transitAspectLabel,
  transitContext,
  decennialLine,
  firdariaLine,
  PART_NAMES,
  partLine,
  releasingLine,
  sunRelationsLine,
  techniquesContext,
} from '@/lib/astrologyView';
import type { BodyKey, SynastryResult, TransitResult, WesternChart, WesternRequest } from '@/lib/astrology';
import type { Aspect } from '@/lib/astrologyAspects';
import { techniquesReading, traditionalReading } from '@/lib/astrologyTraditional';
import { localToday } from '@/lib/today';
import { utcOffsetAt, type BirthPlace } from '@/lib/timezone';
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
  const [form, setForm] = useState<BirthForm>(() => defaultBirth(locale));
  /** 本命表單的出生地重掛鍵:會員預填、清除時換(components/BirthPrefill.tsx;合盤對象不預填) */
  const [placeKey, setPlaceKey] = useState(0);
  const member = useBirthPrefill((b) => {
    const date = solarDateText(b);
    const year = Number(date.slice(0, 4));
    if (year < XALEN_YEAR_MIN || year > XALEN_YEAR_MAX) return false; // 星曆算不到的年份:不帶入
    setForm({ date, time: timeText(b), place: b.place });
    setPlaceMissing(false);
    setPlaceKey((k) => k + 1);
  });
  const [placeMissing, setPlaceMissing] = useState(false);
  const [chart, setChart] = useState<WesternChart | null>(null);
  /** 排盤當下的生辰(小限、行運、合盤都用它;表單之後被改不影響已排的盤) */
  const [natalReq, setNatalReq] = useState<WesternRequest | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPlaceMissing(!form.place);
    if (!form.place) return;
    setLoading(true);
    setError(false);
    setChart(null);
    try {
      const req = toRequest(form)!;
      setChart(await postJson<WesternChart>('/api/astrology', req));
      setNatalReq(req);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <form onSubmit={submit} onInputCapture={member.markTouched} className="glass-card p-6" style={{ display: 'grid', gap: '1rem' }}>
        {member.prefilled ? (
          <PrefillNotice
            dict={dict}
            onClear={() => {
              member.markTouched();
              member.hide();
              setForm(defaultBirth(locale));
              setPlaceKey((k) => k + 1);
            }}
          />
        ) : null}
        <BirthFields
          value={form}
          placeKey={placeKey}
          onChange={(v) => { member.markTouched(); setForm(v); if (v.place) setPlaceMissing(false); }}
          dict={dict}
          locale={locale}
        />
        {placeMissing ? <div className="error-banner">{dict.form.placeRequired}</div> : null}
        <button type="submit" disabled={loading} className="btn-gold" style={{ justifySelf: 'start' }}>
          {loading ? t.computing : t.submit}
        </button>
      </form>

      {error ? <div className="error-banner mt-6">{dict.errors.computeFailed}</div> : null}

      {chart ? (() => {
        const trad = natalReq ? traditionalReading(chart, natalReq, localToday()) : null;
        return (
        <section data-aw-result className="mt-8">
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

          <div className="glass-card p-4 mt-5">
            <h2 className="label-dark" style={{ marginBottom: '0.5rem' }}>{t.aspects}</h2>
            {chart.aspects.length === 0 ? (
              <p style={{ color: 'var(--text-caption)', fontSize: '0.8125rem' }}>{t.noAspects}</p>
            ) : (
              <ul style={{ display: 'grid', gap: '0.3rem', fontSize: '0.8125rem' }}>
                {chart.aspects.map((a) => (
                  <li key={`${a.a}-${a.b}`} className="flex flex-wrap gap-x-2">
                    <span style={{ color: 'var(--text-heading)' }}>{bodyName(a.a, locale)}</span>
                    <span style={{ color: 'var(--gold-400)', fontWeight: 600 }}>{aspectName(a.aspect, locale)}</span>
                    <span style={{ color: 'var(--text-heading)' }}>{bodyName(a.b, locale)}</span>
                    <span style={{ color: 'var(--text-caption)' }}>{aspectDetail(a, locale)}</span>
                  </li>
                ))}
              </ul>
            )}
            <p style={{ color: 'var(--text-caption)', fontSize: '0.7rem', marginTop: '0.5rem' }}>{t.aspectsNote}</p>
          </div>

          {trad ? (
            <div className="glass-card p-4 mt-5" style={{ fontSize: '0.8125rem' }}>
              <h2 className="label-dark" style={{ marginBottom: '0.5rem' }}>{t.traditional}</h2>
              <ul style={{ display: 'grid', gap: '0.3rem' }}>
                <li>
                  <span style={{ color: 'var(--text-caption)' }}>{t.sect}　</span>
                  <span style={{ color: 'var(--gold-400)', fontWeight: 600 }}>{sectName(trad.diurnal, locale)}</span>
                </li>
                <li>
                  <span style={{ color: 'var(--text-caption)' }}>{t.dignities}　</span>
                  {trad.dignities.some((d) => d.dignities.length > 0)
                    ? trad.dignities
                        .filter((d) => d.dignities.length > 0)
                        .map((d) => (
                          <span key={d.planet} style={{ marginRight: '0.75rem' }}>
                            <span style={{ color: 'var(--text-heading)' }}>{bodyName(d.planet, locale)}</span>{' '}
                            <span style={{ color: 'var(--gold-400)' }}>{dignityLine(d, locale)}</span>
                          </span>
                        ))
                    : <span style={{ color: 'var(--text-caption)' }}>{t.noDignities}</span>}
                </li>
                <li>
                  <span style={{ color: 'var(--text-caption)' }}>{t.fortune}　</span>
                  <span style={{ color: 'var(--text-heading)' }}>{lotLine(trad.fortune, locale)}</span>
                </li>
                <li>
                  <span style={{ color: 'var(--text-caption)' }}>{t.spirit}　</span>
                  <span style={{ color: 'var(--text-heading)' }}>{lotLine(trad.spirit, locale)}</span>
                </li>
                {trad.profection ? (
                  <li>
                    <span style={{ color: 'var(--text-caption)' }}>{t.profection}　</span>
                    <span style={{ color: 'var(--text-heading)' }}>{profectionLine(trad.profection, locale)}</span>
                  </li>
                ) : null}
              </ul>
              <p style={{ color: 'var(--text-caption)', fontSize: '0.7rem', marginTop: '0.5rem' }}>{t.traditionalNote}</p>
            </div>
          ) : null}

          <AiReading context={astrologyContext(chart, locale, trad)} ai={dict.ai} />

          {natalReq ? (
            <>
              <TechniquesPanel chart={chart} natalReq={natalReq} dict={dict} locale={locale} />
              <TransitPanel natalReq={natalReq} dict={dict} locale={locale} />
              <SynastryPanel natalReq={natalReq} dict={dict} locale={locale} />
            </>
          ) : null}
        </section>
        );
      })() : null}
    </>
  );
}

interface BirthForm {
  date: string;
  time: string;
  place: BirthPlace | null;
}

const defaultBirth = (locale: Locale): BirthForm => ({ date: '2000-01-01', time: '12:00', place: defaultPlace(locale) });

/** UTC 偏移由出生地時區與出生時刻算出(含歷史夏令時間),不讓使用者手填。未選出生地回 null。 */
function toRequest(f: BirthForm): WesternRequest | null {
  if (!f.place) return null;
  const [year, month, day] = f.date.split('-').map(Number);
  const [hour, minute] = f.time.split(':').map(Number);
  const tzOffsetHours = utcOffsetAt(f.place.zone, year, month, day, hour, minute);
  return { year, month, day, hour, minute, tzOffsetHours, lat: f.place.lat, lon: f.place.lon };
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as T;
}

type AstroDict = Dictionary['astrology'];

function BirthFields({
  value,
  placeKey = 0,
  onChange,
  dict,
  locale,
}: {
  value: BirthForm;
  /** 換值 = 出生地欄位以 value.place 重新開始(預填、清除) */
  placeKey?: number;
  onChange: (v: BirthForm) => void;
  dict: Dictionary;
  locale: Locale;
}) {
  const t: AstroDict = dict.astrology;
  const set = <K extends keyof BirthForm>(k: K, v: BirthForm[K]) => onChange({ ...value, [k]: v });
  const label = (text: string) => (
    <span className="label-dark" style={{ display: 'block', marginBottom: '0.4rem' }}>{text}</span>
  );
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label>
        {label(t.birthDate)}
        <input type="date" value={value.date} onChange={(e) => set('date', e.target.value)} className="field-dark" required />
      </label>
      <label>
        {label(t.birthTime)}
        <input type="time" value={value.time} onChange={(e) => set('time', e.target.value)} className="field-dark" required />
      </label>
      <div className="sm:col-span-2">
        <PlaceField key={placeKey} initial={value.place} dict={dict} locale={locale} onChange={(p) => set('place', p)} />
      </div>
    </div>
  );
}

function AspectList({
  aspects,
  label,
  locale,
  empty,
}: {
  aspects: readonly Aspect<BodyKey>[];
  label: (a: Aspect<BodyKey>) => string;
  locale: Locale;
  empty: string;
}) {
  if (aspects.length === 0) return <p style={{ color: 'var(--text-caption)' }}>{empty}</p>;
  return (
    <ul style={{ display: 'grid', gap: '0.3rem' }}>
      {aspects.map((a) => (
        <li key={`${a.a}-${a.b}`} className="flex flex-wrap gap-x-2">
          <span style={{ color: 'var(--text-heading)' }}>{label(a)}</span>
          <span style={{ color: 'var(--text-caption)' }}>{aspectDetail(a, locale)}</span>
        </li>
      ))}
    </ul>
  );
}

function TransitPanel({ natalReq, dict, locale }: { natalReq: WesternRequest; dict: Dictionary; locale: Locale }) {
  const t = dict.astrology;
  const [result, setResult] = useState<TransitResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function load() {
    setLoading(true);
    setError(false);
    try {
      setResult(
        await postJson<TransitResult>('/api/astrology/transits', {
          birth: natalReq,
          today: localToday(),
          viewerTzOffsetHours: -new Date().getTimezoneOffset() / 60,
        }),
      );
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="glass-card p-4 mt-8" style={{ fontSize: '0.8125rem' }}>
      <h2 className="label-dark" style={{ marginBottom: '0.5rem' }}>{t.transits}</h2>
      {result ? null : (
        <button type="button" onClick={load} disabled={loading} className="btn-gold">
          {loading ? t.computing : t.transitsButton}
        </button>
      )}
      {error ? <div className="error-banner mt-4">{dict.errors.computeFailed}</div> : null}
      {result ? (
        <>
          <p style={{ marginBottom: '0.5rem' }}>
            <span style={{ color: 'var(--text-caption)' }}>{t.solarReturn}　</span>
            <span style={{ color: 'var(--gold-400)', fontWeight: 600 }}>{solarReturnLine(result.solarReturn)}</span>
          </p>
          <AspectList aspects={result.aspects} label={(a) => transitAspectLabel(a, locale)} locale={locale} empty={t.noTransitAspects} />
          <p style={{ color: 'var(--text-caption)', fontSize: '0.7rem', marginTop: '0.5rem' }}>{t.transitsNote}</p>
          <AiReading context={transitContext(result, locale)} ai={dict.ai} />
        </>
      ) : null}
    </div>
  );
}

function SynastryPanel({ natalReq, dict, locale }: { natalReq: WesternRequest; dict: Dictionary; locale: Locale }) {
  const t = dict.astrology;
  const [partner, setPartner] = useState<BirthForm>(() => defaultBirth(locale));
  const [placeMissing, setPlaceMissing] = useState(false);
  const [result, setResult] = useState<SynastryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPlaceMissing(!partner.place);
    if (!partner.place) return;
    setLoading(true);
    setError(false);
    setResult(null);
    try {
      const b = toRequest(partner)!;
      setResult(await postJson<SynastryResult>('/api/astrology/synastry', { a: natalReq, b }));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="glass-card p-4 mt-5" style={{ fontSize: '0.8125rem' }}>
      <h2 className="label-dark" style={{ marginBottom: '0.25rem' }}>{t.synastry}</h2>
      <p style={{ color: 'var(--text-caption)', marginBottom: '0.75rem' }}>{t.synastryHint}</p>
      <form onSubmit={submit} style={{ display: 'grid', gap: '1rem' }}>
        <BirthFields value={partner} onChange={(v) => { setPartner(v); if (v.place) setPlaceMissing(false); }} dict={dict} locale={locale} />
        {placeMissing ? <div className="error-banner">{dict.form.placeRequired}</div> : null}
        <button type="submit" disabled={loading} className="btn-gold" style={{ justifySelf: 'start' }}>
          {loading ? t.computing : t.synastryButton}
        </button>
      </form>
      {error ? <div className="error-banner mt-4">{dict.errors.computeFailed}</div> : null}
      {result ? (
        <div className="mt-4">
          <AspectList aspects={result.aspects} label={(a) => synastryAspectLabel(a, locale)} locale={locale} empty={t.noSynastryAspects} />
          <p style={{ color: 'var(--text-caption)', fontSize: '0.7rem', marginTop: '0.5rem' }}>{t.synastryNote}</p>
          <AiReading context={synastryContext(result, locale)} ai={dict.ai} />
        </div>
      ) : null}
    </div>
  );
}

function TechniquesPanel({
  chart,
  natalReq,
  dict,
  locale,
}: {
  chart: WesternChart;
  natalReq: WesternRequest;
  dict: Dictionary;
  locale: Locale;
}) {
  const t = dict.astrology;
  const r = techniquesReading(chart, natalReq, localToday());
  if (!r) return null;
  const row = (label: string, value: string) => (
    <li>
      <span style={{ color: 'var(--text-caption)' }}>{label}　</span>
      <span style={{ color: 'var(--text-heading)' }}>{value}</span>
    </li>
  );
  return (
    <div className="glass-card p-4 mt-8" style={{ fontSize: '0.8125rem' }}>
      <h2 className="label-dark" style={{ marginBottom: '0.5rem' }}>{t.techniques}</h2>
      <ul style={{ display: 'grid', gap: '0.3rem' }}>
        {r.firdaria ? row(t.firdaria, firdariaLine(r, natalReq, locale)) : null}
        {r.releasingFortune ? row(t.releasingFortune, releasingLine(r.releasingFortune, natalReq, locale)) : null}
        {r.releasingSpirit ? row(t.releasingSpirit, releasingLine(r.releasingSpirit, natalReq, locale)) : null}
        {r.decennial ? row(t.decennials, decennialLine(r, natalReq, locale)) : null}
        {row(t.sunRelations, sunRelationsLine(r, locale))}
      </ul>
      <h3 className="label-dark" style={{ margin: '0.75rem 0 0.4rem' }}>{t.otherLots}</h3>
      <ul style={{ display: 'grid', gap: '0.25rem', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
        {r.parts.map((p) => (
          <li key={p.key}>
            <span style={{ color: 'var(--text-caption)' }}>{PART_NAMES[p.key][locale]}　</span>
            <span style={{ color: 'var(--text-heading)' }}>{partLine(p, locale)}</span>
          </li>
        ))}
      </ul>
      <p style={{ color: 'var(--text-caption)', fontSize: '0.7rem', marginTop: '0.5rem' }}>{t.techniquesNote}</p>
      <AiReading context={techniquesContext(r, natalReq, locale)} ai={dict.ai} />
    </div>
  );
}
