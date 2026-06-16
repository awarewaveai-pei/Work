/**
 * seo-check.ts — `quality/check` 積木（headless RankMath/SEO 檢測入口）。
 *
 * 與 `app/api/content/seo-check/route.ts` 共用同一個 core（`lib/content/quality/seo-check-core.ts`）：
 *   - route  = UI 入口（解析 HTTP Request → core → NextResponse）
 *   - 本積木 = 編排器 headless 入口（從 ctx 取參數 → 同一個 core）
 * 一段邏輯、兩個入口、零重複。RankMath 24 點評分由 core 保證，積木不重寫檢測邏輯。
 *
 * 註冊即生效：本檔被 import 時執行 `register()`。目前尚未接進 `byKind("quality")` 編排器（屬 P4），
 * 此檔先把積木做出來、可被 import；接線在 P4 完成（編排器永遠不改，只新增 import）。
 */
import { register, type BlockCtx } from "./registry";
import { runSeoCheck, type SeoCheckInput, type SeoCheckResult } from "../quality/seo-check-core";

register({
  id: "quality/check",
  title: "SEO 檢測（RankMath）",
  icon: "✅",
  kind: "quality",
  enabled: true,
  /**
   * ctx 即檢測輸入（markdown / focusKeyword / seoTitle / metaDescription / slug / siteDomain）。core 對
   * 每個欄位做寬鬆 coercion（與原 route 相同），故直接把 ctx 當 SeoCheckInput 傳入；多餘的 geo 等欄位忽略。
   * 回傳結構化 union（成功含 report，失敗含 status/error）。
   */
  run: async (ctx: BlockCtx): Promise<SeoCheckResult> => {
    return runSeoCheck(ctx as SeoCheckInput);
  },
});
