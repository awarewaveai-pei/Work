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
import { toContext } from '@/lib/divination/systems/ziwei';
import type { Locale } from '@/lib/i18n/config';
import type { Dictionary } from '@/lib/i18n/dictionaries';

/** 今日 YYYY-MM-DD(client island,Date 僅在瀏覽器執行)。 */
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * 互動排盤工具 (Client Island)。
 */
export default function ZiweiTool({
  dict,
  locale,
}: {
  dict: Dictionary;
  locale: Locale;
}) {
  const [result, setResult] = useState<ChartResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const t = dict.chart;

  // 過運(大限/流年/流月/流日/流時 + 四化):以今日推算,result 變動才重算。
  const horoscope = useMemo(
    () => (result ? computeHoroscope(result.astrolabe, todayStr()) : null),
    [result],
  );

  function handleSubmit(req: ChartRequest) {
    try {
      setError(null);
      setResult(computeChart({ ...req, locale }));
    } catch {
      setResult(null);
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

          <AiReading
            context={toContext(result, locale, horoscope ?? undefined)}
            ai={dict.ai}
          />
        </section>
      ) : null}
    </>
  );
}
