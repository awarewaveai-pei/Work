// Helpers shared by the host steps (card SF-H). Pure: no db writes, no gate calls except through the ctx given.
//
// Traps:
// - preflight is THE observation of the host (aw-hosting-gate.sh site_preflight): container states, volumes, registry,
//   live-nginx occupants, covering certificates. The engine's reader answers every preflight() of one engine call from
//   one host call, so steps call readPreflight freely.
// - vhost_occupants null = the gate could not read the live nginx config: unknown, never "free".

import type { GateCall } from "../gate-client";
import { ingressOf, type GateIngress } from "../gate-client";
import { updateEnvironmentCas } from "../records";
import type { EnvironmentRow, ReadContext, RunFacts, StepObservation, StepResult } from "../types";

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

export interface Registry {
  domain: string;
  ingress: string;
  port: number | null;
  vhost_file: string | null;
}

export interface Preflight {
  slug: string;
  domain: string;
  registry: Registry | null;
  registryError: string;
  /** null = the live nginx config could not be read (unknown). */
  occupants: Array<{ file: string; target: string }> | null;
  occupantsError: string;
  certs: Array<{ dir: string; not_after: string }>;
  wpContainer: string;
  dbContainer: string;
  retired: boolean;
  createPlan: "new" | "retry" | "reused" | "refuse" | string;
  createRefusal: string;
}

export function parsePreflight(d: Json): Preflight {
  const reg = isObj(d.registry) ? d.registry : null;
  const occ = Array.isArray(d.vhost_occupants)
    ? (d.vhost_occupants as unknown[]).filter(isObj).map((o) => ({ file: str(o.file), target: str(o.target) }))
    : null;
  const certs = Array.isArray(d.certs) ? (d.certs as unknown[]).filter(isObj).map((c) => ({ dir: str(c.dir), not_after: str(c.not_after) })) : [];
  return {
    slug: str(d.slug),
    domain: str(d.domain),
    registry: reg
      ? { domain: str(reg.domain), ingress: str(reg.ingress), port: typeof reg.port === "number" ? reg.port : null, vhost_file: str(reg.vhost_file) || null }
      : null,
    registryError: str(d.registry_error),
    occupants: occ,
    occupantsError: str(d.vhost_occupants_error),
    certs,
    wpContainer: str(d.wp_container),
    dbContainer: str(d.db_container),
    retired: d.retired === true,
    createPlan: str(d.create_plan),
    createRefusal: str(d.create_refusal),
  };
}

export type PreflightRead = { ok: true; pf: Preflight } | { ok: false; detail: string };

export async function readPreflight(ctx: Pick<ReadContext, "gate">): Promise<PreflightRead> {
  const r = await ctx.gate.preflight();
  if ("detail" in r) return { ok: false, detail: gateText(r) };
  return { ok: true, pf: parsePreflight(r.data) };
}

export const HEALTHY = "running|healthy";

/** One sentence for a failed gate call, in the operator's words where the gate's reason is known. */
export function gateText(r: GateCall<unknown>): string {
  if (!("error" in r)) return "";
  if (r.error === "transport") return `連不上主機（${r.detail}）`;
  if (r.error === "not_allowed") {
    if (/ingress=product-gateway/.test(r.detail)) {
      return `主機沒有允許這個站使用產品閘道（主機開關檔 AW_SITE_GATEWAY_SLUGS 沒有列出它）：${r.detail}`;
    }
    if (/site verbs are off/.test(r.detail)) return `主機的建站開關沒開（AW_SITE_VERBS）：${r.detail}`;
    return `主機拒絕這個指令：${r.detail}`;
  }
  return `${r.error}：${r.detail}`;
}

export const unknown = (detail: string): StepObservation => ({ status: "unknown", detail });

export function ingress(env: EnvironmentRow): GateIngress | null {
  return ingressOf(env);
}

/** The newest finished run of a step, if any (history is newest first). */
export async function lastRun(ctx: ReadContext, step: Parameters<ReadContext["history"]>[0], status?: RunFacts["status"]): Promise<RunFacts | null> {
  const runs = await ctx.history(step);
  return runs.find((r) => !status || r.status === status) ?? null;
}

/** The `output` a named stage of a run recorded (engine Stage.output); okOnly=false also reads a stage that failed. */
export function stageOutput(run: RunFacts | null, stage: string, okOnly = true): Json | null {
  const stages = run && Array.isArray(run.output.stages) ? (run.output.stages as unknown[]) : [];
  for (let i = stages.length - 1; i >= 0; i--) {
    const s = stages[i];
    if (isObj(s) && s.stage === stage && (!okOnly || s.ok === true) && isObj(s.output)) return s.output;
  }
  return null;
}

export const ok = (detail: string, output?: Json): StepResult => ({ ok: true, detail, ...(output ? { output } : {}) });
export const no = (detail: string, output?: Json): StepResult => ({ ok: false, detail, ...(output ? { output } : {}) });

/**
 * Sets top-level keys of environments.metadata, keeping every other key, through records.ts updateEnvironmentCas (the
 * one CAS write path that ensureEnvironment uses too), so neither write drops the other's keys.
 */
export async function patchEnvironmentMetadata(
  db: ReadContext["db"],
  environmentId: string,
  patch: Json,
  columns: Json = {},
): Promise<{ ok: true } | { ok: false; detail: string }> {
  try {
    const w = await updateEnvironmentCas(db, environmentId, "metadata", (row) => ({
      ok: true,
      patch: { ...columns, metadata: { ...(isObj(row.metadata) ? row.metadata : {}), ...patch } },
    }));
    if (!("error" in w)) return { ok: true };
    if (w.error === "lookup_failed") return { ok: false, detail: "讀不到環境紀錄" };
    if (w.error === "environment_not_found") return { ok: false, detail: "環境紀錄不存在" };
    if (w.detail === "environment kept changing under the write") return { ok: false, detail: "環境紀錄同時被改動，寫入失敗" };
    return { ok: false, detail: "環境紀錄寫入失敗" };
  } catch {
    return { ok: false, detail: "環境紀錄寫入失敗" };
  }
}

/** The site's URL as MainWP and the bridge use it: base_url without a trailing slash; null when unusable. */
export function siteUrlOf(env: EnvironmentRow): string | null {
  if (!env.base_url) return null;
  try {
    const u = new URL(env.base_url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}
