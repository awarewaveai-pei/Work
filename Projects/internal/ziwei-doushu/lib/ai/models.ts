import type { AiProviderId, AiTier } from './types';

/**
 * 各 provider 的「分級 → 模型」對照 (PLAN §6:輕量/深度/頂規)。
 *
 * 模型 ID 會隨廠商版本演進而漂移 → 預設值皆可由環境變數覆寫,operator 升級模型
 *   時免改 code:
 *     OPENAI_MODEL_LIGHT / _DEEP / _PREMIUM
 *     ANTHROPIC_MODEL_LIGHT / _DEEP / _PREMIUM
 * 新增 provider = 在這兩張表各加一列即可。
 */
const DEFAULTS: Record<AiProviderId, Record<AiTier, string>> = {
  openai: {
    // ⚠️ 模型的「輸出上限」必須 ≥ 下方 MAX_TOKENS[tier],否則 OpenAI 直接 400
    //   拒絕(不是截斷)。裸 `gpt-4o` alias 部分快照僅 4096 輸出 → deep/premium
    //   會爆;故 deep/premium 釘在 16384 輸出的快照(critic 2026-06-26)。
    //   env 覆寫(OPENAI_MODEL_*)時同樣須選輸出上限足夠的模型。
    //   deep 與 premium 共用同一模型為刻意:目前差異在 token 預算與篇幅指引,
    //   非模型能力;未來頂規可改 env 指向更強模型。
    light: 'gpt-4o-mini', // 16384 輸出
    deep: 'gpt-4o-2024-11-20', // 16384 輸出
    premium: 'gpt-4o-2024-11-20', // 16384 輸出
  },
  anthropic: {
    light: 'claude-haiku-4-5',
    // deep 與 premium 同一模型,差異在 ANTHROPIC_EFFORT 與 token 預算(同 openai 的做法)
    deep: 'claude-opus-5-5',
    premium: 'claude-opus-5-5',
  },
};

const ENV_KEYS: Record<AiProviderId, Record<AiTier, string>> = {
  openai: {
    light: 'OPENAI_MODEL_LIGHT',
    deep: 'OPENAI_MODEL_DEEP',
    premium: 'OPENAI_MODEL_PREMIUM',
  },
  anthropic: {
    light: 'ANTHROPIC_MODEL_LIGHT',
    deep: 'ANTHROPIC_MODEL_DEEP',
    premium: 'ANTHROPIC_MODEL_PREMIUM',
  },
};

/** 解析「provider × tier → model id」,env 覆寫優先,否則回預設。 */
export function modelFor(provider: AiProviderId, tier: AiTier): string {
  return process.env[ENV_KEYS[provider][tier]] || DEFAULTS[provider][tier];
}

/**
 * 各 tier 的輸出長度上限(token)。
 *
 * 抓 prompts/index.ts 各 tier 的字數指引 × CJK 最壞約 2.5 token/字,確保不會把
 *   報告腰斬(chat.completions.create 截斷不會丟錯,會悄悄回半句 — critic 2026-06-26):
 *     light  ≤250 字 → ~625 tok   < 1500
 *     deep   ≤1500字 → ~3750 tok  < 5000
 *     premium≤3500字 → ~8750 tok  < 12000
 *   三者皆 < 16K,故走非串流即可(避免 SDK HTTP timeout 的門檻 ~16K;萬字級串流
 *   輸出是後續增量,屆時加 interpretStream 而不動本接縫)。
 */
/**
 * Anthropic 各 tier 的 effort(claude-opus-5-5 永遠會思考,effort 是唯一控制;API 預設 medium)。
 * light 走 Haiku:Haiku 收到 effort 會 400,故不送。
 */
export const ANTHROPIC_EFFORT: Record<AiTier, 'low' | 'medium' | 'high' | undefined> = {
  light: undefined,
  deep: 'medium',
  premium: 'high',
};

/** 永遠會思考的模型:thinking 佔 max_tokens,需在答案預算外另加空間。 */
export const THINKING_HEADROOM_TOKENS = 8000;
export const ALWAYS_THINKS = /^claude-(opus-5|sonnet-5|fable-5|mythos-5)/;

export const MAX_TOKENS: Record<AiTier, number> = {
  light: 1500,
  deep: 5000,
  premium: 12000,
};
