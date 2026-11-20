'use client';

import { useState } from 'react';
import AiReading from '@/components/AiReading';
import {
  computeQimenReading,
  deityName,
  doorName,
  jieqiName,
  PALACE_NAME,
  QIMEN_TOPICS,
  shenName,
  starName,
  toContext,
  type QimenData,
  type QimenTopic,
} from '@/lib/divination/systems/qimen';
import type { Palace, QimenTime } from '@/lib/qimen';
import type { Locale } from '@/lib/i18n/config';
import type { Dictionary } from '@/lib/i18n/dictionaries';

/** 上南下北:東在左、西在右 */
const GRID: readonly Palace[] = [4, 9, 2, 3, 5, 7, 8, 1, 6];
const pad = (n: number) => String(n).padStart(2, '0');

/** 現在的 UTC+8 牆上時間(排盤口徑),與瀏覽器時區無關 */
function nowUtc8(): QimenTime {
  const d = new Date(Date.now() + 8 * 3600_000);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
  };
}
const toInput = (t: QimenTime) => `${t.year}-${pad(t.month)}-${pad(t.day)}T${pad(t.hour)}:${pad(t.minute)}`;
function parseInput(v: string): QimenTime | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v);
  if (!m) return null;
  const [year, month, day, hour, minute] = m.slice(1).map(Number);
  return { year, month, day, hour, minute };
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

export default function QimenTool({ dict, locale }: { dict: Dictionary; locale: Locale }) {
  const t = dict.qimen;
  /** 空字串 = 按下起局當下 */
  const [when, setWhen] = useState('');
  const [topic, setTopic] = useState<QimenTopic>('general');
  const [result, setResult] = useState<QimenData | null>(null);
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const time = when ? parseInput(when) : nowUtc8();
    if (!time) {
      setResult(null);
      setError(dict.errors.computeFailed);
      return;
    }
    try {
      setResult(computeQimenReading({ time, topic }));
      setError(null);
    } catch {
      setResult(null);
      setError(dict.errors.computeFailed);
    }
  }

  const fill = (s: string, vars: Record<string, string | number>) =>
    Object.entries(vars).reduce((acc, [k, v]) => acc.replace(`{${k}}`, String(v)), s);
  const p = result?.plate;
  const pn = (x: Palace) => PALACE_NAME[x][locale];

  return (
    <>
      <form onSubmit={submit} className="glass-card p-6" style={{ borderRadius: 'var(--radius-xl)' }}>
        <label className="flex flex-col gap-1.5 md:w-1/2">
          <span className="label-dark">{t.timeLabel}</span>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className="field-dark"
            />
            <button type="button" onClick={() => setWhen(toInput(nowUtc8()))} style={chipStyle(false)}>
              {t.now}
            </button>
          </div>
        </label>

        <div className="mt-4">
          <span className="label-dark">{t.topicLabel}</span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {QIMEN_TOPICS.map((k) => (
              <button key={k} type="button" onClick={() => setTopic(k)} style={chipStyle(topic === k)}>
                {t.topics[k]}
              </button>
            ))}
          </div>
        </div>

        <button type="submit" className="btn-gold mt-5">
          {t.compute}
        </button>
        <p className="mt-3" style={{ fontSize: '0.75rem', color: 'var(--text-caption)' }}>
          {t.method}
        </p>
      </form>

      {error ? <div className="error-banner mt-6">{error}</div> : null}

      {result && p ? (
        <section className="mt-8">
          <hr className="star-divider" />

          <div className="glass-card p-4 mb-5 flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm">
            <span style={{ color: 'var(--text-heading)' }}>
              {result.time.year}-{pad(result.time.month)}-{pad(result.time.day)} {pad(result.time.hour)}:
              {pad(result.time.minute)}
            </span>
            <span>
              <span style={{ color: 'var(--text-caption)' }}>{t.pillars}　</span>
              <span style={{ color: 'var(--text-heading)' }}>
                {result.pillars.year} {result.pillars.month} {result.pillars.day} {result.pillars.hour}
              </span>
            </span>
            <span style={{ color: 'var(--text-body)' }}>
              {fill(t.jieqi, { name: jieqiName(result.jieqi.name, locale), yuan: t.yuan[result.yuan] })}
            </span>
            <span style={{ color: 'var(--gold-400)', fontWeight: 600 }}>
              {fill(t.ju, { dun: result.dun === 'yang' ? t.yang : t.yin, n: result.ju })}
            </span>
            <span>
              <span style={{ color: 'var(--text-caption)' }}>{t.zhiFu}　</span>
              <span style={{ color: 'var(--text-heading)' }}>
                {starName(p.zhiFu.star, locale)} → {pn(p.zhiFu.palace)}
              </span>
            </span>
            <span>
              <span style={{ color: 'var(--text-caption)' }}>{t.zhiShi}　</span>
              <span style={{ color: 'var(--text-heading)' }}>
                {doorName(p.zhiShi.door, locale)} → {pn(p.zhiShi.palace)}
              </span>
            </span>
            <span>
              <span style={{ color: 'var(--text-caption)' }}>{t.kong}　</span>
              <span style={{ color: 'var(--text-body)' }}>{p.kongZhi}</span>
              <span style={{ color: 'var(--text-caption)' }}>　{t.ma}　</span>
              <span style={{ color: 'var(--text-body)' }}>{p.ma.zhi}</span>
            </span>
            {result.yongShen ? (
              <span>
                <span style={{ color: 'var(--text-caption)' }}>{t.yongShen}　</span>
                <span style={{ color: 'var(--jade-400)' }}>
                  {shenName(result.yongShen.name, locale)} → {pn(result.yongShen.palace)}
                </span>
              </span>
            ) : null}
          </div>

          <h2 className="label-dark text-center" style={{ marginBottom: '0.25rem' }}>
            {t.chartTitle}
          </h2>
          <p className="text-center" style={{ fontSize: '0.75rem', color: 'var(--text-caption)', marginBottom: '0.75rem' }}>
            {t.chartLegend}
          </p>
          <div className="mx-auto grid max-w-lg grid-cols-3 gap-2">
            {GRID.map((n) => {
              const c = p.palaces[n - 1];
              const focus = result.yongShen?.palace === n;
              const marks = [c.kong ? t.kongMark : '', c.ma ? t.maMark : ''].filter(Boolean).join(' · ');
              return (
                <div
                  key={n}
                  className="glass-card p-3"
                  style={{
                    minHeight: '8.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.125rem',
                    fontSize: '0.8125rem',
                    borderColor: focus ? 'var(--jade-400)' : undefined,
                  }}
                >
                  <div className="flex justify-between" style={{ fontSize: '0.7rem', color: 'var(--text-caption)' }}>
                    <span>{pn(n)}</span>
                    <span style={{ color: 'var(--sky-400)' }}>{marks}</span>
                  </div>
                  {n === 5 ? (
                    <div className="text-center" style={{ flex: 1, color: 'var(--text-caption)', fontSize: '0.75rem' }}>
                      <div style={{ color: 'var(--text-body)', fontSize: '1rem' }}>
                        {t.earth} {c.earthStem}
                      </div>
                      {t.center}
                    </div>
                  ) : (
                    <>
                      <div style={{ color: 'var(--text-body)' }}>{c.deity ? deityName(c.deity, locale) : ''}</div>
                      <div style={{ color: 'var(--jade-400)' }}>
                        {c.star ? starName(c.star, locale) : ''}
                        {c.starJi ? ` · ${starName('天禽', locale)}` : ''}
                      </div>
                      <div style={{ color: 'var(--gold-400)', fontWeight: 600 }}>
                        {c.door ? doorName(c.door, locale) : ''}
                      </div>
                      <div
                        className="flex justify-between"
                        style={{
                          marginTop: 'auto',
                          color: 'var(--text-heading)',
                          fontFamily: "var(--font-noto-serif-tc), 'PingFang TC', serif",
                        }}
                      >
                        <span>
                          <span style={{ color: 'var(--text-caption)', fontSize: '0.7rem' }}>{t.heaven} </span>
                          {c.heavenStem}
                          {c.heavenStemJi ?? ''}
                        </span>
                        <span>
                          <span style={{ color: 'var(--text-caption)', fontSize: '0.7rem' }}>{t.earth} </span>
                          {c.earthStem}
                          {c.earthStemJi ?? ''}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          <AiReading context={toContext(result, locale)} ai={dict.ai} />
        </section>
      ) : null}
    </>
  );
}
