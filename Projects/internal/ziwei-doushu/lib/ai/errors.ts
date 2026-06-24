/** AI 層錯誤型別 — 讓上游(付費牆/route)能分辨「未設定」與「未實作」。 */

export class AiNotConfiguredError extends Error {
  constructor(public readonly providerId: string) {
    super(`AI provider 未設定 API key: ${providerId}`);
    this.name = 'AiNotConfiguredError';
  }
}

export class AiNotImplementedError extends Error {
  constructor(public readonly providerId: string) {
    super(`AI provider 尚未實作(待接 SDK): ${providerId}`);
    this.name = 'AiNotImplementedError';
  }
}
