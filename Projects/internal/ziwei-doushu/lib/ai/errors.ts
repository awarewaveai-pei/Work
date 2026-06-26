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

/** provider 已設定 key 但實際呼叫 LLM 失敗(網路/額度/API 錯誤/空回應)。 */
export class AiCallError extends Error {
  constructor(
    public readonly providerId: string,
    public readonly detail: string,
  ) {
    super(`AI provider 呼叫失敗 (${providerId}): ${detail}`);
    this.name = 'AiCallError';
  }
}
