/**
 * pipeline.ts — P4：headless 內容管線編排器（article → quality → publish，跑通成 WordPress draft）。
 *
 * 設計依據：`agency-os/docs/operations/CONTENT_PIPELINE_BLOCKS_MASTER_PLAN.md` §10 P4。
 * 把 P1–P3 抽好的 dormant 積木（`article/generate`、`quality/check`、`publish/wordpress`）接進一條
 * headless 管線。**編排器零改積木契約**：只多三行 side-effect import 讓積木自註冊（README 契約：
 * 「加新積木 = 新檔 register() 一次；編排器永遠不改，只新增 import」）。
 *
 * 為什麼 search 不入迴圈（誠實修正 §10「search→article→…」措辭）：
 *   search 積木回 `TrendingItem[]`（彙整型，見 `trending-sources.ts:364 runTrending`），與本管線三階段的
 *   `{ ok, ... }` discriminated-union **形狀不相容**。search 是**上游 producer**——呼叫端可先跑 `runTrending`
 *   選題，再把選定關鍵字以 `input.keyword` 餵進本管線。故 stages 只含 article|quality|publish。
 *
 * 行為紅線：publish 階段走 `publish/wordpress` 積木→`wordpress-core` 的 draft-first 路徑（永不直接上線）。
 * 本檔**不**新增 route/cron，純 headless 函式 → 載入即註冊積木但不自動執行；活化（HTTP/排程觸發 + 寫 live WP）
 * 屬後續階段，需另行授權。R8/R9（Semantic Coverage / per-client distinctiveness gate）屬 P9，本檔不做。
 */
import { byKind, type BlockCtx } from "./blocks/registry";
import type { RankMathReport } from "../seo/rankmath-checker";
import type { WordPressPublishSuccess } from "./publish/wordpress-core";

// 側效 import：載入即執行各檔的 register()，把 dormant 積木接進 module-level registry。
// 編排器本體（下方）永遠不認識任何單一積木，只透過 byKind() 取用 → 加積木只動 import 這幾行。
import "./blocks/article-generate";
import "./blocks/seo-check";
import "./blocks/publish-wordpress";

/** 管線階段（限 `{ok}`-union 型積木；search 是上游 producer，不在此列，理由見檔頭）。 */
export type PipelineStageKind = "article" | "quality" | "publish";

export interface PipelineOptions {
  /** 要跑的階段（依序）。預設 article→quality→publish（「跑通文章→品質→WP draft」）。 */
  stages?: PipelineStageKind[];
  /** 在此 kind 之前停止（不執行該 kind 起的階段）。安全用途：`stopBefore:"publish"` 跑到品質就停、不寫 WP。 */
  stopBefore?: PipelineStageKind;
}

/** 每階段一筆執行紀錄（observability；headless 管線無 UI，靠這個追進度）。 */
export interface PipelineStageRecord {
  kind: PipelineStageKind;
  blockId: string;
  ok: boolean;
  note?: string;
}

export interface PipelineSuccess {
  ok: true;
  stages: PipelineStageRecord[];
  markdown?: string;
  qualityReport?: RankMathReport;
  publish?: WordPressPublishSuccess;
  /** 若因 `stopBefore` 提早結束，記在此（publish 會是 undefined）。 */
  stoppedBefore?: PipelineStageKind;
}

export interface PipelineFailure {
  ok: false;
  /** 哪個階段失敗（短路點）。 */
  failedStage: PipelineStageKind;
  blockId: string;
  status: number;
  error: string;
  stages: PipelineStageRecord[];
}

export type PipelineResult = PipelineSuccess | PipelineFailure;

const DEFAULT_STAGES: PipelineStageKind[] = ["article", "quality", "publish"];

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

/** 成功時把該階段產物併回 ctx，供下游階段當輸入（編排器知道管線資料流）。 */
function mergeStageOutput(kind: PipelineStageKind, ctx: BlockCtx, out: Record<string, unknown>): void {
  if (kind === "article" && typeof out.markdown === "string") {
    ctx.markdown = out.markdown;                 // → quality / publish 的輸入
  } else if (kind === "quality" && out.report) {
    ctx.qualityReport = out.report;              // 附帶；P4 不 gate（R8 gate 屬 P9）
  }
  // publish 為終端，無下游；產物在主迴圈另存。
}

/**
 * 依序跑 article→quality→publish，逐階段檢查 `ok`：**失敗即短路**（不續跑下游、不把失敗 union 當 ctx），
 * **try/catch 防 block 內部 throw**（網路等），**形狀防護**（registry 回 `TOut=unknown`）。
 * 成功回 `{ ok:true, markdown, qualityReport, publish }`；任一階段失敗回 `{ ok:false, failedStage, ... }`。
 *
 * @param input 管線輸入（keyword 為文章主題；quality/publish 需 focusKeyword，未給則沿用 keyword）。
 */
export async function runContentPipeline(
  input: BlockCtx,
  opts: PipelineOptions = {},
): Promise<PipelineResult> {
  const stages = opts.stages ?? DEFAULT_STAGES;
  const ctx: BlockCtx = { ...input };
  const records: PipelineStageRecord[] = [];
  let publishResult: WordPressPublishSuccess | undefined;

  // 管線便利預設：quality/publish 的檢測/SEO 需要 focusKeyword；只給 keyword 時沿用之（不改積木，僅編排層補）。
  if (ctx.focusKeyword == null && typeof ctx.keyword === "string") {
    ctx.focusKeyword = ctx.keyword;
  }

  for (const kind of stages) {
    if (opts.stopBefore && kind === opts.stopBefore) {
      return {
        ok: true,
        stages: records,
        markdown: str(ctx.markdown),
        qualityReport: (ctx.qualityReport as RankMathReport | undefined) ?? undefined,
        publish: publishResult,
        stoppedBefore: kind,
      };
    }

    const blocks = byKind(kind);
    if (blocks.length === 0) {
      records.push({ kind, blockId: "(none)", ok: false, note: "no registered block for kind" });
      return {
        ok: false,
        failedStage: kind,
        blockId: "(none)",
        status: 500,
        error: `no registered block for kind "${kind}"`,
        stages: records,
      };
    }
    // 一 kind 一積木（線性資料流契約）：本管線是單鏈 article→quality→publish，非 fan-out。
    // 若某 kind 誤裝 >1 積木，取首個並告警 → 避免靜默跑多個 publish 只留最後一筆（critic M2）。
    if (blocks.length > 1) {
      console.warn(
        `[pipeline] kind "${kind}" has ${blocks.length} blocks; using first ("${blocks[0].id}"), ` +
          `ignoring: ${blocks.slice(1).map((b) => b.id).join(", ")}`,
      );
    }
    const block = blocks[0];

    let out: { ok?: unknown; status?: unknown; error?: unknown; [k: string]: unknown } | null | undefined;
    try {
      out = (await block.run(ctx)) as typeof out;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      records.push({ kind, blockId: block.id, ok: false, note: "threw" });
      return { ok: false, failedStage: kind, blockId: block.id, status: 500, error: `block "${block.id}" threw: ${msg}`, stages: records };
    }

    // 形狀防護 + ok 閘：null/非物件/ok!==true 一律當失敗短路（critic P3 標的：不可盲目把回傳當 ctx）。
    if (!out || typeof out !== "object" || out.ok !== true) {
      const status = typeof out?.status === "number" ? out.status : 500;
      const error = typeof out?.error === "string" ? out.error : `block "${block.id}" returned non-ok result`;
      records.push({ kind, blockId: block.id, ok: false });
      return { ok: false, failedStage: kind, blockId: block.id, status, error, stages: records };
    }

    mergeStageOutput(kind, ctx, out as Record<string, unknown>);

    // article 後驗（critic M1+M3）：generate-core 在 stream error/truncate 時，仍回 ok:true，
    // 但把 marker 嵌進 markdown 字串（generate-core.ts:590/597，由 caller 決定如何浮現）。headless
    // 自走模式不可把殘缺稿當成功往下 quality/publish → 在此硬短路為 article 階段失敗（不污染歸因）。
    if (kind === "article") {
      const md = str(ctx.markdown);
      if (!md) {
        records.push({ kind, blockId: block.id, ok: false, note: "ok but no usable markdown" });
        return {
          ok: false, failedStage: "article", blockId: block.id, status: 502,
          error: `block "${block.id}" returned ok but produced no usable markdown`, stages: records,
        };
      }
      if (/<!-- GENERATION_(ERROR|TRUNCATED):/.test(md)) {
        records.push({ kind, blockId: block.id, ok: false, note: "generation marker in markdown" });
        return {
          ok: false, failedStage: "article", blockId: block.id, status: 502,
          error: "article generation incomplete (GENERATION_ERROR/TRUNCATED marker present)", stages: records,
        };
      }
    }

    if (kind === "publish") publishResult = out as unknown as WordPressPublishSuccess;
    records.push({ kind, blockId: block.id, ok: true });
  }

  return {
    ok: true,
    stages: records,
    markdown: str(ctx.markdown),
    qualityReport: (ctx.qualityReport as RankMathReport | undefined) ?? undefined,
    publish: publishResult,
  };
}
