import { NextResponse } from "next/server";
import { readOpsRole } from "@/lib/ops-role";
import { forceParam, syncEventsResponse } from "@/lib/events/sync-response";

export const runtime = "nodejs";
export const maxDuration = 180; // Calendarific curated tourism markets plus sports.

// Admin button only. The host cron uses /api/internal/events/sync: loopback is not a door, middleware 404s it here.
export async function POST(req: Request) {
  if (readOpsRole(req) !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  return syncEventsResponse(forceParam(req));
}
