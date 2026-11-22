'use client';

import { useState } from 'react';
import AiReading from '@/components/AiReading';
import { castHexagram, type IChingResult, type Hexagram } from '@/lib/iching';
import { najiaOf, toContext } from '@/lib/divination/systems/iching';
import type { NajiaChart } from '@/lib/iching/najia';
import { READING_RULE_TEXT, selectReading } from '@/lib/iching/reading';
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

const SERIF = "var(--font-noto-serif-tc), 'PingFang TC', serif";

/** 依變爻讀法該讀的經文(中文原文;英文頁只換標籤與說明)。 */
function ReadingView({
  result,
  locale,
  t,
}: {
  result: IChingResult;
  locale: Locale;
  t: Dictionary['iching'];
}) {
  const plan = selectReading(result);
  const sourceLabel = (source: 'primary' | 'changed') =>
    source === 'primary'
      ? `${t.primary} · ${result.primary.name}`
      : `${t.changed} · ${result.changed?.name ?? ''}`;
  return (
    <div className="glass-card p-6 mt-4" style={{ display: 'grid', gap: '0.75rem' }}>
      <div>
        <div style={{ fontWeight: 700, color: 'var(--gold-400)' }}>{t.readingTitle}</div>
        <div style={{ fontSize: '0.8125rem', color: 'var(--text-caption)', marginTop: '0.25rem' }}>
          {t.readingMethod} — {READING_RULE_TEXT[plan.rule][locale]}
        </div>
      </div>
      {plan.passages.map((p, i) => (
        <div key={i}>
          <div className="label-dark" style={{ fontSize: '0.75rem' }}>
            {sourceLabel(p.source)}
            {p.main ? ` · ${t.readingMain}` : ''}
          </div>
          <p
            lang="zh-Hant"
            style={{
              fontFamily: SERIF,
              fontSize: '1.0625rem',
              lineHeight: 1.9,
              color: 'var(--text-heading)',
              fontWeight: p.main ? 700 : 400,
            }}
          >
            {p.text}
          </p>
        </div>
      ))}
      {t.readingNote ? (
        <p style={{ color: 'var(--text-caption)', fontSize: '0.75rem' }}>{t.readingNote}</p>
      ) : null}
    </div>
  );
}

/** 六爻納甲表:由上爻往下排,與卦象同向。 */
function NajiaView({ chart, t }: { chart: NajiaChart; t: Dictionary['iching'] }) {
  const hasChanged = chart.lines.some((l) => l.changed);
  const cols = hasChanged ? '1fr 1fr 1.2fr 1fr 1fr 1.6fr' : '1fr 1fr 1.2fr 1fr 1fr';
  const head = [t.colSpirit, t.colRelative, t.colGanZhi, t.colLine, t.colMark, ...(hasChanged ? [t.colChanged] : [])];
  const cell = { padding: '0.375rem 0.25rem', borderTop: '1px solid var(--glass-border)' } as const;
  const voidTag = (v: boolean) => (v ? ` (${t.voidMark})` : '');
  const summary = t.najiaSummary
    .replace('{palace}', chart.palace)
    .replace('{wuxing}', chart.wuxing)
    .replace('{generation}', chart.generation)
    .replace('{day}', chart.dayGanZhi)
    .replace('{void}', chart.xunKong.join(''));
  return (
    <div className="glass-card p-6 mt-4" style={{ display: 'grid', gap: '0.75rem' }}>
      <div>
        <div style={{ fontWeight: 700, color: 'var(--gold-400)' }}>{t.najiaTitle}</div>
        <div style={{ fontSize: '0.8125rem', color: 'var(--text-caption)', marginTop: '0.25rem' }}>{summary}</div>
      </div>
      <div role="table" style={{ display: 'grid', gridTemplateColumns: cols, fontSize: '0.875rem', textAlign: 'center' }}>
        <div role="row" style={{ display: 'contents' }}>
          {head.map((h) => (
            <div key={h} role="columnheader" className="label-dark" style={{ fontSize: '0.75rem', padding: '0.25rem' }}>
              {h}
            </div>
          ))}
        </div>
        {[...chart.lines].reverse().map((l) => {
          // 動爻記號依傳統:老陽 ○、老陰 ×
          const mark = l.moving ? (l.yang ? ' ○' : ' ×') : '';
          const row = [
            t.spirits[l.spirit],
            t.relatives[l.relative],
            `${l.ganZhi}${l.wuxing}${voidTag(l.void)}`,
            `${t.lineNames[l.index]} ${l.yang ? '⚊' : '⚋'}${mark}`,
            l.shi ? t.shi : l.ying ? t.ying : '',
            ...(hasChanged
              ? [l.changed ? `${t.relatives[l.changed.relative]} ${l.changed.ganZhi}${l.changed.wuxing}${voidTag(l.changed.void)}` : '']
              : []),
          ];
          return (
            <div key={l.index} role="row" style={{ display: 'contents' }}>
              {row.map((v, i) => (
                <div
                  key={i}
                  role="cell"
                  style={{ ...cell, color: l.shi || l.ying ? 'var(--text-heading)' : 'var(--text-body)', fontWeight: i === 4 && v ? 700 : 400 }}
                >
                  {v}
                </div>
              ))}
            </div>
          );
        })}
      </div>
      {t.najiaNote ? <p style={{ color: 'var(--text-caption)', fontSize: '0.75rem' }}>{t.najiaNote}</p> : null}
    </div>
  );
}

export default function IChingTool({ dict, locale }: { dict: Dictionary; locale: Locale }) {
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<IChingResult | null>(null);
  const [najia, setNajia] = useState<NajiaChart | null>(null);
  const t = dict.iching;
  const hexNo = (n: number) => t.hexagramNo.replace('{n}', String(n));

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const r = castHexagram(question.trim() || t.questionPlaceholder);
          setResult(r);
          setNajia(najiaOf(r));
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
        <section data-aw-result className="mt-8">
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
          {najia ? <NajiaView chart={najia} t={t} /> : null}
          <ReadingView result={result} locale={locale} t={t} />
          <AiReading context={toContext(result, locale, najia ?? undefined)} ai={dict.ai} />
        </section>
      ) : null}
    </>
  );
}
