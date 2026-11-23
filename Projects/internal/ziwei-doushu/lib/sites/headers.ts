/**
 * 站台簽章與會員票的標頭名稱。無相依,瀏覽器端(AI 解讀元件)與伺服器端(verify.ts、ticket.ts)共用同一份;
 * 伺服器模組含 node:crypto,不能讓 client 元件為了兩個字串 import 它們。
 */
export const SITE_SIGNATURE_HEADER = 'x-awarewave-oracle-signature';
export const SITE_TICKET_HEADER = 'x-awarewave-oracle-ticket';
