'use client';

import { useState } from 'react';
import BirthForm from '@/components/BirthForm';
import ZiweiChart from '@/components/ZiweiChart';
import { computeChart, type ChartRequest, type ChartResult } from '@/lib/ziwei';
import type { Locale } from '@/lib/i18n/config';
import type { Dictionary } from '@/lib/i18n/dictionaries';

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
        <div className="error-banner mt-6">{error}</div>
      ) : null}

      {result ? (
        <section className="mt-8">
          <hr className="star-divider" />
          <ZiweiChart result={result} dict={dict} />
        </section>
      ) : null}
    </>
  );
}
