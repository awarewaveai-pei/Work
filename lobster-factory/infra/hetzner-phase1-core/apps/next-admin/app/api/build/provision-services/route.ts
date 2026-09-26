import { NextResponse } from "next/server";
import { resolveOpsRole } from "../../../../lib/ops-role";
import { getSupabaseWriteClient } from "../../../../lib/supabase-server";
import { checkProductionChangeAllowed } from "../../../../lib/system-modes/production-change-gate";
import { blockedChangeResponse } from "../../../../lib/system-modes/blocked-change";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_PROVIDERS = [
  "sentry",
  "posthog",
  "uptime_kuma",
  "n8n",
  "github",
  "trigger",
  "supabase",
] as const;

type Provider = (typeof ALLOWED_PROVIDERS)[number];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const resolved = resolveOpsRole(request);
  if (!["owner", "admin", "operator"].includes(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const input = body as Record<string, unknown>;

  if (typeof input.organizationId !== "string" || !UUID_RE.test(input.organizationId)) {
    return NextResponse.json({ ok: false, error: "organizationId must be a valid UUID" }, { status: 400 });
  }
  if (typeof input.customerEmail !== "string" || !input.customerEmail.includes("@")) {
    return NextResponse.json({ ok: false, error: "customerEmail required" }, { status: 400 });
  }

  const rawProviders = Array.isArray(input.providers) ? (input.providers as string[]) : [];
  const providers: Provider[] = rawProviders.filter((p): p is Provider =>
    ALLOWED_PROVIDERS.includes(p as Provider)
  );
  if (providers.length === 0) {
    return NextResponse.json({ ok: false, error: "at least one provider required" }, { status: 400 });
  }

  const gate = await checkProductionChangeAllowed(getSupabaseWriteClient(), input.organizationId);
  if (!gate.allowed) {
    return blockedChangeResponse(gate.mode);
  }

  const secret = process.env.TRIGGER_SECRET_KEY?.trim();
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "TRIGGER_SECRET_KEY not configured on server" },
      { status: 503 }
    );
  }

  const base = (process.env.TRIGGER_API_URL?.trim() ?? "https://api.trigger.dev").replace(/\/$/, "");
  const url = `${base}/api/v1/tasks/orchestrate-tenant-provisioning/trigger`;

  const payload = {
    organizationId: input.organizationId,
    workspaceId: typeof input.workspaceId === "string" ? input.workspaceId : undefined,
    customerEmail: input.customerEmail,
    googleSubject: typeof input.googleSubject === "string" ? input.googleSubject : undefined,
    providers,
    hints: input.hints && typeof input.hints === "object" ? input.hints : {},
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ payload }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: "trigger_unreachable", detail: msg }, { status: 502 });
  }

  const text = await res.text();
  if (!res.ok) {
    return NextResponse.json(
      { ok: false, error: "trigger_rejected", httpStatus: res.status, detail: text.slice(0, 500) },
      { status: 502 }
    );
  }

  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // ok — return raw
  }

  return NextResponse.json({
    ok: true,
    runId: (data.id ?? data.runId ?? null) as string | null,
    providers,
    triggerResponse: data,
  });
}
