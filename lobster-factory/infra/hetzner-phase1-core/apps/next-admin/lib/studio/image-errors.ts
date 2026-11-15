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
  if (code === "codex_worker_offline") return "筆電沒開：按左下角「啟動筆電」，等它顯示在線後再按一次生成。";
  if (code === "codex_no_mask") return "Codex 不能只改選取範圍，請改用有標「填色」的模型。";
  if (code === "codex_quota_exhausted") return "Codex 額度用完了，等額度重設或改用其他模型。";
  if (code === "codex_not_logged_in") return "筆電上的 Codex 沒有登入。";
  if (code === "codex_worker_busy") return "Codex 前面還有圖在排，4 分鐘內沒輪到這張，請稍後再按一次。";
  if (code === "codex_worker_timeout" || code === "codex_timeout") return "Codex 畫超過 4 分鐘還沒交圖，請再按一次（筆電若在睡眠請先喚醒）。";
  if (code === "codex_job_gone") return "找不到這張 Codex 圖（伺服器剛重啟，或已經取走），請再按一次生成。";
  if (code === "codex_not_deferred") return "這裡不能用 Codex 生圖（批次或自動流程等不了它），請改選其他模型。";
  if (code.startsWith("codex_")) return `Codex 生圖失敗（${code}），請重試或改用其他模型。`;
  return `生成失敗：${code}`;
}
