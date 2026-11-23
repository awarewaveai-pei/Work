'use client';

import { useState } from 'react';
import type { InterpretationContext } from '@/lib/divination/types';
import type { Dictionary } from '@/lib/i18n/dictionaries';
import { ogCardUrl, ogParamsFromContext } from '@/lib/og';
import { readParentTicket, requestInterpretation } from '@/lib/ai/memberRequest';

/**
 * 可重用的 AI 解讀區塊 (Phase A — AI 問答入口)。
 * 各系統工具算完盤後,把 InterpretationContext 傳進來;按鈕觸發 → POST
 *   /api/interpret → 顯示 LLM 敘事解讀。Centaur:client 只送結構化事實,
 *   解讀在伺服器端產生(可放付費牆、不外洩 prompt/key)。
 * 在 WordPress 同網域內嵌框裡,送出前向父頁要會員票(lib/ai/memberRequest.ts);拿不到就匿名送。
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
  // 解讀綁定產生它的那份事實:換人／重抽後 context 變了,舊解讀就不再顯示。
  const [reading, setReading] = useState<{ sig: string; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorSig, setErrorSig] = useState<string | null>(null);
  // 會員當日 AI 次數用完(引擎 429 daily_limit_reached):可再試的本地時間,null = 引擎沒給時間
  const [limit, setLimit] = useState<{ sig: string; at: string | null } | null>(null);

  const sig = JSON.stringify(context);
  const text = reading?.sig === sig ? reading.text : null;
  const error = errorSig === sig;
  const limitAt = limit?.sig === sig ? limit : null;

  async function run() {
    setLoading(true);
    setErrorSig(null);
    setLimit(null);
    setReading(null);
    try {
      const ticket = await readParentTicket(window);
      const out = await requestInterpretation(fetch, { context, tier }, ticket);
      if (out.kind === 'ok') setReading({ sig, text: out.text });
      else if (out.kind === 'daily_limit') setLimit({ sig, at: retryAt(out.retryAfterSec, context.locale) });
      else setErrorSig(sig);
    } finally {
      setLoading(false);
    }
  }

  function share() {
    window.open(ogCardUrl(ogParamsFromContext(context)), '_blank', 'noopener');
  }

  return (
    <div className="mt-6">
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button onClick={run} disabled={loading} className="btn-gold">
          {loading ? ai.interpreting : ai.interpret}
        </button>
        <button
          onClick={share}
          style={{
            padding: '0.5rem 1.25rem',
            borderRadius: '0.5rem',
            border: '1px solid var(--gold-400)',
            background: 'transparent',
            color: 'var(--gold-400)',
            fontSize: '0.875rem',
            cursor: 'pointer',
          }}
        >
          {ai.share}
        </button>
      </div>

      {error ? <div className="error-banner mt-4">{ai.error}</div> : null}
      {limitAt ? (
        <div className="error-banner mt-4">
          {limitAt.at ? ai.dailyLimitUntil.replace('{time}', limitAt.at) : ai.dailyLimit}
        </div>
      ) : null}

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

/** 引擎給的秒數 → 訪客本地時間;不在今天就加日期(額度視窗最長 24 小時);沒給就 null(只顯示用完了)。 */
function retryAt(sec: number | null, locale: string): string | null {
  if (sec === null) return null;
  const at = new Date(Date.now() + sec * 1000);
  const sameDay = at.toDateString() === new Date().toDateString();
  const opts: Intl.DateTimeFormatOptions = sameDay
    ? { hour: '2-digit', minute: '2-digit' }
    : { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' };
  return new Intl.DateTimeFormat(locale, opts).format(at);
}
