/**
 * 引擎的內容安全政策(CSP)唯一定義處(ORACLE-WP-SPEC §2-14;決策紀錄 2026-11-21 §4 乙 代價 2)。
 * 引擎與 WordPress 同網域:引擎頁一個 XSS 就能帶管理員登入狀態操作 WP 後台,所以頁面只跑帶本次 nonce 的腳本。
 * 頁面政策由 proxy.ts 逐請求帶 nonce 送出(/<語言>/… 與 /embed/… 共用);API 政策由 next.config.ts 送。
 * 加外部來源 → 只改這個檔,並更新 deploy/DEPLOY.md「內容安全政策」節。
 */

/** API(JSON)回應:不載入任何東西、不准被框住。 */
export const API_CSP = "default-src 'none'; frame-ancestors 'none'";

/** 每請求一個 nonce:128 位元隨機,base64。 */
export function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/**
 * 頁面政策。
 * - script-src:只認本次 nonce;'strict-dynamic' 讓帶 nonce 的 Next 執行期再載入的分塊可跑,且使 'self' 失效
 *   (同網域也是 WordPress,上傳區的檔不得當腳本)。'self' 只給不認 'strict-dynamic' 的舊瀏覽器退回用。
 *   wasm 只在伺服端(lib/astrology.ts readFileSync),瀏覽器不需 'wasm-unsafe-eval'。
 *   dev 才加 'unsafe-eval'(React 開發模式重建錯誤堆疊用;production 不用)。
 * - style-src 'unsafe-inline':工具元件以 React style 屬性排版(app/、components/ 內數百處),伺服端輸出成 style="…",
 *   沒有 'unsafe-inline' 會整頁跑版;改寫等於重做全部工具外觀(卡片邊界外)。行內樣式無法執行腳本。
 *   不放 nonce:style-src 一出現 nonce,瀏覽器就忽略 'unsafe-inline'。
 */
export function pageCsp(nonce: string, dev = false): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    // 引擎頁不框任何東西;不寫會退回 default-src 'self',注入的 HTML 就能框住同網域的 WP 後台做點擊誘騙。
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join('; ');
}
