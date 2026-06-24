'use client';

import { useState } from 'react';
import BirthForm from '@/components/BirthForm';
import ZiweiChart from '@/components/ZiweiChart';
import { computeChart, type ChartRequest, type ChartResult } from '@/lib/ziwei';
import type { Locale } from '@/lib/i18n/config';
import type { Dictionary } from '@/lib/i18n/dictionaries';

/**
 * 互動排盤工具 (Client Island)。
 * 排盤在瀏覽器端用 iztro 計算 (computeChart),不需後端;命盤資料的語言
 * 由 locale 決定 (傳入 computeChart → iztro lang)。UI 文字走 dict。
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

      {error ? (
        <p className="mt-6 rounded-md bg-rose-50 p-3 text-center text-sm text-rose-600">
          {error}
        </p>
      ) : null}

      {result ? (
        <section className="mt-8">
          <ZiweiChart result={result} dict={dict} />
        </section>
      ) : null}
    </>
  );
}
