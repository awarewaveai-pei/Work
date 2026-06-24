'use client';

import { useState } from 'react';
import { castHexagram, type IChingResult, type Hexagram } from '@/lib/iching';
import type { Locale } from '@/lib/i18n/config';
import type { Dictionary } from '@/lib/i18n/dictionaries';

function HexView({ h, label, hexagramNo }: { h: Hexagram; label: string; hexagramNo: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ marginBottom: '0.75rem', fontSize: '0.8125rem', color: 'var(--text-caption)' }}>
        {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
        {[...h.lines].reverse().map((l, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'center', gap: '6px' }}>
            {l === 1 ? (
              <span className="hex-line-yang" />
            ) : (
              <>
                <span className="hex-line-yin-l" />
                <span className="hex-line-yin-r" />
              </>
            )}
          </div>
        ))}
      </div>
      <div
        style={{
          marginTop: '0.75rem',
          fontWeight: 700,
          color: 'var(--gold-400)',
          textShadow: '0 0 10px var(--gold-glow)',
          fontFamily: "var(--font-noto-serif-tc), 'PingFang TC', serif",
          fontSize: '1rem',
        }}
      >
        {h.name}
      </div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-caption)', marginTop: '0.2rem' }}>
        {hexagramNo}
      </div>
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
        className="glass-card p-6"
      >
        <label style={{ display: 'block', marginBottom: '0.75rem' }}>
          <span className="label-dark" style={{ display: 'block', marginBottom: '0.5rem' }}>
            {t.questionLabel}
          </span>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={t.questionPlaceholder}
            rows={2}
            className="field-dark"
            style={{ resize: 'vertical' }}
          />
        </label>
        <button type="submit" className="btn-gold">
          {t.cast}
        </button>
      </form>

      {result ? (
        <section className="mt-8">
          <hr className="star-divider" />
          <div
            className="glass-card p-8"
            style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'center', gap: '3rem' }}
          >
            <HexView h={result.primary} label={t.primary} hexagramNo={hexNo(result.primary.number)} />
            {result.changed ? (
              <>
                <div style={{ alignSelf: 'center', color: 'var(--text-caption)', fontSize: '1.25rem' }}>→</div>
                <HexView h={result.changed} label={t.changed} hexagramNo={hexNo(result.changed.number)} />
              </>
            ) : null}
          </div>
          <p
            className="mt-4 text-center"
            style={{ fontSize: '0.875rem', color: 'var(--text-caption)' }}
          >
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
