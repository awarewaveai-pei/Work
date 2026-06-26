'use client';

import { useState } from 'react';
import type { InterpretationContext } from '@/lib/divination/types';
import type { Dictionary } from '@/lib/i18n/dictionaries';

/**
 * 可重用的 AI 解讀區塊 (Phase A — AI 問答入口)。
 * 各系統工具算完盤後,把 InterpretationContext 傳進來;按鈕觸發 → POST
 *   /api/interpret → 顯示 LLM 敘事解讀。Centaur:client 只送結構化事實,
 *   解讀在伺服器端產生(可放付費牆、不外洩 prompt/key)。
 */
export default function AiReading({
  context,
  ai,
  tier = 'deep',
}: {
  context: InterpretationContext;
  ai: Dictionary['ai'];
  tier?: 'light' | 'deep';
}) {
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function run() {
    setLoading(true);
    setError(false);
    setText(null);
    try {
      const res = await fetch('/api/interpret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context, tier }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { text?: unknown };
      setText(typeof data.text === 'string' ? data.text : '');
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6">
      <button onClick={run} disabled={loading} className="btn-gold">
        {loading ? ai.interpreting : ai.interpret}
      </button>

      {error ? <div className="error-banner mt-4">{ai.error}</div> : null}

      {text ? (
        <div
          className="glass-card p-6 mt-4"
          style={{
            whiteSpace: 'pre-wrap',
            lineHeight: 1.8,
            color: 'var(--text-body)',
            fontSize: '0.9375rem',
          }}
        >
          {text}
          <div
            style={{
              marginTop: '1rem',
              fontSize: '0.75rem',
              color: 'var(--text-caption)',
            }}
          >
            {ai.disclaimer}
          </div>
        </div>
      ) : null}
    </div>
  );
}
