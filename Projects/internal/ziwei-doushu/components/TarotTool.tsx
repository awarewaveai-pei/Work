'use client';

import { useState } from 'react';
import { drawSpread, type TarotResult, type SpreadId } from '@/lib/tarot';
import type { Locale } from '@/lib/i18n/config';
import type { Dictionary } from '@/lib/i18n/dictionaries';

export default function TarotTool({ dict, locale }: { dict: Dictionary; locale: Locale }) {
  const [spread, setSpread] = useState<SpreadId>('three');
  const [result, setResult] = useState<TarotResult | null>(null);
  const t = dict.tarot;

  return (
    <>
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <label className="block text-sm text-slate-500">{t.spread}</label>
        <select
          value={spread}
          onChange={(e) => setSpread(e.target.value as SpreadId)}
          className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        >
          <option value="single">{t.single}</option>
          <option value="three">{t.three}</option>
          <option value="celtic">{t.celtic}</option>
        </select>
        <button
          onClick={() => setResult(drawSpread(spread))}
          className="mt-3 w-full rounded-md bg-indigo-600 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
        >
          {t.draw}
        </button>
      </div>

      {result ? (
        <section className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
          {result.cards.map((d, i) => (
            <div
              key={i}
              className={`rounded-lg border p-3 text-center ${
                d.reversed ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-white'
              }`}
            >
              <div className="text-xs text-slate-400">{i + 1}</div>
              <div className="my-2 text-sm font-semibold text-slate-800">{d.card.name[locale]}</div>
              <div className={`text-xs ${d.reversed ? 'text-rose-500' : 'text-emerald-600'}`}>
                {d.reversed ? t.reversed : t.upright}
              </div>
            </div>
          ))}
        </section>
      ) : null}
    </>
  );
}
