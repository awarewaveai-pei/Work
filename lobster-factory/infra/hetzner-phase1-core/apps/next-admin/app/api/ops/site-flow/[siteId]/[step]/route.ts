// /api/ops/site-flow/[siteId]/[step] (SITE-FLOW-COMPLETION-PLAN.md §1-3, card SF-G).
//   POST {action:"plan", input?, environment?}             -> {plan, planHash}: what the step would do. Changes nothing.
//   POST {action:"execute", planHash, input?, environment?} -> runs the step if the recomputed plan has that hash (else
//                                                            409). `input` = the step's own fields (parseInput); send
//                                                            the same input as the plan, it is part of the hash.
//   POST {action:"poll", runId, environment?}       -> one run; a background host job is polled and finished here
//                                                     (can verify and roll back on the host, so a POST: CSRF-guarded).
// Owner/admin staff only. The engine (lib/site-flow/engine.ts) owns every rule past the role check.

import { NextResponse } from "next/server";
import { getSupabaseWriteClient } from "@/lib/supabase-server";
import { canWriteTenantConfig, resolveOpsRole } from "@/lib/ops-role";
import { staffOnly } from "@/lib/tenant-guard";
import {
  environmentTypeParam,
  executeStep,
  loadSiteEnvironment,
  planStep,
  pollRun,
  SITE_STEP_DEFINITIONS,
  type EngineDeps,
} from "@/lib/site-flow/engine";
import { createSiteGateClient, gateTargetOf, sshGateTransport, unconfiguredTransport } from "@/lib/site-flow/gate-client";
import { isSiteStepKey } from "@/lib/site-flow/types";
import type { SupabaseClient } from "@supabase/supabase-js";

function deps(db: SupabaseClient): EngineDeps {
  const transport = sshGateTransport() ?? unconfiguredTransport;
  return { db, steps: SITE_STEP_DEFINITIONS, gateFor: (env) => createSiteGateClient(gateTargetOf(env), transport) };
}

type Ctx = { params: Promise<{ siteId: string; step: string }> };

export async function POST(request: Request, context: Ctx) {
  const denied = staffOnly(request);
  if (denied) return denied;
  const resolved = resolveOpsRole(request);
  if (!canWriteTenantConfig(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }
  const { siteId, step } = await context.params;
  if (!isSiteStepKey(step)) return NextResponse.json({ ok: false, error: "unknown_step" }, { status: 404 });
  let body: Record<string, unknown>;
  try {
    const raw = await request.json();
    body = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const environmentType = environmentTypeParam(body.environment);
  if (!environmentType) return NextResponse.json({ ok: false, error: "invalid_environment" }, { status: 400 });
  if (body.action !== "plan" && body.action !== "execute" && body.action !== "poll") {
    return NextResponse.json({ ok: false, error: "action_must_be_plan_execute_or_poll" }, { status: 400 });
  }
  const db = getSupabaseWriteClient();
  if (!db) return NextResponse.json({ ok: false, error: "supabase_write_not_configured" }, { status: 503 });
  const loaded = await loadSiteEnvironment(db, siteId, environmentType);
  if ("outcome" in loaded) return NextResponse.json(loaded.outcome.body, { status: loaded.outcome.status });

  const target = { site: loaded.site, environment: loaded.environment, step };
  const r =
    body.action === "plan"
      ? await planStep(deps(db), { ...target, input: body.input })
      : body.action === "poll"
        ? await pollRun(deps(db), { ...target, runId: typeof body.runId === "string" ? body.runId : "" })
        : await executeStep(deps(db), {
            ...target,
            planHash: body.planHash,
            input: body.input,
            actor: { role: resolved.role, userId: request.headers.get("x-ops-user-id")?.trim() || null },
          });
  return NextResponse.json(r.body, { status: r.status });
}
