/**
 * seo-check-core.ts — `quality/check`（RankMath/SEO 檢測）的核心邏輯（P3 積木化抽取）。
 *
 * 與 `app/api/content/seo-check/route.ts` 共用同一段邏輯：
 *   - route  = UI 入口（HTTP Request → core → NextResponse）
 *   - 積木   = 編排器 headless 入口（ctx → 同一個 core），見 `lib/content/blocks/seo-check.ts`
 * 一段邏輯、兩個入口、零重複。
 *
 * 本檔只做「body 寬鬆 coercion + 兩個必填驗證 + 呼叫純函式 `checkRankMath`」，與抽取前 route 位元相同
 * （含 `str()` fallback、`.trim()`、`siteDomain` 的 `|| undefined`、兩個 400 的訊息字串）。實際 22 點
 * RankMath 評分仍在 `lib/seo/rankmath-checker.ts`，本檔不重寫評分邏輯。
 */
import { checkRankMath, type RankMathReport } from "../../seo/rankmath-checker";

/** headless 入口的鬆散輸入；欄位由 `runSeoCheck` 自行 coerce（與原 route 相同）。 */
export type SeoCheckInput = Record<string, unknown>;

export interface SeoCheckSuccess {
  ok: true;
  report: RankMathReport;
}
export interface SeoCheckFailure {
  ok: false;
  status: number;
  error: string;
}
export type SeoCheckResult = SeoCheckSuccess | SeoCheckFailure;

/**
 * 跑 RankMath 檢測。回傳結構化 union（成功含 report，失敗含 status/error）——
 * route 把失敗還原成 text、成功還原成 JSON（與抽取前位元相同）；積木直接收 union。
 * 同步函式（`checkRankMath` 純運算、無 I/O），積木的 async `run` 會自動包成 Promise。
 */
export function runSeoCheck(body: SeoCheckInput): SeoCheckResult {
  const str = (v: unknown, fb = "") => (typeof v === "string" ? v : fb);

  const markdown        = str(body.markdown).trim();
  const focusKeyword    = str(body.focusKeyword).trim();
  const seoTitle        = str(body.seoTitle).trim();
  const metaDescription = str(body.metaDescription).trim();
  const slug            = str(body.slug).trim();
  const siteDomain      = str(body.siteDomain) || undefined;

  if (!markdown)     return { ok: false, status: 400, error: "markdown required" };
  if (!focusKeyword) return { ok: false, status: 400, error: "focusKeyword required" };

  const report = checkRankMath({ markdown, focusKeyword, seoTitle, metaDescription, slug, siteDomain });
  return { ok: true, report };
}
