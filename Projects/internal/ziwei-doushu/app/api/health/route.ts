import { NextResponse } from "next/server";

/**
 * 健康檢查端點 — 供 Docker HEALTHCHECK 與部署 smoke check(eu-deploy 六項 SOP)。
 * proxy.ts 的 matcher 已排除 /api,不會被語言導向攔截。
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ ok: true, service: "ziwei" });
}
