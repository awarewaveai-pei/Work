'use client';

import { useState } from 'react';
import BirthForm from '@/components/BirthForm';
import ZiweiChart from '@/components/ZiweiChart';
import { computeChart, type ChartRequest, type ChartResult } from '@/lib/ziwei';

export default function Home() {
  const [result, setResult] = useState<ChartResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(req: ChartRequest) {
    try {
      setError(null);
      setResult(computeChart(req));
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : '排盤失敗，請檢查輸入');
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-slate-900">紫微斗數命盤</h1>
          <p className="mt-2 text-sm text-slate-500">
            專業級排盤 · 真太陽時校正 · 三方四正一目了然
          </p>
        </header>

        <BirthForm onSubmit={handleSubmit} />

        {error ? (
          <p className="mt-6 rounded-md bg-rose-50 p-3 text-center text-sm text-rose-600">{error}</p>
        ) : null}

        {result ? (
          <section className="mt-8">
            <ZiweiChart result={result} />
          </section>
        ) : null}
      </div>
    </main>
  );
}
