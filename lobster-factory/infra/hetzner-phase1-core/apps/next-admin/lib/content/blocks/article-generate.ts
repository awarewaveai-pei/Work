/**
 * article-generate.ts — `article/generate` 積木（headless 文章生成入口）。
 *
 * 與 `app/api/content/generate/route.ts` 共用同一個 core（`lib/content/article/generate-core.ts`）：
 *   - route  = UI 入口（HTTP Request → core 的 prepare + streamArticleGeneration → text/plain 串流）
 *   - 本積木 = 編排器 headless 入口（從 ctx 取參數 → 同一個 core 的 generateArticleMarkdown 收整成字串）
 * 一段邏輯、兩個入口、零重複。串流屬 route（積木回傳值，不串流）；RankMath/SEO/GEO 等生成規則由 core 保證，
 * 積木不繞過、不另寫生成邏輯。輸出（含 GENERATION_TRUNCATED / GENERATION_ERROR 標記）與 route 串流結果逐字相同。
 *
 * 註冊即生效：本檔被 import 時執行 `register()`。目前尚未接進 `byKind("article")` 編排器（屬 P4），
 * 此檔先把積木做出來、可被 import；接線在 P4 完成（編排器永遠不改，只新增 import）。
 */
import { register, type BlockCtx } from "./registry";
import {
  generateArticleMarkdown,
  type ArticleGenerateInput,
  type ArticleGenerateFailure,
} from "../article/generate-core";

register({
  id: "article/generate",
  title: "文章生成",
  icon: "✍️",
  kind: "article",
  enabled: true,
  /**
   * ctx 即生成輸入（keyword / title / language / structure / media / model …）。core 對每個欄位做
   * 寬鬆 coercion（與原 route 相同），故直接把 ctx 當 ArticleGenerateInput 傳入；多餘的 geo 等欄位
   * core 會忽略。回傳結構化結果（成功含 markdown，失敗含 status/error）。
   */
  run: async (ctx: BlockCtx): Promise<{ ok: true; markdown: string } | ArticleGenerateFailure> => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return { ok: false, status: 503, error: "ANTHROPIC_API_KEY not configured" };
    return generateArticleMarkdown(ctx as ArticleGenerateInput, apiKey);
  },
});
