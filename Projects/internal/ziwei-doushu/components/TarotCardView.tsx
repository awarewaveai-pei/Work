'use client';

import { useState } from 'react';
import Image from 'next/image';
import type { DrawnCard } from '@/lib/tarot';
import type { Locale } from '@/lib/i18n/config';

/** 牌圖路徑:public/tarot/<牌 id>.webp,牌背 back.webp(檔案與雜湊由 lib/tarotArt.test.ts 鎖住)。 */
export const tarotArtSrc = (id: string) => `/tarot/${id}.webp`;

interface Labels {
  upright: string;
  reversed: string;
  flipHint: string;
}

/**
 * 一張抽出的牌:未翻開顯示牌背,翻開顯示牌面(逆位旋轉 180°)。
 * 圖檔載入失敗 → 退回純文字卡(直接顯示牌名與正逆位),不留破圖。
 */
export default function TarotCardView({
  drawn,
  position,
  revealed,
  onToggle,
  locale,
  labels,
}: {
  drawn: DrawnCard;
  position: string;
  revealed: boolean;
  onToggle: () => void;
  locale: Locale;
  labels: Labels;
}) {
  const [failed, setFailed] = useState(false);
  const showFace = failed || revealed;
  const name = drawn.card.name[locale];

  return (
    <div className={`tarot-card ${showFace ? (drawn.reversed ? 'reversed' : 'upright') : ''}`}>
      <div style={{ fontSize: '0.65rem', color: 'var(--gold-400)', marginBottom: '0.4rem', minHeight: '1.6em' }}>
        {position}
      </div>
      {failed ? null : (
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={revealed}
          aria-label={revealed ? name : labels.flipHint}
          style={{
            display: 'block',
            width: '100%',
            aspectRatio: '2 / 3',
            position: 'relative',
            marginBottom: '0.5rem',
            padding: 0,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
          }}
        >
          <Image
            src={tarotArtSrc(revealed ? drawn.card.id : 'back')}
            alt={revealed ? name : ''}
            fill
            sizes="160px"
            unoptimized
            onError={() => setFailed(true)}
            style={{
              objectFit: 'cover',
              borderRadius: 'var(--radius-md)',
              transform: revealed && drawn.reversed ? 'rotate(180deg)' : undefined,
            }}
          />
        </button>
      )}
      {showFace ? (
        <>
          <div
            style={{
              fontSize: '0.875rem',
              fontWeight: 600,
              color: 'var(--text-heading)',
              marginBottom: '0.5rem',
              fontFamily: "var(--font-heading), 'PingFang TC', serif",
            }}
          >
            {name}
          </div>
          <div
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: drawn.reversed ? 'var(--rose-400)' : 'var(--jade-400)',
            }}
          >
            {drawn.reversed ? labels.reversed : labels.upright}
          </div>
        </>
      ) : (
        <div style={{ fontSize: '0.75rem', color: 'var(--text-caption)' }}>{labels.flipHint}</div>
      )}
    </div>
  );
}
