'use client';

import { useState } from 'react';
import { castHexagram, type IChingResult, type Hexagram } from '@/lib/iching';
import type { Locale } from '@/lib/i18n/config';
import type { Dictionary } from '@/lib/i18n/dictionaries';

function HexView({ h, label, hexagramNo }: { h: Hexagram; label: string; hexagramNo: string }) {
  return (
    <div className="text-center">
      <div className="mb-2 text-sm text-slate-400">{label}</div>
      <div className="flex flex-col gap-1">
        {/* 由上而上顯示:陣列 0=初爻(底),畫面最上為上爻 → reverse */}
        {[...h.lines].reverse().map((l, i) => (
          <div key={i} className="flex justify-center gap-1">
            {l === 1 ? (
              <span className="h-2 w-20 rounded-sm bg-slate-800" />
            ) : (
              <>
                <span className="h-2 w-9 rounded-sm bg-slate-800" />
                <span className="h-2 w-9 rounded-sm bg-slate-800" />
              </>
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 font-bold text-indigo-700">{h.name}</div>
      <div className="text-xs text-slate-400">{hexagramNo}</div>
    </div>
  );
}

export default function IChingTool({ dict, locale }: { dict: Dictionary; locale: Locale }) {
  void locale;
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<IChingResult | null>(null);
  const t = dict.iching;
  const hexNo = (n: number) => t.hexagramNo.replace('{n}', String(n));

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setResult(castHexagram(question.trim() || t.questionPlaceholder));
        }}
        className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <label className="block text-sm text-slate-500">{t.questionLabel}</label>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={t.questionPlaceholder}
          rows={2}
          className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
        <button className="mt-3 w-full rounded-md bg-indigo-600 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700">
          {t.cast}
        </button>
      </form>

      {result ? (
        <section className="mt-8">
          <div className="flex flex-wrap items-start justify-center gap-12">
            <HexView h={result.primary} label={t.primary} hexagramNo={hexNo(result.primary.number)} />
            {result.changed ? (
              <HexView h={result.changed} label={t.changed} hexagramNo={hexNo(result.changed.number)} />
            ) : null}
          </div>
          <p className="mt-6 text-center text-sm text-slate-500">
            {t.movingLines}：
            {result.movingLines.length
              ? result.movingLines.map((i) => i + 1).join('、')
              : t.noMoving}
          </p>
        </section>
      ) : null}
    </>
  );
}
