// Words for staff-created client accounts: the ops panel, the set-password page and the two emails. Written by GPT
// (codex-oracle inspect, agency-os/reports/oracle/2026-10-16-inspect-b3200efc.md + -5bfe6007.md) to the operator's rule
// 清楚易懂、不冗長.
// Pure strings so client components and the server share one copy.
// "24 小時" = GoTrue GOTRUE_MAILER_OTP_EXP, unset on prod = default 86400 s (checked 2026-10-16); change both together.

export const ACCOUNT_COPY = {
  card_title: "建立客戶帳號",
  card_intro:
    "此頁可為客戶員工建立帳號，並寄送設定密碼的連結。帳號持有人設定密碼後，可立即查看此客戶在社群發文中的內容；如要編輯或審核，品牌擁有者需到「社群發文 → 設定 → 成員」新增帳號。",
  newest_only: "只有最新寄出的電子郵件連結有效。",
  delete_button: "刪除帳號",
  delete_confirm: "確定要刪除 {email} 的帳號嗎？刪除後，對方會被登出，帳號也會移除。",
  deleted: "已刪除 {email} 的帳號，對方已登出。",
  err_still_member: "無法刪除 {email} 的帳號，因為該帳號仍是品牌成員。請先到「社群發文 → 設定 → 成員」移除該成員。",
  err_mail_not_configured_existing: "伺服器尚未設定寄信功能，未寄出電子郵件，也未建立帳號。",
  err_pw_weak: "伺服器拒絕此密碼，因為密碼強度不足。請改用較長或較少見的密碼。",
  err_pw_same: "新密碼與舊密碼相同，請輸入不同的密碼。",
  err_pw_too_long: "密碼過長，請縮短至約 24 個中文字或 72 個英文字母以內。",
  email_label: "電子郵件",
  email_placeholder: "請輸入電子郵件",
  product_label: "登入產品",
  send_button: "建立帳號並寄送",
  sending: "寄送中…",
  sent_new: "已建立帳號，邀請信已寄至 {email}。",
  sent_resend: "已重新寄送邀請信至 {email}。",
  sent_recovery: "已寄送重設密碼信至 {email}。",
  list_title: "客戶帳號",
  list_empty: "目前沒有帳號。",
  status_verified: "已驗證",
  status_pending: "等待開啟郵件",
  resend_button: "重新寄送",
  reset_button: "重設密碼",
  err_email_taken: "此電子郵件已屬於 AwareWave 員工或其他客戶。",
  err_invalid_email: "請輸入有效的電子郵件。",
  err_mail_not_configured: "伺服器尚未設定寄信功能。新帳號已建立，但尚未寄出電子郵件。",
  err_mail_failed: "寄送失敗。請再次按下按鈕重新寄送。",
  err_forbidden: "只有擁有者或管理員可以執行此操作。",
  err_generic: "操作失敗，請稍後再試。",
  mail_invite_subject: "{org} 邀請你使用 {product}",
  mail_invite_body:
    "{org} 透過 AwareWave 邀請你使用 {product}。\n請開啟以下連結並設定密碼：{link}\n連結有效 24 小時，且只能使用一次。\n如果你沒有預期收到這封信，請忽略它。",
  mail_recovery_subject: "{product} 重設密碼",
  mail_recovery_body:
    "請使用以下連結重設 {product} 的密碼：{link}\n連結有效 24 小時，且只能使用一次。\n如果你沒有要求重設密碼，請忽略這封信。",
  page_title: "設定密碼",
  page_intro: "請設定密碼以完成帳號驗證。",
  pw_label: "密碼",
  pw2_label: "確認密碼",
  pw_hint: "密碼至少需要 8 個字元。",
  submit: "設定密碼",
  submitting: "儲存中…",
  err_pw_short: "密碼至少需要 8 個字元。",
  err_pw_mismatch: "兩次輸入的密碼不一致。",
  err_link_invalid: "連結已過期或已使用。請聯絡 AwareWave 重新寄送連結。",
  err_no_token: "請從電子郵件中的連結開啟此頁面。",
  err_save_failed: "系統無法儲存密碼，請再試一次。",
  done: "密碼已設定完成，正在登入。",
  members_hint: "對方必須先有電子郵件已驗證的帳號：AwareWave 在後台「Clients → 該客戶 → 帳號」建立，對方開啟電子郵件設定密碼後才能加入。",
  members_no_account_error: "此電子郵件沒有已驗證的帳號。請先建立帳號，並請對方開啟驗證信。",
} as const;

const fill = (t: string, v: Record<string, string>) => t.replace(/\{(\w+)\}/g, (m, k: string) => v[k] ?? m);
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Subject + text + html for the mailed link. Org and product names are escaped in the HTML part. */
export function inviteMail(kind: "invite" | "recovery", v: { orgName: string; productName: string; link: string }) {
  const vars = { org: v.orgName, product: v.productName, link: v.link };
  const subject = fill(kind === "invite" ? ACCOUNT_COPY.mail_invite_subject : ACCOUNT_COPY.mail_recovery_subject, vars);
  const body = kind === "invite" ? ACCOUNT_COPY.mail_invite_body : ACCOUNT_COPY.mail_recovery_body;
  const text = fill(body, vars);
  const htmlVars = { org: esc(v.orgName), product: esc(v.productName), link: `<a href="${esc(v.link)}">${esc(v.link)}</a>` };
  const html = fill(body, htmlVars)
    .split("\n")
    .map((line) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.6">${line}</p>`)
    .join("");
  return { subject, text, html };
}
