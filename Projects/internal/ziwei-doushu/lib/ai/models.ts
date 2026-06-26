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
    light: 'gpt-4o-mini',
    deep: 'gpt-4o',
    premium: 'gpt-4o',
  },
  anthropic: {
    light: 'claude-haiku-4-5',
    deep: 'claude-sonnet-4-6',
    premium: 'claude-opus-4-8',
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
 * 各 tier 的輸出長度上限(token)。深度/頂規較長;三者皆 < 16K,故走非串流即可
 *   (避免 SDK HTTP timeout 的門檻是 ~16K;萬字級串流輸出是後續增量,屆時加
 *    interpretStream 而不動本接縫)。
 */
export const MAX_TOKENS: Record<AiTier, number> = {
  light: 1200,
  deep: 4000,
  premium: 8000,
};
