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
  if (code === "codex_operator_only") return "Codex 免費生圖只限擁有者本人使用，請改選其他模型。";
  if (code === "codex_worker_offline") return "筆電上的 Codex 生圖程式沒有開（node scripts/codex-image-worker.mjs）。";
  if (code === "codex_no_mask") return "Codex 不能只改選取範圍，請改用有標「填色」的模型。";
  if (code === "codex_quota_exhausted") return "Codex 額度用完了，等額度重設或改用其他模型。";
  if (code === "codex_not_logged_in") return "筆電上的 Codex 沒有登入。";
  if (code === "codex_worker_busy") return "Codex 還在畫上一張，來不及在時限內畫這張，請稍後再試。";
  if (code.startsWith("codex_")) return `Codex 生圖失敗（${code}），請重試或改用其他模型。`;
  return `生成失敗：${code}`;
}
