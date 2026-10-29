// /ops/sellers result codes (the redirect's ?r=) -> what staff read. registerSite's error codes (lib/payments/sites.ts) plus this page's own.
export const SELLER_MESSAGES: Record<string, { ok: boolean; text: string }> = {
  added: { ok: true, text: "已登記，網站馬上可以送付款事件。" },
  enabled: { ok: true, text: "已啟用。" },
  disabled: { ok: true, text: "已停用，這個網站送來的付款事件都會被拒絕。" },
  forbidden: { ok: false, text: "只有擁有者或管理員能改收銀台網站。" },
  db_unavailable: { ok: false, text: "資料庫連不上，沒有改動。" },
  invalid_host: { ok: false, text: "網站網址格式不對：只填網域，例如 shop.example.com（不要 https://）。" },
  invalid_key_id: { ok: false, text: "鑰匙代號只能用小寫英文、數字與 -，2 到 24 字，且登記後不能改。" },
  invalid_seller: { ok: false, text: "賣家帳戶要填帳戶的 uuid（在「帳務」頁點該帳戶，網址 account= 後面那串）。" },
  seller_not_found: { ok: false, text: "找不到這個帳戶。" },
  seller_not_a_billing_account: { ok: false, text: "賣家必須是最上層的客戶帳戶或自用帳戶，不能是子品牌。" },
  invalid_public_key: { ok: false, text: "付款公鑰不是 Ed25519 的 PEM（-----BEGIN PUBLIC KEY----- 開頭）。" },
  invalid_handoff_public_key: { ok: false, text: "進門公鑰不是 Ed25519 的 PEM；不需要可以留空。" },
  handoff_key_must_differ: { ok: false, text: "進門公鑰不能和付款公鑰是同一把。" },
  site_exists: { ok: false, text: "這個網址或鑰匙代號已經登記過了。" },
  invalid_site: { ok: false, text: "找不到這個網站。" },
};
