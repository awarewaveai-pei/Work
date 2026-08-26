/**
 * publish-wordpress.ts — `publish/wordpress` 積木（headless 發佈入口）。
 *
 * 與 `app/api/content/publish/route.ts` 共用同一個 core（`lib/content/publish/wordpress-core.ts`）：
 *   - route  = UI 入口（解析 HTTP Request → core → NextResponse）
 *   - 本積木 = 編排器 headless 入口（從 ctx 取參數 → 同一個 core）
 * 一段邏輯、兩個入口、零重複。draft-first 與 Bridge↔REST 雙路徑由 core 保證，積木不繞過、不另寫發佈邏輯。
 *
 * 註冊即生效：本檔被 import 時執行 `register()`。P4 已接進 `byKind("publish")` 編排器
 * （`lib/content/pipeline.ts` side-effect import 本檔，為管線終端 draft-first 發佈；編排器永遠不改，只新增 import）。
 */
import { register, type BlockCtx } from "./registry";
import {
  publishToWordPress,
  type WordPressPublishInput,
  type WordPressPublishResult,
} from "../publish/wordpress-core";

register({
  id: "publish/wordpress",
  title: "WordPress 發佈",
  icon: "📝",
  kind: "publish",
  enabled: true,
  /**
   * ctx 即發佈輸入（markdown / slug / seoTitle / siteId / categories / tags …）。core 對每個欄位做
   * 寬鬆 coercion（與原 route 相同），故直接把 ctx 當 WordPressPublishInput 傳入；多餘的 geo 等欄位
   * core 會忽略。回傳結構化結果（成功含 post_id/edit_url，失敗含 status/error）。
   */
  run: async (ctx: BlockCtx): Promise<WordPressPublishResult> => {
    // core 自 2026-08-26 起要求身分來源（它會發文到 ctx.siteId 指定的站）。本積木是 headless
    // 入口，沒有 HTTP request，所以由編排器把觸發該次執行的 Request 放進 ctx.request。
    // **缺身分一律拒發**，不預設成 staff —— 「少一個欄位就自動拿到全站權限」正是本批要根除的形狀。
    // 目前 `lib/content/pipeline.ts` 未被任何 route 接線（dormant），接線時必須一併帶入。
    const req = (ctx as { request?: Request }).request;
    if (!req || typeof (req as Request).headers?.get !== "function") {
      return {
        ok: false,
        status: 403,
        error: "publish/wordpress: ctx.request 未提供 — 編排器必須帶入觸發本次執行的 Request 才能驗租戶",
        wire: "text",
      };
    }
    return publishToWordPress(ctx as WordPressPublishInput, req);
  },
});
