// Operator-facing wording for site-watch codes and states. No imports on purpose: the server-side
// Telegram/incident text (messages.ts) and the client card (SiteWatchCard.tsx) read this one table.

const FAILURE_LABEL: Record<string, string> = {
  timeout: "載入逾時（15 秒內沒載完）",
  http_4xx: "頁面回應 4xx（找不到或被拒）",
  http_5xx: "伺服器錯誤 5xx",
  dns: "網域解析失敗",
  connect: "連線失敗（拒絕連線或 SSL 憑證問題）",
  blocked: "網址被安全政策拒絕（請檢查客戶網址設定）",
  navigation: "頁面無法開啟",
};

export function failureLabel(code: string | null): string {
  if (!code) return "正常";
  return FAILURE_LABEL[code] ?? code;
}

export const FREQUENCY_LABEL: Record<string, string> = {
  hourly: "每小時",
  every_6h: "每 6 小時",
  daily: "每天",
  update_only: "只在更新時",
};

export const ALERT_STATE_LABEL: Record<string, string> = {
  none: "—",
  pending: "告警待送",
  uncertain: "告警送出中（可能已達）",
  sent: "已通知",
  skipped: "未發 Telegram（政策）",
};

export const RECOVERY_STATE_LABEL: Record<string, string> = {
  none: "",
  pending_resolve: "待結案",
  pending_send: "恢復訊息待送",
  uncertain: "恢復訊息送出中（可能已達）",
};

export const VISUAL_STATUS_LABEL: Record<string, string> = {
  baseline_created: "建立基準",
  match: "畫面一致",
  diff: "畫面變動",
  skipped: "未比對",
};
