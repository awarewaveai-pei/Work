import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  Sentry.captureException(new Error("[next-admin] Sentry test error — 2026-04-12"));
  await Sentry.flush(2000);
  return NextResponse.json({ ok: true, message: "Test error sent to Sentry" });
}
