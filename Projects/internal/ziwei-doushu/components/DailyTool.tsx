'use client';

import { useState } from 'react';
import BirthForm from '@/components/BirthForm';
import { computeDailyFortune, type DailyFortune } from '@/lib/daily';
import type { ChartRequest } from '@/lib/ziwei';
import type { Locale } from '@/lib/i18n/config';
import type { Dictionary } from '@/lib/i18n/dictionaries';

function Stars({ n }: { n: number }) {
  return <span className="text-amber-500">{'★'.repeat(n)}{'☆'.repeat(5 - n)}</span>;
}

export default function DailyTool({ dict, locale }: { dict: Dictionary; locale: Locale }) {
  const [result, setResult] = useState<DailyFortune | null>(null);
  const [error, setError] = useState<string | null>(null);
  const t = dict.daily;

  function handleSubmit(req: ChartRequest) {
    try {
      setError(null);
      const now = new Date();
      setResult(
        computeDailyFortune(
          { ...req },
          { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() },
          locale,
        ),
      );
    } catch {
      setResult(null);
      setError(dict.errors.computeFailed);
    }
  }

  const rows = result
    ? ([
        ['overall', t.overall],
        ['love', t.love],
        ['career', t.career],
        ['wealth', t.wealth],
        ['health', t.health],
      ] as const)
    : [];

  return (
    <>
      <BirthForm dict={dict} onSubmit={handleSubmit} />
      {error ? (
        <p className="mt-6 rounded-md bg-rose-50 p-3 text-center text-sm text-rose-600">{error}</p>
      ) : null}
      {result ? (
        <section className="mt-8 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-2 text-center text-sm text-slate-400">{result.date}</div>
            {rows.map(([k, label]) => (
              <div key={k} className="flex justify-between py-1 text-sm">
                <span className="text-slate-500">{label}</span>
                <Stars n={result.scores[k]} />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3 text-center text-sm">
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="text-xs text-slate-400">{t.luckyColor}</div>
              <div className="mt-1 font-semibold text-slate-800">{result.luckyColors.join(' / ')}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="text-xs text-slate-400">{t.luckyNumber}</div>
              <div className="mt-1 font-semibold text-slate-800">{result.luckyNumbers.join(' / ')}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="text-xs text-slate-400">{t.luckyDirection}</div>
              <div className="mt-1 font-semibold text-slate-800">{result.luckyDirection}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <div className="font-semibold text-emerald-700">{t.yi}</div>
              <div className="text-slate-600">{result.yi.join('、')}</div>
            </div>
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
              <div className="font-semibold text-rose-700">{t.ji}</div>
              <div className="text-slate-600">{result.ji.join('、')}</div>
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
