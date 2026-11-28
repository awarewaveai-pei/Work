import { AiNotConfiguredError } from '../errors';
import { checkFacts, type Vocabulary } from './factCheck';
import { buildBriefPrompt, buildChapterPrompt, CLOSING_HEADING } from './prompts';
import type { Llm, ReadingPlan, Usage } from './types';

/**
 * 兩段式解讀的生成與把關(卡 Z2)。模型輸出先過結構驗證、再過事實核對;任一不過就整份不給(不退回舊版長文,不給半份)。
 * 模型(SPEC §8,價格 2026-11-29 對 developers.openai.com/api/docs/pricing 查實):簡批 gpt-6-luna、深度 gpt-6.2-sol;env 可覆寫。
 * 其他工具的 light/deep/premium 分級(lib/ai/models.ts)不受影響。
 */
export const TWO_STAGE_MODELS = {
  brief: () => process.env.OPENAI_MODEL_BRIEF || 'gpt-6-luna',
  report: () => process.env.OPENAI_MODEL_REPORT || 'gpt-6.2-sol',
};

/** USD／百萬 token(輸入、快取輸入、輸出),短上下文標準價;來源同上。 */
export const PRICES_USD_PER_M: Record<string, [number, number, number]> = {
  'gpt-6-luna': [0.1, 0.01, 0.5],
  'gpt-6.1-terra': [1, 0.05, 5],
  'gpt-6.2-sol': [2, 0.1, 10],
  'gpt-6.2-astra': [8, 0.4, 40],
};
export const USD_TO_NTD = 32;

/** 一次呼叫的成本(NT$);價目表沒有的型號回 null。output 已含推理 token(OpenAI 計費口徑)。 */
export function costNtd(u: Usage): number | null {
  const p = PRICES_USD_PER_M[u.model];
  if (!p) return null;
  const usd = ((u.input - u.cachedInput) * p[0] + u.cachedInput * p[1] + u.output * p[2]) / 1_000_000;
  return usd * USD_TO_NTD;
}

export type GenerateResult =
  | { ok: true; text: string; usage: Usage[] }
  | { ok: false; error: 'bad_structure' | 'unsupported_claims' | 'call_failed'; detail: string[]; usage: Usage[] };

const HEADING = /^##\s+(.+?)\s*$/;
const MARKER = /〔(H\d)〕/g;

/** 依「## 」切段:回 [標題, 內文] 陣列(標題前的文字丟棄)。 */
function splitSections(text: string): [string, string][] {
  const out: [string, string][] = [];
  for (const line of text.split('\n')) {
    const h = HEADING.exec(line.trim());
    if (h) out.push([h[1], '']);
    else if (out.length) out[out.length - 1][1] += `${line}\n`;
  }
  return out;
}

/** 簡批結構:六段標題與順序、免費段、結尾鉤子(恰為程式挑的那幾項,各一次);六段各至少點名一顆詞表內的星。 */
export function validateBrief(text: string, plan: ReadingPlan, vocab: Vocabulary): string[] {
  const errors: string[] = [];
  const secs = splitSections(text);
  const expected = [
    ...plan.sections,
    ...(plan.bonus ? [plan.bonus.heading] : []),
    ...(plan.hooks.length ? [CLOSING_HEADING] : []),
  ];
  const got = secs.map(([h]) => h);
  if (JSON.stringify(got) !== JSON.stringify(expected)) {
    errors.push(`headings: expected ${expected.join('|')} got ${got.join('|')}`);
    return errors;
  }
  plan.sections.forEach((name, i) => {
    const body = secs[i][1];
    if (!vocab.terms.some((t) => body.includes(t))) errors.push(`section ${name}: no star cited`);
  });
  if (plan.hooks.length) {
    const closing = secs[secs.length - 1][1];
    const lines = closing.split('\n').filter((l) => l.trim() !== '');
    const items = lines.filter((l) => /^\s*([-*]|\d+\.)\s+/.test(l));
    // 結尾段只准條列鉤子:散文行(例如「欲知詳情請購買」)不放行
    if (items.length !== lines.length) errors.push('hooks: closing has non-list lines');
    const keys = items.map((l) => [...l.matchAll(MARKER)].map((m) => m[1]));
    const flat = keys.flat();
    const want = plan.hooks.map((h) => h.key);
    if (keys.some((k) => k.length !== 1) || flat.length !== want.length || want.some((k) => !flat.includes(k))) {
      errors.push(`hooks: expected ${want.join(',')} got ${keys.map((k) => k.join('+') || '?').join(',')}`);
    }
  }
  return errors;
}

/** 生成簡批:結構驗證 → 事實核對(對簡批 facts)→ 去掉鉤子標記。 */
export async function generateBrief(plan: ReadingPlan, llm: Llm, vocab: Vocabulary): Promise<GenerateResult> {
  const { system, user } = buildBriefPrompt(plan);
  const r = await llm({ model: TWO_STAGE_MODELS.brief(), system, user, maxTokens: 16000, effort: 'low' });
  const usage = [r.usage];
  const structure = validateBrief(r.text, plan, vocab);
  if (structure.length) return { ok: false, error: 'bad_structure', detail: structure, usage };
  const check = checkFacts(r.text, plan.briefFacts, vocab);
  if (!check.ok) return { ok: false, error: 'unsupported_claims', detail: check.unsupported, usage };
  return { ok: true, text: r.text.replace(MARKER, '').replace(/\n{3,}/g, '\n\n').trim(), usage };
}

/**
 * 生成深度報告:各章平行產生,每章只拿該章 facts,也只對該章 facts 核對(章與章不互相借事實)。
 * 呼叫端必須先驗過購買票(lib/sites/purchase.ts);本函式不驗票。
 */
export async function generateDeepReport(
  plan: ReadingPlan,
  llm: Llm,
  vocab: Vocabulary,
  model: string = TWO_STAGE_MODELS.report(),
): Promise<GenerateResult> {
  // allSettled:一章失敗也等其他章結束,用量照記(已計費的呼叫不能從成本紀錄消失)
  const settled = await Promise.allSettled(
    plan.chapters.map(async (ch) => {
      const { system, user } = buildChapterPrompt(plan, ch);
      const r = await llm({ model, system, user, maxTokens: 32000, effort: 'medium' });
      const secs = splitSections(r.text);
      const errors: string[] = [];
      if (secs[0]?.[0] !== ch.title) errors.push(`chapter ${ch.id}: heading`);
      const check = checkFacts(r.text, ch.facts, vocab);
      return { ch, r, errors, unsupported: check.unsupported.map((u) => `${ch.id}:${u}`) };
    }),
  );
  const results = settled.flatMap((s) => (s.status === 'fulfilled' ? [s.value] : []));
  const usage = results.map((x) => x.r.usage);
  const rejected = settled.flatMap((s, i) => (s.status === 'rejected' ? [{ id: plan.chapters[i].id, reason: s.reason as unknown }] : []));
  if (rejected.length) {
    // 未設定金鑰仍照舊往上拋(route 回 503);其他呼叫錯誤只回章 id 與錯誤類別,不含提示詞
    const notConfigured = rejected.find((x) => x.reason instanceof AiNotConfiguredError);
    if (notConfigured) throw notConfigured.reason;
    return {
      ok: false,
      error: 'call_failed',
      detail: rejected.map((x) => `${x.id}:${x.reason instanceof Error ? x.reason.name : 'error'}`),
      usage,
    };
  }
  const structure = results.flatMap((x) => x.errors);
  if (structure.length) return { ok: false, error: 'bad_structure', detail: structure, usage };
  const unsupported = results.flatMap((x) => x.unsupported);
  if (unsupported.length) return { ok: false, error: 'unsupported_claims', detail: unsupported, usage };
  return { ok: true, text: results.map((x) => x.r.text.trim()).join('\n\n'), usage };
}
