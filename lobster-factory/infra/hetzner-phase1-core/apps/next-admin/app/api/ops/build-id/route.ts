// GET /api/ops/build-id -- the build this server is running. UpdateNotice compares it with the build the open page was
// rendered from: a tab opened before a deploy keeps running the old client code until it reloads, and nothing said so
// (2026-10-23: a tarot batch was started and loaded with the pre-deploy code an hour after the deploy).
import { NextResponse } from "next/server";
import { currentBuildId } from "@/lib/build-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): Response {
  return NextResponse.json({ buildId: currentBuildId() }, { headers: { "Cache-Control": "no-store" } });
}
