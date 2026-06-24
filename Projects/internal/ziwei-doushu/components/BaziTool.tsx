'use client';

import { useState } from 'react';
import BirthForm from '@/components/BirthForm';
import { computeBazi, type BaziResult } from '@/lib/bazi';
import type { ChartRequest } from '@/lib/ziwei';
import type { Locale } from '@/lib/i18n/config';
import type { Dictionary } from '@/lib/i18n/dictionaries';

export default function BaziTool({ dict, locale }: { dict: Dictionary; locale: Locale }) {
  const [result, setResult] = useState<BaziResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const t = dict.bazi;

  function handleSubmit(req: ChartRequest) {
    try {
      setError(null);
      setResult(computeBazi({ ...req, locale }));
    } catch {
      setResult(null);
      setError(dict.errors.computeFailed);
    }
  }

  const pillars = result
    ? ([
        [t.yearPillar, result.pillars.year],
        [t.monthPillar, result.pillars.month],
        [t.dayPillar, result.pillars.day],
        [t.hourPillar, result.pillars.hour],
      ] as const)
    : [];

  return (
    <>
      <BirthForm dict={dict} onSubmit={handleSubmit} />
      {error ? (
        <p className="mt-6 rounded-md bg-rose-50 p-3 text-center text-sm text-rose-600">{error}</p>
      ) : null}
      {result ? (
        <section className="mt-8">
          <div className="mb-4 flex justify-center gap-6 text-sm">
            <span><b className="text-slate-500">{t.dayMaster}</b> <span className="font-bold text-indigo-700">{result.dayMaster}</span></span>
            <span><b className="text-slate-500">{t.zodiac}</b> {result.zodiac}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {pillars.map(([label, p]) => (
              <div key={label} className="rounded-lg border border-slate-200 bg-white p-3 text-center">
                <div className="text-xs text-slate-400">{label}</div>
                <div className="my-1 text-2xl font-bold text-indigo-700">{p.ganZhi}</div>
                <div className="text-xs text-slate-500">{t.shiShen}：{p.shiShen}</div>
                <div className="text-xs text-slate-500">{t.hiddenStems}：{p.hiddenStems.join(' ')}</div>
                <div className="text-xs text-slate-400">{t.naYin}：{p.naYin}</div>
              </div>
            ))}
          </div>
          {result.correction ? (
            <p className="mt-3 text-center text-xs text-emerald-600">
              {dict.chart.trueSolarCorrection} {result.correction.correctionMinutes >= 0 ? '+' : ''}
              {result.correction.correctionMinutes} {dict.chart.minutesUnit}
            </p>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
