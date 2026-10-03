// GOVERN's API as the pages read it (ai_lego/apps/api/blocks/govern.py). Nothing here reads what the person wrote into any
// AI: help, export, account deletion and version records only move or name data.
import { apiFetch } from "./api";
import { blockOf } from "./blocks";

const enc = encodeURIComponent;

export type HelpLine = { name: string; contact: string };
export type Help = { notice: string; where: string | null; covered: boolean; resources: HelpLine[] };
export type AccountSummary = {
  cases: Array<{ project_id: string; name: string; created_at: string }>;
  personal_records: number; workflows: number; runs: number; keeps: string[]; phrase: string;
};
export type ErasedAccount = { cases: number; runs: number; records: number; workflows: number; tombstone: boolean };
export type AiCall = { block: string; action: string; model: string; instructions_sha256: string; at: string };
export type RuleVersion = { name: string; label: string; version: string };
export type HeldKind = { kind: string; block: string | null; title: string | null; definition: string | null; documents: number; versions: number };
export type VersionRecords = { ai_calls: AiCall[]; rules: RuleVersion[]; kinds: HeldKind[] };

// ai_lego/core/domain/kinds/govern.py GUARDRAILS (test_block_govern compares the names)
export const GUARDRAIL_LABEL: Record<string, string> = {
  require_sources: "要求來源：AI 說到事實，一定附上哪個網頁或哪份文件；沒有來源就說沒有",
  professional: "建議找專業的人：AI 會提醒你，哪些事要由專業的人負責，哪些由你自己負責",
  wait_or_review: "先等一下或請人覆核：碰到不能反悔的決定或行動，先停一下，或請人看過",
  group_procedure: "群組程序：有別人也有決定權時，會提議加共同程序（你同意才加）",
};
export const GUARDRAIL_ORDER = ["require_sources", "professional", "wait_or_review", "group_procedure"];
// ai_lego/core/domain/kinds/govern.py HIGH_RISK
export const HIGH_RISK = ["健康", "法律", "金錢", "人身安全", "急性心理危機", "要公開散布"];
// ai_lego/platform/ai_actions/govern.py TOPICS
export type Topic = "where" | "guardrails" | "export" | "erase" | "versions";

// A record names the part that wrote it by code (ai_lego/core/domain/blocks.py): the 14 blocks are named in lib/blocks.ts, these are the always-on parts.
const PART_NAME: Record<string, string> = { ASSEMBLER: "開案", CONTEXT: "規範與脈絡", COLLAB_CONTRACT: "協作合約", INTEGRITY: "完整性核心", RECORD: "共用紀錄", INTERNAL: "內部工具" };
export const partName = (code: string) => blockOf(code)?.name ?? PART_NAME[code] ?? code;
export const STOP_REASON: Record<string, string> = { crisis: "出現危機的訊號", stop_signal: "出現停止訊號", person_stopped: "你自己叫它停" };

/** Where a download link points: the same prefix apiFetch uses, so a link and a fetch reach the same server. */
export const apiHref = (path: string) => `${process.env.NEXT_PUBLIC_API_PREFIX ?? "/api"}${path}`;
export const exportHref = (projectId: string | null, format: "json" | "md") =>
  apiHref(projectId ? `/projects/${enc(projectId)}/govern/export?format=${format}` : `/govern/export?format=${format}`);

export const helpFor = (where?: string) => apiFetch<Help>(`/govern/help${where ? `?where=${enc(where)}` : ""}`);
export const accountSummary = () => apiFetch<AccountSummary>("/govern/account");
export const eraseAccount = (confirm: string) => apiFetch<ErasedAccount>("/govern/account/erase", { method: "POST", body: JSON.stringify({ confirm }) });
export const versionRecords = (projectId: string) => apiFetch<VersionRecords>(`/projects/${enc(projectId)}/govern/versions`);
