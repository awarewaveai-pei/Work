"use client";
// Staff page body: the shared calendar plus the cache refresh (/api/tools/events/sync), which no door serves.
import type { ReactNode } from "react";
import EventsCalendar, { type EventsSyncResult } from "./EventsCalendar";

async function sync(): Promise<EventsSyncResult> {
  const res = await fetch("/api/tools/events/sync", { method: "POST" });
  return res.json() as Promise<EventsSyncResult>;
}

export default function EventsCalendarStaff({ heading }: { heading?: ReactNode }) {
  return <EventsCalendar sync={sync} heading={heading} />;
}
