/**
 * product-copy.ts — `product/copy` 積木（headless 商品文案入口）。
 *
 * 與 `app/api/tools/publish/route.ts` 的 `action:"copy"` 共用同一個 core
 * （`lib/studio/product-copy.ts` 的 `generateProductCopy`）：
 *   - route  = UI 入口（解析 HTTP Request → core → NextResponse）
 *   - 本積木 = 編排器 headless 入口（從 ctx 取設計上下文 → 同一個 core）
 * 一段邏輯、兩個入口、零重複。SEO / GEO / AEO / RankMath 自評分由 core 保證，積木不另寫評分邏輯。
 *
 * 註冊即生效：本檔被 import 時執行 `register()`。`kind:"product"` 是新分類（additive）——
 * 編排器永遠不改，只在需要時新增 import；無 import 則此積木不存在於 registry。
 */
import { register, type BlockCtx } from "./registry";
import { generateProductCopy, type ProductCopyInput, type ProductCopyResult } from "../../studio/product-copy";

register({
  id: "product/copy",
  title: "商品文案（SEO/GEO/AEO/RankMath）",
  icon: "🛍️",
  kind: "product",
  enabled: true,
  /**
   * ctx 即文案輸入（designPrompt / subject / productType / focusKeywordHint / siteDomain …，全選用）。
   * core 對缺漏欄位有預設值，故直接把 ctx 當 ProductCopyInput 傳入；多餘的 geo 等欄位 core 會忽略。
   * 回傳結構化結果（成功含 copy + 完整 RankMath 報告，失敗含 error）——core 永不 throw。
   */
  run: async (ctx: BlockCtx): Promise<ProductCopyResult> => {
    return generateProductCopy(ctx as ProductCopyInput);
  },
});
