/** AI 層錯誤型別 — 讓上游(付費牆/route)能分辨「未設定」與「未實作」。 */

export class AiNotConfiguredError extends Error {
  constructor(public readonly providerId: string) {
    super(`AI provider 未設定 API key: ${providerId}`);
    this.name = 'AiNotConfiguredError';
  }
}

/** 仍保留:供未來尚未接 SDK 的 stub provider(如西洋占星)沿用同一錯誤語意。 */
export class AiNotImplementedError extends Error {
  constructor(public readonly providerId: string) {
    super(`AI provider 尚未實作(待接 SDK): ${providerId}`);
    this.name = 'AiNotImplementedError';
  }
}

/**
 * 移除字串中可能夾帶的密鑰片段(sk-... / Bearer ...)。
 * 已驗 OpenAI/Anthropic SDK 錯誤訊息目前不含金鑰,但本層 secrets-adjacent,
 *   自行遮蔽 = 由我們保證不外洩,不依賴 vendor 行為不變(critic 2026-06-26)。
 * ⚠️ 範圍:僅涵蓋 `sk-*` 與 `Bearer *`(= 目前 OpenAI/Anthropic 兩家的格式)。
 *   日後加非 sk- 廠商(如 Gemini `AIza...`)須在此補對應 pattern。
 */
export function redactSecrets(s: string): string {
  const str = String(s); // exported util:防呼叫端傳非字串時 .replace 爆掉
  // 先遮 Bearer(連同其後的 token 整段),再遮獨立的 sk-... — 順序相反會在
  //   "Bearer sk-..." 留下 "Bearer sk-" 殘片。
  return str
    .replace(/Bearer\s+[A-Za-z0-9._-]{8,}/gi, 'Bearer ***REDACTED***')
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-***REDACTED***');
}

/** provider 已設定 key 但實際呼叫 LLM 失敗(網路/額度/API 錯誤/空回應)。 */
export class AiCallError extends Error {
  public readonly detail: string;
  constructor(
    public readonly providerId: string,
    detail: string,
  ) {
    const safe = redactSecrets(detail);
    super(`AI provider 呼叫失敗 (${providerId}): ${safe}`);
    this.detail = safe;
    this.name = 'AiCallError';
  }
}
