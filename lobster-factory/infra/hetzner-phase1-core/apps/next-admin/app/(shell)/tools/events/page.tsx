"use client";
// Staff page: the shared calendar plus the cache refresh (/api/tools/events/sync), which no door serves.
import EventsCalendar, { type EventsSyncResult } from "./EventsCalendar";

async function sync(): Promise<EventsSyncResult> {
  const res = await fetch("/api/tools/events/sync", { method: "POST" });
  return res.json() as Promise<EventsSyncResult>;
}

export default function EventsPage() {
  return <EventsCalendar sync={sync} />;
}
