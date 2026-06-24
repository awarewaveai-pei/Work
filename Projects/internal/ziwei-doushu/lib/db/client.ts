/**
 * 資料庫接縫 (F3,PLAN §15)。
 * 現為 env 偵測 seam;實際 createClient(@supabase/supabase-js)+ RLS 於 DB 階段。
 * 金鑰一律走環境變數,禁硬編。
 */
export function isDbConfigured(): boolean {
  return Boolean(
    process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY,
  );
}
