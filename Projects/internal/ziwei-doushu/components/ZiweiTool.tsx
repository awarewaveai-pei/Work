'use client';

import { useMemo, useState } from 'react';
import BirthForm from '@/components/BirthForm';
import ZiweiChart from '@/components/ZiweiChart';
import AiReading from '@/components/AiReading';
import {
  computeChart,
  computeHoroscope,
  formatMutagen,
  type ChartRequest,
  type ChartResult,
} from '@/lib/ziwei';
import { analyzeZiwei, type PatternKind } from '@/lib/ziwei/analyze';
import { toContext } from '@/lib/divination/systems/ziwei';
import type { Locale } from '@/lib/i18n/config';
import type { Dictionary } from '@/lib/i18n/dictionaries';

/** 今日 YYYY-MM-DD(client island,Date 僅在瀏覽器執行)。 */
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

const KIND_COLOR: Record<PatternKind, string> = {
  auspicious: 'var(--gold-400)',
  inauspicious: 'var(--rose-400)',
  neutral: 'var(--violet-400)',
};
const KIND_LABEL: Record<PatternKind, { 'zh-TW': string; en: string }> = {
  auspicious: { 'zh-TW': '吉格', en: 'Auspicious' },
  inauspicious: { 'zh-TW': '破格', en: 'Inauspicious' },
  neutral: { 'zh-TW': '中性', en: 'Neutral' },
};

export default function ZiweiTool({
  dict,
  locale,
}: {
  dict: Dictionary;
  locale: Locale;
}) {
  const [result, setResult] = useState<ChartResult | null>(null);
  const [birthReq, setBirthReq] = useState<ChartRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const t = dict.chart;

  // 過運(大限/流年/流月/流日/流時 + 四化):以今日推算,result 變動才重算。
  const horoscope = useMemo(
    () => (result ? computeHoroscope(result.astrolabe, todayStr()) : null),
    [result],
  );
  // 頂規確定性分析(格局 / 亮度吉凶 / 飛宮四化)。
  //   ⚠️ 一律以 zh-TW 命盤分析:命格/廟旺/地支判定靠中文字面,en 盤的廟旺是 [+3]
  //   /地支是拼音 → 會失效(critic 2026-06-27)。命理分析本即中文內容,固定 zh-TW。
  //   整體 try/catch:iztro 若拋例外不可白屏(回 null 即不顯示分析區)。
  const analysis = useMemo(() => {
    if (!birthReq) return null;
    try {
      return analyzeZiwei(computeChart({ ...birthReq, locale: 'zh-TW' }).astrolabe);
    } catch {
      return null;
    }
  }, [birthReq]);

  function handleSubmit(req: ChartRequest) {
    try {
      setError(null);
      setResult(computeChart({ ...req, locale }));
      setBirthReq(req);
    } catch {
      setResult(null);
      setBirthReq(null);
      setError(dict.errors.computeFailed);
    }
  }

  return (
    <>
      <BirthForm dict={dict} onSubmit={handleSubmit} />

      {error ? <div className="error-banner mt-6">{error}</div> : null}

      {result ? (
        <section className="mt-8">
          <hr className="star-divider" />
          <ZiweiChart result={result} dict={dict} />

          {horoscope ? (
            <div className="glass-card p-4 mt-6">
              <div className="label-dark" style={{ marginBottom: '0.5rem' }}>
                {t.transit}（{horoscope.date}）
              </div>
              <dl
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr',
                  gap: '4px 12px',
                  fontSize: '0.8125rem',
                  color: 'var(--text-body)',
                }}
              >
                <dt style={{ color: 'var(--text-caption)' }}>{t.decadal}</dt>
                <dd>
                  {horoscope.decadal.heavenlyStem}干
                  {formatMutagen(horoscope.decadal.mutagenStars)}
                </dd>
                <dt style={{ color: 'var(--text-caption)' }}>{t.yearly}</dt>
                <dd>
                  {horoscope.yearly.heavenlyStem}年
                  {formatMutagen(horoscope.yearly.mutagenStars)}
                </dd>
                <dt style={{ color: 'var(--text-caption)' }}>{t.monthly}</dt>
                <dd>{formatMutagen(horoscope.monthly.mutagenStars)}</dd>
                <dt style={{ color: 'var(--text-caption)' }}>{t.daily}</dt>
                <dd>{formatMutagen(horoscope.daily.mutagenStars)}</dd>
              </dl>
            </div>
          ) : null}

          {analysis ? (
            <div className="mt-6" style={{ display: 'grid', gap: '1rem' }}>
              {/* 主星亮度吉凶指數 */}
              <div className="glass-card p-4">
                <div className="label-dark" style={{ marginBottom: '0.6rem' }}>
                  {t.brightnessTitle}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', fontSize: '0.8125rem' }}>
                  {analysis.brightness.brightnessIndex !== null ? (
                    <span>
                      <span style={{ color: 'var(--text-caption)' }}>{t.brightnessIndex}　</span>
                      <span style={{ color: 'var(--gold-400)', fontWeight: 700 }}>
                        {analysis.brightness.brightnessIndex}/100
                      </span>
                    </span>
                  ) : null}
                  {analysis.brightness.fortuneIndex !== null ? (
                    <span>
                      <span style={{ color: 'var(--text-caption)' }}>{t.fortuneIndex}　</span>
                      <span style={{ color: 'var(--gold-400)', fontWeight: 700 }}>
                        {analysis.brightness.fortuneIndex}%
                      </span>
                    </span>
                  ) : null}
                </div>
                {analysis.brightness.luckySignals.length ? (
                  <div style={{ marginTop: '0.5rem', fontSize: '0.78rem' }}>
                    <span style={{ color: 'var(--jade-400)' }}>{t.luckyStars}：</span>
                    <span style={{ color: 'var(--text-body)' }}>
                      {analysis.brightness.luckySignals.map((s) => `${s.label}${s.position}`).join('、')}
                    </span>
                  </div>
                ) : null}
                {analysis.brightness.unluckySignals.length ? (
                  <div style={{ marginTop: '0.25rem', fontSize: '0.78rem' }}>
                    <span style={{ color: 'var(--rose-400)' }}>{t.unluckyStars}：</span>
                    <span style={{ color: 'var(--text-body)' }}>
                      {analysis.brightness.unluckySignals.map((s) => `${s.label}${s.position}`).join('、')}
                    </span>
                  </div>
                ) : null}
              </div>

              {/* 格局 */}
              {analysis.patterns.length ? (
                <div className="glass-card p-4">
                  <div className="label-dark" style={{ marginBottom: '0.6rem' }}>
                    {t.patternsTitle}（{analysis.patterns.length}）
                  </div>
                  <div style={{ display: 'grid', gap: '0.6rem' }}>
                    {analysis.patterns.map((p) => (
                      <div key={p.name} style={{ borderLeft: `3px solid ${KIND_COLOR[p.kind]}`, paddingLeft: '0.6rem' }}>
                        <div style={{ fontWeight: 700, color: 'var(--text-heading)', fontSize: '0.875rem' }}>
                          {p.name}
                          <span style={{ color: KIND_COLOR[p.kind], fontSize: '0.68rem', marginLeft: '0.4rem' }}>
                            {KIND_LABEL[p.kind][locale]}
                          </span>
                        </div>
                        <div style={{ color: 'var(--text-body)', fontSize: '0.78rem', lineHeight: 1.6 }}>
                          {p.desc}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* 飛宮四化 */}
              {analysis.flying.length ? (
                <div className="glass-card p-4">
                  <div className="label-dark" style={{ marginBottom: '0.6rem' }}>
                    {t.flyingTitle}
                  </div>
                  <div style={{ display: 'grid', gap: '0.3rem', fontSize: '0.78rem' }}>
                    {analysis.flying.map((f, i) => (
                      <div key={i} style={{ color: 'var(--text-body)' }}>
                        <span style={{ color: 'var(--violet-400)' }}>[{f.domain}]</span>{' '}
                        <span style={{ color: 'var(--text-heading)' }}>{f.flow}</span>
                        <span style={{ color: 'var(--text-caption)' }}> — {f.meaning}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <AiReading
            context={toContext(result, locale, horoscope ?? undefined, analysis ?? undefined)}
            ai={dict.ai}
          />
        </section>
      ) : null}
    </>
  );
}
