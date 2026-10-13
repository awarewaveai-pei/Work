// A group and COLLAB's records as the API returns them (ai_lego/apps/api/blocks/groups.py, collab.py). Another member is
// never named by an id here: each record says `who` (你, the label they chose, or their name) and `mine`.
import { apiFetch } from "./api";
import type { Author, Notice } from "./blocks";

const enc = encodeURIComponent;
// The interface questions of 《判斷主權教育架構 v0.1》, word for word as ai_lego/core/domain/kinds/context.py INTERFACE_QUESTIONS
// (the API refuses an answer to any other question).
export const INTERFACE_QUESTIONS = [
  "個體判斷權與制度決策權在哪裡相遇？",
  "制度何時有正當理由限制個體選擇？",
  "誰來判斷「共同利益」？",
  "如果制度必須保有權威，如何避免權威變成認知上的接管？",
  "如果個體必須保有自主，如何避免自主變成拒絕一切共同責任？",
] as const;
// What the pages ask: the operator's plain wording of each (2026-10-13); the original stays beside it, and an answer is
// still stored under the original (the API's key).
const INTERFACE_PLAIN: Record<string, string> = {
  "個體判斷權與制度決策權在哪裡相遇？": "個人的判斷與共同的規則，該如何取得平衡？",
  "制度何時有正當理由限制個體選擇？": "什麼情況下，限制個人的選擇是合理的？",
  "誰來判斷「共同利益」？": "什麼才算對大家有利？又該由誰來決定？",
  "如果制度必須保有權威，如何避免權威變成認知上的接管？": "制度有權要求人遵守規則，但能不能要求人接受它的想法？",
  "如果個體必須保有自主，如何避免自主變成拒絕一切共同責任？": "如何保有自己的選擇權，同時不忽略對他人的責任？",
};
/** The plain wording of an interface question; a question it does not know is shown as it is. */
export const plainQuestion = (question: string): string => INTERFACE_PLAIN[question] ?? question;
/** The line under the plain wording: the original, when there is a plain one. */
export const originalLine = (question: string): string | undefined => (question in INTERFACE_PLAIN ? `原題：${question}` : undefined);

export type Purpose = "decision" | "class" | "workshop" | "research";
export const PURPOSES: Array<{ value: Purpose; label: string }> = [
  { value: "decision", label: "一起做決定" }, { value: "class", label: "上課" }, { value: "workshop", label: "工作坊" }, { value: "research", label: "研究" },
];
export type Member = { identity_id: string; display_name: string; role: "convener" | "participant" | "facilitator"; review_state: "confirmed" | "pending_review"; notice?: string };
export type Group = { group_id: string; name: string; purpose: Purpose; status: "open" | "closed"; my_role: Member["role"]; my_review_state: Member["review_state"]; held_notice?: string; members?: Member[] };
export type Invite = { invite_id: string; role: string; created_at: string; expires_at: string };

export type Item<C = Record<string, any>> = { doc_id: string; kind: string; version: number; content: C; author: Author; at: string; created_at?: string; mine: boolean; who: string };
export type SavedItem<C = Record<string, any>> = Item<C> & { notices: Notice[] };
export type Dissent = { doc_id: string; option: string; reason: string; who: string; mine: boolean; at: string };
export type Authority = { current: Array<{ to: string; to_me: boolean; scope: string; grantors: string[]; my_share: string | null }>; renegotiate: Array<{ to: string; scope: string; taken_back_by: string; notice: string; at: string }> };
export type AgreementTable = { insufficient: true; why: string } | { insufficient: false; options: Record<string, { agreed_across: boolean; objections: string[] }> };
export type Agreement = AgreementTable & { held: string[]; heaviest_left_out: boolean; without_heaviest: AgreementTable; rule?: { version: string } };
// What another member chose to share with this group (view/shared), as the server projects it (ai_lego/platform/collab_shared.py): their words only; `who` is how they are shown.
export type Shared = { who: string; title: string; lines: string[] };
export type AiTurn = { saved?: Item & { waiting?: boolean }; handback?: string; stopped?: "crisis"; notice?: string; resources?: Array<{ name: string; contact: string }> };

export const groups = {
  list: () => apiFetch<Group[]>("/groups"),
  create: (name: string, purpose: Purpose) => apiFetch<Group>("/groups", { method: "POST", body: JSON.stringify({ name, purpose }) }),
  get: (id: string) => apiFetch<Group>(`/groups/${enc(id)}`),
  invite: (id: string) => apiFetch<{ token: string; invite_id: string; expires_at: string }>(`/groups/${enc(id)}/invites`, { method: "POST", body: JSON.stringify({ role: "participant" }) }),
  invites: (id: string) => apiFetch<Invite[]>(`/groups/${enc(id)}/invites`),
  revoke: (id: string, inviteId: string) => apiFetch<{ revoked: boolean }>(`/groups/${enc(id)}/invites/${enc(inviteId)}`, { method: "DELETE" }),
  confirm: (id: string, identityId: string) => apiFetch<unknown>(`/groups/${enc(id)}/members/${enc(identityId)}/confirm`, { method: "POST" }),
};

const base = (id: string) => `/groups/${enc(id)}/collab`;
export const collab = {
  // `mine`: only what I wrote -- what a page asks before I wrote mine of a round (write before see)
  list: <C,>(id: string, kind: string, mine = false) => apiFetch<Array<Item<C>>>(`${base(id)}/${enc(kind)}${mine ? "?mine=true" : ""}`),
  create: <C,>(id: string, kind: string, content: C) => apiFetch<SavedItem<C>>(`${base(id)}/${enc(kind)}`, { method: "POST", body: JSON.stringify({ content }) }),
  update: <C,>(id: string, kind: string, item: Item<C>, content: C) => apiFetch<SavedItem<C>>(`${base(id)}/${enc(kind)}/${enc(item.doc_id)}`, { method: "PUT", body: JSON.stringify({ content, base_version: item.version }) }),
  // take back my own share of authority (the API names me: nobody takes back another's share)
  revoke: (id: string, docId: string) => apiFetch<{ notices: Notice[] }>(`${base(id)}/collab.authority/${enc(docId)}/revoke`, { method: "POST" }),
  versions: <C,>(id: string, kind: string, docId: string) => apiFetch<Array<Item<C>>>(`${base(id)}/${enc(kind)}/${enc(docId)}/versions`),
  dissent: (id: string) => apiFetch<Dissent[]>(`${base(id)}/view/dissent`),
  authority: (id: string) => apiFetch<Authority>(`${base(id)}/view/authority`),
  agreement: (id: string) => apiFetch<Agreement>(`${base(id)}/view/agreement`),
  shared: (id: string) => apiFetch<Shared[]>(`${base(id)}/view/shared`),
  notHeard: (id: string, round: number) => apiFetch<{ round: number; not_heard: string[] }>(`${base(id)}/view/not-heard?round=${round}`),
  ai: (id: string, action: string, context: Record<string, unknown>) => apiFetch<AiTurn>(`/groups/${enc(id)}/ai/${enc(action)}`, { method: "POST", body: JSON.stringify({ context }) }),
};
