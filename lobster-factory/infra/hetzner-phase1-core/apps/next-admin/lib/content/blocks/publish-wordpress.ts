/**
 * publish-wordpress.ts — `publish/wordpress` 積木（headless 發佈入口）。
 *
 * 與 `app/api/content/publish/route.ts` 共用同一個 core（`lib/content/publish/wordpress-core.ts`）：
 *   - route  = UI 入口（解析 HTTP Request → core → NextResponse）
 *   - 本積木 = 編排器 headless 入口（從 ctx 取參數 → 同一個 core）
 * 一段邏輯、兩個入口、零重複。draft-first 與 Bridge↔REST 雙路徑由 core 保證，積木不繞過、不另寫發佈邏輯。
 *
 * 註冊即生效：本檔被 import 時執行 `register()`。目前尚未接進 `byKind("publish")` 編排器（屬 P4），
 * 此檔先把積木做出來、可被 import；接線在 P4 完成（編排器永遠不改，只新增 import）。
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
    return publishToWordPress(ctx as WordPressPublishInput);
  },
});
