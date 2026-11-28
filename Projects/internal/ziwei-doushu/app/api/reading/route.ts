import { NextResponse } from 'next/server';
import { parseInput } from '@/lib/divination/input';
import { SYSTEM_IDS, type SystemId } from '@/lib/divination/types';
import { AiCallError, AiNotConfiguredError } from '@/lib/ai/errors';
import { openaiComplete } from '@/lib/ai/providers/openai';
import { costNtd, generateBrief, generateDeepReport, type GenerateResult } from '@/lib/ai/twoStage/generate';
import { TWO_STAGE } from '@/lib/ai/twoStage/registry';
import type { Llm } from '@/lib/ai/twoStage/types';
import { INTERPRET_RULE, hit, rateLimited } from '@/lib/http/rateLimit';
import { SITE_SIGNATURE_HEADER } from '@/lib/sites/verify';
import { SITE_TICKET_HEADER, verifyTicket } from '@/lib/sites/ticket';
import { chartKey, verifyPurchaseTicket } from '@/lib/sites/purchase';

/**
 * 兩段式 AI 解讀(卡 Z2;SPEC §8)。與 /api/interpret 不同:facts 由伺服器從出生資料算,不收 client 給的 facts,
 *   鉤子、付費清單、事實核對才有可信的來源。
 * POST {systemId, stage:'brief'|'deep', input:<出生資料,同 /api/v1>, today:'YYYY-M-D'(訪客當地今天)}
 * - brief:免費簡批 + 程式產生的「付費可得知的內容」+ chartKey(Z3 購買時記下)。會員票(aud=ticket)可選,帶了就計每日次數。
 * - deep:必須帶購買票(aud=report,票上 report 與 chart 要對上這張盤),否則 401/403,不呼叫 AI、不回任何深度內容。
 * 生成結果過結構驗證與事實核對;不過就 502,不給半份、不退回舊版。
 */
export const dynamic = 'force-dynamic';
/** 深度報告分章平行產生,單章最長 180 秒(lib/ai/providers/openai.ts openaiComplete) */
export const maxDuration = 300;

const DAY_MS = 86_400_000;
const TODAY = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;

/** 模型呼叫一律 OpenAI(SPEC §8);測試以 vi.mock 換掉 openaiComplete。 */
const llm: Llm = (req) => openaiComplete(req);

function bad(detail: string | string[]) {
  return NextResponse.json({ error: 'invalid_request', detail }, { status: 400 });
}

/** today 必須是真日期,且與伺服器時間相差不超過 2 天(各時區的「今天」都在內;不讓人指定任意年份)。 */
function validToday(s: unknown, now: number): s is string {
  if (typeof s !== 'string') return false;
  const m = TODAY.exec(s);
  if (!m) return false;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(t);
  if (d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) return false;
  return Math.abs(t - now) <= 2 * DAY_MS;
}

/** 每次生成記一行用量與成本(只有型號與 token 數,不含出生資料與內容),供成本監看。 */
function logUsage(stage: string, r: GenerateResult) {
  const cost = r.usage.reduce((sum, u) => sum + (costNtd(u) ?? 0), 0);
  console.info(`[reading] ${stage} ok=${r.ok} calls=${r.usage.length} models=${[...new Set(r.usage.map((u) => u.model))].join(',')} in=${r.usage.reduce((s, u) => s + u.input, 0)} out=${r.usage.reduce((s, u) => s + u.output, 0)} ntd=${cost.toFixed(3)}`);
}

function failed(r: Extract<GenerateResult, { ok: false }>) {
  // detail 只含段名與星曜、格局等詞,不含出生資料
  return NextResponse.json({ error: r.error, detail: r.detail }, { status: 502 });
}

export async function POST(request: Request) {
  const limited = rateLimited(request, 'reading', INTERPRET_RULE);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return bad('invalid json');
  }
  if (!body || typeof body !== 'object') return bad('body required');
  const b = body as Record<string, unknown>;
  if (typeof b.systemId !== 'string' || !(SYSTEM_IDS as readonly string[]).includes(b.systemId)) return bad('bad systemId');
  const sys = TWO_STAGE[b.systemId as SystemId];
  if (!sys) return bad('system has no two-stage reading');
  if (b.stage !== 'brief' && b.stage !== 'deep') return bad('bad stage');
  if (!validToday(b.today, Date.now())) return bad('bad today');
  const parsed = parseInput(sys.input, b.input);
  if (!parsed.ok) return bad(parsed.errors);
  const birth = parsed.value as Record<string, unknown>;
  const key = chartKey(b.systemId, birth);

  const ticket = request.headers.get(SITE_TICKET_HEADER);
  const signature = request.headers.get(SITE_SIGNATURE_HEADER);

  if (b.stage === 'deep') {
    // 擁有權守衛:沒票、錯票、別張盤／別種報告的票都在這裡擋下,之後才碰模型
    const p = verifyPurchaseTicket(ticket, signature, { report: sys.report, chart: key });
    if (!p.ok) return NextResponse.json({ error: p.error }, { status: p.status });
  } else if (ticket !== null) {
    const t = verifyTicket(ticket, signature);
    if (!t.ok) return NextResponse.json({ error: t.error }, { status: t.status });
    const r = hit('ai-day', `${t.site.keyId}:${t.member}`, { limit: t.site.aiPerDay, windowMs: DAY_MS });
    if (!r.ok) {
      return NextResponse.json(
        { error: 'daily_limit_reached', detail: `daily AI limit reached; retry in ${r.retryAfterSec}s` },
        { status: 429, headers: { 'Retry-After': String(r.retryAfterSec) } },
      );
    }
  }

  let plan;
  try {
    plan = sys.plan(birth as never, b.today as string);
  } catch {
    return NextResponse.json({ error: 'compute_failed' }, { status: 422 });
  }

  try {
    if (b.stage === 'deep') {
      const r = await generateDeepReport(plan, llm, sys.vocab);
      logUsage('deep', r);
      return r.ok ? NextResponse.json({ text: r.text, chartKey: key }) : failed(r);
    }
    const r = await generateBrief(plan, llm, sys.vocab);
    logUsage('brief', r);
    if (!r.ok) return failed(r);
    return NextResponse.json({ text: r.text, paidList: plan.paidList.map((p) => p.text), chartKey: key });
  } catch (err) {
    if (err instanceof AiNotConfiguredError) return NextResponse.json({ error: 'ai_not_configured' }, { status: 503 });
    if (err instanceof AiCallError) return NextResponse.json({ error: 'interpretation_failed' }, { status: 502 });
    throw err;
  }
}
