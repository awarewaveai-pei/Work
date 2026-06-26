import type { AiTier } from './ai/types';

/**
 * 付費牆 / credits 邏輯層 (PLAN §7)。
 *
 * 設計為「DB seam, ready-to-apply」:政策判定 evaluateEntitlement() 是純函式、
 *   完全可測;用量/訂閱狀態走 EntitlementStore 介面 → 目前提供記憶體 stub,
 *   實際 Supabase 接線(subscriptions 表 + 當日用量計數 / credit_ledger)為 drop-in,
 *   不需改政策邏輯與路由。
 *
 * 政策(PLAN §7):
 *   - 免費:輕量/深度每日上限 FREE_DAILY_AI_LIMIT 次;頂規(premium)需訂閱。
 *   - 訂閱者:全 tier 無限。
 */

export type Plan = 'free' | 'subscriber';

/** 免費方案每日 AI 解讀上限(PLAN §7:免費 3 次 AI 問答)。 */
export const FREE_DAILY_AI_LIMIT = 3;

export type DenyReason =
  | 'premium_requires_subscription'
  | 'free_daily_limit_reached';

export interface EntitlementInput {
  plan: Plan;
  /** 今日已用 AI 解讀次數 */
  aiUsedToday: number;
  tier: AiTier;
}

export interface EntitlementResult {
  allowed: boolean;
  reason?: DenyReason;
  /** 免費方案本次之後今日剩餘次數(allowed 時) */
  remaining?: number;
}

/** 純政策判定(可測核心)。 */
export function evaluateEntitlement(input: EntitlementInput): EntitlementResult {
  // 訂閱者:全部放行
  if (input.plan === 'subscriber') return { allowed: true };
  // 免費:頂規需訂閱
  if (input.tier === 'premium') {
    return { allowed: false, reason: 'premium_requires_subscription' };
  }
  // 免費:輕量/深度受每日上限
  if (input.aiUsedToday >= FREE_DAILY_AI_LIMIT) {
    return { allowed: false, reason: 'free_daily_limit_reached' };
  }
  return {
    allowed: true,
    remaining: FREE_DAILY_AI_LIMIT - input.aiUsedToday - 1,
  };
}

/**
 * 用量/訂閱狀態儲存 seam。
 * 真實實作(drop-in):讀 subscriptions(plan/status)+ 計當日 readings 數(或
 *   credit_ledger)→ 回 { plan, aiUsedToday };recordUse 寫一筆扣量。
 */
export interface EntitlementStore {
  getStatus(subjectId: string): Promise<{ plan: Plan; aiUsedToday: number }>;
  recordUse(subjectId: string, tier: AiTier): Promise<void>;
}

/**
 * 記憶體 stub(預設,無真 DB 時用)。per-instance、進程重啟即重置 → 僅供 seam
 *   就緒與本機驗證,**非正式計量**(正式計量待 Supabase store)。
 * today 可注入以利測試。
 */
export function createInMemoryStore(
  today: () => string = () => new Date().toISOString().slice(0, 10),
): EntitlementStore {
  const usage = new Map<string, { day: string; count: number }>();
  return {
    async getStatus(subjectId) {
      const day = today();
      const u = usage.get(subjectId);
      const aiUsedToday = u && u.day === day ? u.count : 0;
      return { plan: 'free', aiUsedToday };
    },
    async recordUse(subjectId) {
      const day = today();
      const u = usage.get(subjectId);
      if (u && u.day === day) u.count += 1;
      else usage.set(subjectId, { day, count: 1 });
    },
  };
}

/**
 * 檢查 + 消費:getStatus → evaluate → 允許才 recordUse。
 * 路由在有真實 subjectId(登入使用者)時用此做每日計量;匿名期間僅用
 *   evaluateEntitlement 做 premium gate(見 /api/interpret 註解)。
 */
export async function checkAndConsume(
  store: EntitlementStore,
  subjectId: string,
  tier: AiTier,
): Promise<EntitlementResult> {
  const { plan, aiUsedToday } = await store.getStatus(subjectId);
  const result = evaluateEntitlement({ plan, aiUsedToday, tier });
  if (result.allowed) await store.recordUse(subjectId, tier);
  return result;
}
