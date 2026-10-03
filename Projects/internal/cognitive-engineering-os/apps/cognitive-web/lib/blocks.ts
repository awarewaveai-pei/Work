// The platform's blocks as the pages show them: the 14 blocks + the 5 always-on parts (ai_lego/core/domain/blocks.py
// holds the codes; this adds the words a person reads). `step` = the build step a block opens in
// (ai_lego/core/domain/kinds/assembler.py OPEN_BLOCKS = step 1); a block not open yet is shown, never hidden.
import { apiFetch } from "./api";

export type BlockCode = "SENSE" | "GATHER" | "MAP" | "THINK" | "VERIFY" | "COMPUTE" | "DECIDE" | "ACT" | "LEARN" | "TEACH" | "EXPRESS" | "FACILITATE" | "COLLAB" | "GOVERN";
export type Block = { code: BlockCode; n: number; name: string; does: string; path: string; step: number };

export const BLOCKS: Block[] = [
  { code: "SENSE", n: 1, name: "外化", does: "把腦子裡混在一起的東西，一件一張卡放到外面", path: "sense", step: 1 },
  { code: "GATHER", n: 2, name: "蒐集來源", does: "找回資料，每個來源有身分卡", path: "gather", step: 2 },
  { code: "MAP", n: 3, name: "拆解", does: "把一件事拆成六層，分清事實和解釋", path: "map", step: 1 },
  { code: "THINK", n: 4, name: "共思考", does: "你先想，AI 再幫你想更多方向、找反例", path: "think", step: 1 },
  { code: "VERIFY", n: 5, name: "查證主張", does: "查是誰說的、別的地方怎麼報", path: "verify", step: 2 },
  { code: "COMPUTE", n: 6, name: "計算與模擬", does: "要比成本、收入、機率時算給你看", path: "compute", step: 2 },
  { code: "DECIDE", n: 7, name: "判斷", does: "你自己寫結論、依據、信心、什麼會改變它", path: "decide", step: 1 },
  { code: "ACT", n: 8, name: "行動與觀察", does: "走最小、能反悔的一步，持續看結果", path: "act", step: 1 },
  { code: "LEARN", n: 9, name: "回顧校準", does: "回頭對：預測跟結果差在哪", path: "learn", step: 1 },
  { code: "TEACH", n: 10, name: "課程與演練", does: "開始前的 5 分鐘課、情境演練", path: "teach", step: 4 },
  { code: "EXPRESS", n: 11, name: "產出與表達", does: "把判斷說給別人聽", path: "express", step: 4 },
  { code: "FACILITATE", n: 12, name: "帶領", does: "帶領者陪著走", path: "facilitate", step: 4 },
  { code: "COLLAB", n: 13, name: "共同程序", does: "有別人也有決定權時，一起決定", path: "collab", step: 3 },
  { code: "GOVERN", n: 14, name: "安全、資料與治理", does: "保護你：匯出、刪除、危機轉介、護欄", path: "govern", step: 1 },
];
export const OPEN_STEP = 1;
export const blockOf = (code: string) => BLOCKS.find((block) => block.code === code);
export const isOpen = (block: Block) => block.step <= OPEN_STEP;

// A block's document as the API returns it (ai_lego/data/repositories/case_docs.py).
export type Author = "user" | "ai" | "joint" | "system";
export type Doc<C = Record<string, any>> = { doc_id: string; kind: string; version: number; content: C; author: Author; block: string; at: string; created_at?: string };
export type Notice =
  | { type: "crisis"; notice: string; resources: Array<{ name: string; contact: string }> }
  | { type: "proposal"; doc_id: string; kind: string; by: string; propose: string; why: string; open: boolean; guardrail?: boolean }
  | { type: "guardrail"; category: string; found_by: string }
  | { type: "suggest_case"; categories: string[]; notice: string };   // outside a case: a high-risk word -> open a case (GOVERN's sentence)
export type Saved<C = Record<string, any>> = Doc<C> & { notices: Notice[] };
export const AUTHOR: Record<Author, string> = { user: "你寫的", ai: "AI 寫的", joint: "AI 起草、你改過", system: "系統" };

const enc = encodeURIComponent;
const base = (projectId: string | null) => (projectId ? `/projects/${enc(projectId)}` : "/me");

export const docs = {
  list: <C,>(projectId: string | null, kind: string) => apiFetch<Doc<C>[]>(`${base(projectId)}/docs/${enc(kind)}`),
  create: <C,>(projectId: string | null, kind: string, content: C) => apiFetch<Saved<C>>(`${base(projectId)}/docs/${enc(kind)}`, { method: "POST", body: JSON.stringify({ content }) }),
  update: <C,>(projectId: string | null, kind: string, doc: Doc<C>, content: C) =>
    apiFetch<Saved<C>>(`${base(projectId)}/docs/${enc(kind)}/${enc(doc.doc_id)}`, { method: "PUT", body: JSON.stringify({ content, base_version: doc.version }) }),
  remove: (projectId: string | null, kind: string, docId: string) => apiFetch<{ status: string }>(`${base(projectId)}/docs/${enc(kind)}/${enc(docId)}`, { method: "DELETE" }),
  versions: <C,>(projectId: string | null, kind: string, docId: string) => apiFetch<Doc<C>[]>(`${base(projectId)}/docs/${enc(kind)}/${enc(docId)}/versions`),
};

// The case's route (ai_lego/platform/block_hooks/assembler.py case_route): the blocks in the order the person left them,
// then the ones a proposal added that they accepted; `done` = the slots with something written (做過).
export type RouteStop = { code: BlockCode; why: { from: "package"; package: string | null } | { from: "proposal"; by: string; text: string }; open: boolean; done: boolean };
export type Route = { purpose: string | null; package: string | null; blocks: RouteStop[]; done: BlockCode[] };
export const route = (projectId: string) => apiFetch<Route>(`/projects/${enc(projectId)}/route`);

export type AiTurn<C = Record<string, any>> = { saved?: Doc<C>; stopped?: "crisis"; notice?: string; resources?: Array<{ name: string; contact: string }> };
// ``over``: the AI's earlier version of a one-per-case document (再整理一次 = its next version, not a second document).
export const ai = <C,>(projectId: string | null, block: BlockCode, action: string, context: Record<string, unknown> = {}, over?: Doc<C> | null) =>
  apiFetch<AiTurn<C>>(`${base(projectId)}/ai/${block}/${enc(action)}`, { method: "POST", body: JSON.stringify({ context, ...(over ? { doc_id: over.doc_id, base_version: over.version } : {}) }) });
