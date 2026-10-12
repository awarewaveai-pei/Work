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
export type ErasedAccount = { cases: number; runs: number; records: number; workflows: number; tombstone: boolean; failed: Array<{ artifact_type: string; error: string }> };
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
// ai_lego/core/domain/kinds/govern.py SETTINGS (test_block_govern compares the names); the sentences come from GET /blocks/govern/spec
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

// Consents, appeals, research, 不留紀錄 and the case's audit line (ai_lego/apps/api/blocks/govern_group.py, cards 13 and 30-32).
export type ConsentItem = { project_id: string; kind: string; doc_id: string; version?: number };
export type ConsentPurpose = "group" | "facilitator" | "research";
export type Consent = { doc_id: string; version: number; at: string; created_at?: string;
  content: { purpose: ConsentPurpose; target: string; items: ConsentItem[]; follow_versions: boolean; withdrawn: boolean } };
export type Appeal = { doc_id: string; group_id: string; about_identity_id: string; text: string; named: boolean;
  mine?: boolean; at?: string; on?: string; author_identity_id?: string; author_name?: string };
export type GroupMember = { identity_id: string; display_name: string; role: "convener" | "participant" | "facilitator" };
export type MyGroup = { group_id: string; name: string; purpose: string; my_role: GroupMember["role"] };
export type GovernSpec = { no_record: { label: string; warning: string }; resources: Record<string, string>; settings: Record<Topic, { name: string; explanation: string }> };
export type Stamp = { name: string; version: string; fingerprint: string; title: string };
export type CaseUsed = { labels: Record<string, string>; ai_turns: Array<{ block: string; action: string; model: string; instructions: string; at: string }>;
  rulesets: Stamp[]; resources: Record<string, string> };

export const consents = () => apiFetch<Consent[]>("/me/consents");
export const giveConsent = (purpose: ConsentPurpose, target: string, items: ConsentItem[]) =>
  apiFetch<Consent>("/me/consents", { method: "POST", body: JSON.stringify({ purpose, target, items, follow_versions: true }) });
export const withdrawConsent = (docId: string) => apiFetch<Consent>(`/me/consents/${enc(docId)}/withdraw`, { method: "POST" });
export const myGroups = () => apiFetch<MyGroup[]>("/groups");
export const groupMembers = (groupId: string) => apiFetch<{ members: GroupMember[] }>(`/groups/${enc(groupId)}`).then((group) => group.members);
export const myAppeals = () => apiFetch<Appeal[]>("/me/appeals");
export const appealsToHandle = () => apiFetch<Appeal[]>("/govern/appeals");
export const makeAppeal = (groupId: string, aboutIdentityId: string, text: string, named: boolean) =>
  apiFetch<Appeal>("/me/appeals", { method: "POST", body: JSON.stringify({ group_id: groupId, about_identity_id: aboutIdentityId, text, named }) });
export const deleteAppeal = (docId: string) => apiFetch<{ status: string }>(`/me/appeals/${enc(docId)}`, { method: "DELETE" });
export const appealsExportHref = () => apiHref("/me/appeals/export");
export const governSpec = () => apiFetch<GovernSpec>("/blocks/govern/spec");
export const closeCase = (projectId: string) => apiFetch<{ closed: boolean }>(`/projects/${enc(projectId)}/govern/close`, { method: "POST" });
export const caseUsed = (projectId: string) => apiFetch<CaseUsed>(`/projects/${enc(projectId)}/govern/used`);
// What a person can share from a case, item by item (STEP34 §6): the cards, the maps and the thinking cards.
export const SHAREABLE: Array<[string, string]> = [["sense.card", "外化卡"], ["map.map", "地圖"], ["think.card", "思考卡"]];
export const PURPOSE_LABEL: Record<ConsentPurpose, string> = { group: "給群組", facilitator: "給帶領的人", research: "給研究" };
export const RESEARCH_SENTENCE = "研究用的檔案會拿掉你的帳號和三個地點（發生地、你在哪裡、當事人各在哪裡），但不保證別人認不出是誰。";
export const REMOVE_NAMES_FIRST = "內文裡的人名不會被拿掉。同意之前，請先把你寫的人名刪掉或改掉。";
