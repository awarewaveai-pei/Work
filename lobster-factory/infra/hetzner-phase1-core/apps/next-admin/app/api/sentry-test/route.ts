import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";

export async function GET() {
  Sentry.captureException(new Error("[next-admin] Sentry test error — 2026-04-12"));
  return NextResponse.json({ ok: true, message: "Test error sent to Sentry" });
}
