/**
 * registry.ts — 內容引擎「積木註冊骨架」（後端 Block Registry）
 *
 * 這是 `public/vector-editor.html` 的 `AB.registerBlock` 在後端的鏡像：
 *   - 每個積木自我註冊：`register({ id, kind, title, run })`（檔案被 import 時執行）
 *   - 只透過 `ctx` 溝通，不碰全域 → 整段可移植、可單獨刪
 *   - `enabled:false` = 註冊但停用（刪檔 = 徹底移除）
 *
 * 與前端 AB 的差別（誠實）：跨 runtime（瀏覽器 / Node）不能共用同一個記憶體物件，
 * 所以是「兩個 registry、同一套契約」。前端 ctx = fabric canvas；後端 ctx = 執行資料。
 *
 * 編排器只做一件事：跑某個 kind 註冊好的積木，例如
 *   for (const b of byKind("search")) ctx = await b.run(ctx)
 * 加新積木 = 新檔 register() 一次；編排器永遠不改。
 */

export type BlockKind = "search" | "article" | "video" | "quality" | "publish";

/** 積木執行上下文。各 kind 讀自己需要的欄位；保持鬆散以容納未來 kind。 */
export interface BlockCtx {
  geo?: string;
  [k: string]: unknown;
}

export interface ContentBlock<TOut = unknown> {
  id: string;                  // 唯一代號
  title: string;               // 顯示名（對映前端 AB 的 title）
  icon?: string;               // 圖示（可省，對映 AB 的 icon）
  kind: BlockKind;             // 分類：編排器按 kind 取用
  enabled?: boolean;           // 預設 true；false = 註冊但跳過
  geos?: string[] | "*";       // 選用地區閘（搜尋積木用）；省略視為 "*"
  run: (ctx: BlockCtx) => Promise<TOut>;
}

// 模組層單一 registry。註冊以 id 為鍵（重複註冊 = 取代，HMR/重載安全）。
const REGISTRY: ContentBlock[] = [];

/** 自我註冊一個積木。同 id 再註冊 → 取代（避免 dev HMR 雙重註冊堆積）。 */
export function register(block: ContentBlock): void {
  const i = REGISTRY.findIndex(b => b.id === block.id);
  if (i >= 0) REGISTRY[i] = block;
  else REGISTRY.push(block);
}

/** 取某個 kind 的所有「啟用中」積木（編排器用）。 */
export function byKind(kind: BlockKind): ContentBlock[] {
  return REGISTRY.filter(b => b.kind === kind && b.enabled !== false);
}

/** 總清單 manifest：列出全系統已註冊積木（給管理 UI / 偵錯）。 */
export function listAll(): Array<{
  id: string; title: string; icon?: string; kind: BlockKind; enabled: boolean; geos: string[] | "*";
}> {
  return REGISTRY.map(b => ({
    id: b.id, title: b.title, icon: b.icon, kind: b.kind,
    enabled: b.enabled !== false, geos: b.geos ?? "*",
  }));
}

/** 地區閘：geos 省略或 "*" = 全通；否則需含該 geo。 */
export function geoMatch(block: Pick<ContentBlock, "geos">, geo: string): boolean {
  const g = block.geos ?? "*";
  return g === "*" || g.includes(geo);
}
