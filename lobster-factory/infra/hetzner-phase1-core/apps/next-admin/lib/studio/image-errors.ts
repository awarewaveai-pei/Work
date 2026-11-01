/** One wording for every image-generation failure the browser shows (generate, fabric-print). */
export function friendlyImageError(code: string): string {
  if (code === "no_credits") return "點數不足。";
  if (code.includes("billing_hard_limit") || code.includes("insufficient_quota"))
    return "OpenAI 帳號額度已達上限 — 請到 platform.openai.com → Billing 加額度後再試（FLUX 模型不受影響）。";
  if (code.includes("missing_openai")) return "伺服器未設定 OpenAI 金鑰。";
  if (code.includes("missing_replicate")) return "伺服器未設定 Replicate 金鑰。";
  if (code.includes("content_policy") || code.includes("moderation"))
    return "提示詞被內容安全政策擋下，請調整描述。";
  if (code.includes("character_reference_required")) return "此模型需要至少 1 張角色參考圖。";
  if (code === "generation_timeout") return "生成逾時，請重試或改用較快的模型（FLUX schnell）。";
  return `生成失敗：${code}`;
}
