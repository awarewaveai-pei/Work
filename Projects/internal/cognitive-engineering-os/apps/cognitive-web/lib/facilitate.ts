// FACILITATE's API as the page reads it (ai_lego/apps/api/blocks/facilitate.py, platform/ai_actions/facilitate.py). A leader
// sees a participant only through what that participant consented to show; a supervisor sees the logs and the masked appeals of
// the leaders they supervise now. Nothing here scores or ranks anyone.
import { apiFetch } from "./api";

const enc = encodeURIComponent;

export type Step = { what: string; minutes: number; dont: string[]; stop_signals: string[] };
export type Script = {
  id: string; subject: string; subject_name: string; version: number; state: "draft" | "reviewed"; steps: Step[];
  escalation: { who: string; how: string }; usable: boolean; why_not: string;
};
export type Scripts = { donts: string[]; scripts: Script[]; version: string };
export type Standing = { facilitator: boolean; supervisor: boolean };
export type MyLink = { doc_id: string; supervisor: string; supervisor_name: string; assigned_by: "self" | "unit"; group_id: string; stands: boolean; written_by_me: boolean };
export type Supervisee = { supervisee: string; name: string; assigned_by: "self" | "unit"; group_id: string };
export type Deviation = { what: string; why: string };
export type LogContent = { group_id: string; script: string; script_version: number; followed?: string; deviated?: Deviation[] };
export type SupervisedLog = { doc_id: string; version: number; content: LogContent; at: string };
export type Feedback = { doc_id: string; supervisor_name: string; feedback: string; at: string };
export type MaskedAppeal = { doc_id: string; text: string; named: boolean; on?: string; author_name?: string };
export type Shared = { project_id: string; kind: string; title: string; doc_id: string; version: number; content: Record<string, unknown>; author: string; at: string };
export type Consented = { participants: Array<{ identity_id: string; name: string; led: boolean; shared: Shared[] }> };
export type Help = { notice: string; resources: Array<{ name: string; contact: string }>; fallback?: string | null };
export type Assignment = { doc_id: string; supervisee: string; supervisee_name: string; supervisor: string; supervisor_name: string; written_by_me: boolean; stands: boolean };
export type Pointer = { n: number; line: string; dont: string; text: string };
export type Pointers = { log: string; log_version: number; pointers?: Pointer[]; handback: string };
export type PracticeReply = { script: string; step: number; reply: string };

export const facilitate = {
  scripts: () => apiFetch<Scripts>("/blocks/facilitate/scripts"),
  standing: () => apiFetch<Standing>("/facilitate/me"),
  supervisors: () => apiFetch<MyLink[]>("/facilitate/supervisors"),
  findSupervisor: (email: string) => apiFetch<{ doc_id: string; already: boolean }>("/facilitate/supervisors", { method: "POST", body: JSON.stringify({ email }) }),
  dropSupervisor: (docId: string) => apiFetch<unknown>(`/facilitate/supervisors/${enc(docId)}`, { method: "DELETE" }),
  supervisees: () => apiFetch<Supervisee[]>("/facilitate/supervisees"),
  logs: (id: string) => apiFetch<SupervisedLog[]>(`/facilitate/supervisees/${enc(id)}/logs`),
  appeals: (id: string) => apiFetch<MaskedAppeal[]>(`/facilitate/supervisees/${enc(id)}/appeals`),
  feedback: () => apiFetch<Feedback[]>("/facilitate/feedback"),
  consented: (groupId: string) => apiFetch<Consented>(`/groups/${enc(groupId)}/facilitate/consented`),
  stop: (groupId: string, participant: string | null) => apiFetch<Help>(`/groups/${enc(groupId)}/facilitate/stop`, { method: "POST", body: JSON.stringify(participant ? { participant } : {}) }),
  assignments: (groupId: string) => apiFetch<Assignment[]>(`/groups/${enc(groupId)}/facilitate/assignments`),
  assign: (groupId: string, supervisee: string, email: string) =>
    apiFetch<{ doc_id: string; already: boolean }>(`/groups/${enc(groupId)}/facilitate/assignments`, { method: "POST", body: JSON.stringify({ supervisee, email }) }),
  unassign: (groupId: string, docId: string) => apiFetch<unknown>(`/groups/${enc(groupId)}/facilitate/assignments/${enc(docId)}`, { method: "DELETE" }),
};

/** One consented item as a line a person reads: the first words it holds, never an id. */
export function summary(content: Record<string, unknown>): string {
  const own = ["text", "title", "name", "question", "claim", "statement"].map((key) => content[key]).find((value) => typeof value === "string" && value.trim());
  const words = typeof own === "string" ? own : Object.values(content).filter((value): value is string => typeof value === "string" && value.trim().length > 0).join("；");
  return words.length > 200 ? `${words.slice(0, 200)}…` : words;
}
