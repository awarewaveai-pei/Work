'use client';

import { useEffect, useRef, useState } from 'react';
import type { Dictionary } from '@/lib/i18n/dictionaries';
import { prefillOnce, readParentBirth, type StoredBirth } from '@/lib/member/birthPrefill';

/**
 * 出生資料表單的會員預填(lib/member/birthPrefill.ts)。掛載後向同源父頁讀一次;使用者動過任何欄位
 *   (表單在 <form onInputCapture> 與按鈕／選地點處呼叫 markTouched)之後讀到的一律不套用。
 *   enabled=false(合婚第二人)完全不讀。apply 回 false = 這筆用不了,不顯示提示。
 * 獨立站沒有父頁:readParentBirth 立刻回 null,表單與以前相同。
 */
export function useBirthPrefill(apply: (b: StoredBirth) => boolean | void, enabled = true) {
  const touched = useRef(false);
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const [prefilled, setPrefilled] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let live = true; // 卸載(含開發模式的二次掛載)後讀到的不套用
    void prefillOnce(
      () => readParentBirth(window),
      () => touched.current || !live,
      (b) => applyRef.current(b),
    ).then((ok) => {
      if (ok && live) setPrefilled(true);
    });
    return () => {
      live = false;
    };
  }, [enabled]);
  return {
    prefilled,
    markTouched: () => {
      touched.current = true;
    },
    hide: () => setPrefilled(false),
  };
}

/** 一行不打擾的提示:已帶入 + 清除(回到表單原本的預設值)。 */
export function PrefillNotice({ dict, onClear }: { dict: Dictionary; onClear: () => void }) {
  return (
    <p className="no-correction-text" role="status" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
      <span>{dict.form.prefilled}</span>
      <button
        type="button"
        onClick={onClear}
        style={{ background: 'none', border: 'none', padding: 0, color: 'var(--gold-400)', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}
      >
        {dict.form.prefillClear}
      </button>
    </p>
  );
}
