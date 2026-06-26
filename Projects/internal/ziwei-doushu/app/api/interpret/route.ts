import { NextResponse } from 'next/server';
import { interpret, defaultProvider } from '@/lib/ai/interpret';
import { AiNotConfiguredError } from '@/lib/ai/errors';
import type { AiProviderId, AiTier, InterpretRequest } from '@/lib/ai/types';
import type { InterpretationContext, SystemId } from '@/lib/divination/types';
import { isLocale } from '@/lib/i18n/config';

/**
 * AI 解讀端點 (Phase A — AI 問答入口)。
 *
 * Centaur 信任邊界:client 送來的是「結構化事實」InterpretationContext(由本地
 *   確定性引擎產生,非自由文字),本路由先嚴格驗證形狀/長度上限再餵 LLM →
 *   bound 注入面。LLM 端另有 NO-CALCULATIONS 護欄(lib/ai/prompts)。
 *
 * ⚠️ 付費牆前(Supabase/帳號未接):本端點目前「無配額/無 auth」=展示用。
 *   上 production 前必補:① 帳號 + credits 計量(task: 付費牆邏輯層)
 *   ② rate-limit / Cloudflare Turnstile(PLAN §17)。故此處先不開放 premium tier。
 */
export const dynamic = 'force-dynamic';

const SYSTEM_IDS: readonly SystemId[] = [
  'ziwei',
  'bazi',
  'iching',
  'tarot',
  'astrology',
];
const PROVIDERS: readonly AiProviderId[] = ['openai', 'anthropic'];
/** 付費牆前不開放 premium(頂規),避免未計量成本暴露。 */
const ALLOWED_TIERS: readonly AiTier[] = ['light', 'deep'];

const MAX_FACTS = 60;
const MAX_HEADLINE = 200;
const MAX_LABEL = 60;
const MAX_VALUE = 300;

function bad(detail: string) {
  return NextResponse.json({ error: 'invalid_request', detail }, { status: 400 });
}

type Validated =
  | { ok: true; context: InterpretationContext }
  | { ok: false; detail: string };

function validateContext(c: unknown): Validated {
  if (!c || typeof c !== 'object') return { ok: false, detail: 'context required' };
  const ctx = c as Record<string, unknown>;

  if (
    typeof ctx.systemId !== 'string' ||
    !SYSTEM_IDS.includes(ctx.systemId as SystemId)
  )
    return { ok: false, detail: 'bad systemId' };
  if (typeof ctx.locale !== 'string' || !isLocale(ctx.locale))
    return { ok: false, detail: 'bad locale' };
  if (
    typeof ctx.headline !== 'string' ||
    ctx.headline.length === 0 ||
    ctx.headline.length > MAX_HEADLINE
  )
    return { ok: false, detail: 'bad headline' };
  if (
    !Array.isArray(ctx.facts) ||
    ctx.facts.length === 0 ||
    ctx.facts.length > MAX_FACTS
  )
    return { ok: false, detail: 'bad facts' };

  const facts: { label: string; value: string }[] = [];
  for (const f of ctx.facts) {
    if (!f || typeof f !== 'object') return { ok: false, detail: 'bad fact' };
    const ff = f as Record<string, unknown>;
    if (typeof ff.label !== 'string' || ff.label.length > MAX_LABEL)
      return { ok: false, detail: 'bad fact label' };
    if (typeof ff.value !== 'string' || ff.value.length > MAX_VALUE)
      return { ok: false, detail: 'bad fact value' };
    facts.push({ label: ff.label, value: ff.value });
  }

  return {
    ok: true,
    context: {
      systemId: ctx.systemId as SystemId,
      locale: ctx.locale,
      headline: ctx.headline,
      facts,
    },
  };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return bad('invalid json');
  }
  if (!body || typeof body !== 'object') return bad('body required');
  const b = body as Record<string, unknown>;

  const v = validateContext(b.context);
  if (!v.ok) return bad(v.detail);

  let tier: AiTier = 'deep';
  if (typeof b.tier === 'string') {
    if (!ALLOWED_TIERS.includes(b.tier as AiTier))
      return bad('tier not allowed');
    tier = b.tier as AiTier;
  }

  let provider: AiProviderId = defaultProvider();
  if (typeof b.provider === 'string') {
    if (!PROVIDERS.includes(b.provider as AiProviderId))
      return bad('bad provider');
    provider = b.provider as AiProviderId;
  }

  const req: InterpretRequest = {
    context: v.context,
    tier,
    locale: v.context.locale,
  };

  try {
    const reading = await interpret(req, provider);
    return NextResponse.json(reading);
  } catch (err) {
    if (err instanceof AiNotConfiguredError) {
      return NextResponse.json({ error: 'ai_not_configured' }, { status: 503 });
    }
    // AiCallError 等:不回傳細節(可能含 birth-derived facts / provider 內幕),
    //   也不 console.error 整個 req(user prompt 含生辰衍生事實 — critic 紅線)。
    return NextResponse.json(
      { error: 'interpretation_failed' },
      { status: 502 },
    );
  }
}
