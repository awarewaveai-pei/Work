'use client';

import { useState } from 'react';
import type { Dictionary } from '@/lib/i18n/dictionaries';
import { readParentTicket, requestBrief } from '@/lib/ai/memberRequest';
import ReadingText from '@/components/ReadingText';

/**
 * 兩段式 AI 解讀的免費段(卡 Z2):按鈕 → POST /api/reading(stage=brief)→ 簡批(ReadingText 排版)
 * + 程式產生的「深度報告還會寫到」清單。facts 由伺服器從出生資料算,這裡只送出生資料與訪客當地今天。
 * 深度報告的購買與顯示在 Z3;未通過事實核對的解讀不顯示。
 */
export default function TwoStageReading({
  systemId,
  input,
  today,
  ai,
}: {
  systemId: string;
  /** 出生資料(同 /api/v1 的 input) */
  input: Record<string, unknown>;
  /** 訪客當地今天 'YYYY-M-D' */
  today: string;
  ai: Dictionary['ai'];
}) {
  const sig = JSON.stringify([systemId, input, today]);
  const [out, setOut] = useState<{ sig: string; text: string; paidList: string[] } | null>(null);
  const [status, setStatus] = useState<{ sig: string; kind: 'error' | 'check_failed' | 'daily_limit' } | null>(null);
  const [loading, setLoading] = useState(false);

  const shown = out?.sig === sig ? out : null;
  const problem = status?.sig === sig ? status.kind : null;

  async function run() {
    setLoading(true);
    setStatus(null);
    setOut(null);
    try {
      const ticket = await readParentTicket(window);
      const r = await requestBrief(fetch, { systemId, stage: 'brief', input, today }, ticket);
      if (r.kind === 'ok') setOut({ sig, text: r.text, paidList: r.paidList });
      else setStatus({ sig, kind: r.kind });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6">
      <button onClick={run} disabled={loading} className="btn-gold">
        {loading ? ai.interpreting : ai.interpret}
      </button>

      {problem ? (
        <div className="error-banner mt-4">
          {problem === 'check_failed' ? ai.checkFailed : problem === 'daily_limit' ? ai.dailyLimit : ai.error}
        </div>
      ) : null}

      {shown ? (
        <div className="glass-card p-6 mt-4">
          <ReadingText text={shown.text} />
          {shown.paidList.length ? (
            <div className="ai-reading" style={{ marginTop: '1.5rem' }}>
              <h4>{ai.paidTitle}</h4>
              <ul>
                {shown.paidList.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-caption)' }}>{ai.paidSoon}</p>
            </div>
          ) : null}
          <div style={{ marginTop: '1rem', fontSize: '0.75rem', color: 'var(--text-caption)' }}>{ai.disclaimer}</div>
        </div>
      ) : null}
    </div>
  );
}
