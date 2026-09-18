// GET /api/cognitive-os/open?project=<id>
//
// The other half of the "找不到資料" bug (operator report, 2026-09-18): every "已送 Cognitive OS" /
// "前往 Cognitive OS 挑選方法" link used to point straight at
// `https://cognitive.aware-wave.com/?project=<id>`. That Project genuinely exists (confirmed via a
// direct API call against the service tenant), but it was created by next-admin's SERVICE identity
// (lib/cognitive-os/client.ts), a different tenant from whatever the operator is logged into on the
// dashboard directly -- GET /projects there is tenant-scoped, so the operator's own session never
// sees it and a direct ?project= deep link 404s (PROJECT_NOT_FOUND).
//
// Fix is a same-purpose relative of an OAuth authorization-code redirect, not a merged identity or a
// cross-domain Set-Cookie (both considered and rejected -- see ai_lego's store.py handoff_code
// section for why): this route asks Cognitive OS (already authenticated as the service tenant, via
// this same server's existing login machinery) to mint a single-use code for ITS OWN session, then
// 302s the operator's browser to Cognitive OS's own /auth/handoff, which redeems it and sets a normal
// host-only session cookie from ITS OWN origin -- indistinguishable from having logged in by hand.
// No new secret crosses any boundary that does not already trust it today.
//
// Not client-scoped (no [slug] in the path): unlike the import trigger, there is exactly one service
// tenant total, not one per next-admin client organization, so which client's page linked here is
// irrelevant to this hop.

import { NextResponse } from "next/server";
import { canWriteTenantConfig, resolveOpsRole } from "@/lib/ops-role";
import { isCognitiveOsConfigured, mintCognitiveOsHandoff, COGNITIVE_OS_PUBLIC_URL } from "@/lib/cognitive-os/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Every call site opens this route as a plain `<a target="_blank" href>` — a top-level navigation,
 * not a fetch a script can parse — so an error response has to be something the operator can read in
 * that new tab (critic finding, 2026-09-18: raw JSON was a confusing dead end there, e.g. if the
 * service account's session expired and a forced re-login also failed).
 */
// mint.error (the one interpolated value below that isn't a literal written in this file) is a
// trusted server-to-server response from this app's own Cognitive OS client today, not
// browser-supplied input -- escaped anyway so this stays true if that ever changes.
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function errorPage(message: string, status: number): NextResponse {
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><title>Cognitive OS</title><body style="font:14px system-ui;padding:24px;color:#111827">⚠ ${escapeHtml(message)}</body>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export async function GET(request: Request) {
  const resolved = resolveOpsRole(request);
  if (!canWriteTenantConfig(resolved.role)) {
    return errorPage("這個帳號角色沒有權限開啟 Cognitive OS。", 403);
  }
  if (!isCognitiveOsConfigured()) {
    return errorPage("伺服器尚未設定 Cognitive OS 服務帳號（COGNITIVE_OS_* 環境變數缺漏）。", 503);
  }

  const projectId = new URL(request.url).searchParams.get("project");
  if (!projectId) return errorPage("缺少 project 參數。", 400);

  const mint = await mintCognitiveOsHandoff(projectId);
  // `=== false`, never `!mint.ok`: see lib/cognitive-os/client.ts's own comment on this repo's
  // strict:false tsconfig not narrowing a discriminated union via negated truthiness.
  if (mint.ok === false) {
    return errorPage(`無法向 Cognitive OS 取得存取憑證：${mint.error}`, mint.status ?? 502);
  }

  return NextResponse.redirect(`${COGNITIVE_OS_PUBLIC_URL}/auth/handoff?code=${encodeURIComponent(mint.value.code)}`, 302);
}
