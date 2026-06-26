import type { InterpretationContext } from './divination/types';

/**
 * 分享圖卡 (OG) URL 建構 — 純函式,client/server 共用、可測。
 * 卡片由 /api/og 動態渲染(Satori/ImageResponse),參數走 query string。
 */
export interface OgParams {
  type: string;
  title: string;
  subtitle?: string;
  lines?: string[];
}

export function ogCardUrl(p: OgParams): string {
  const q = new URLSearchParams();
  q.set('type', p.type);
  q.set('title', p.title);
  if (p.subtitle) q.set('subtitle', p.subtitle);
  const lines = (p.lines ?? []).filter(Boolean);
  if (lines.length) q.set('lines', lines.join('|'));
  return `/api/og?${q.toString()}`;
}

/** 由解讀 context 取卡片參數:標題用 headline,內文取前幾條事實值。 */
export function ogParamsFromContext(ctx: InterpretationContext): OgParams {
  return {
    type: ctx.systemId,
    title: ctx.headline,
    lines: ctx.facts.map((f) => f.value).filter(Boolean).slice(0, 5),
  };
}
