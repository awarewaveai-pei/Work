// API timestamps are UTC ISO strings ("2026-09-26T15:51:37Z"); people read them in their own time zone, to the minute.
// Call it from client components only: on the server it would print the container's zone (UTC).
export function formatTime(iso: string | null | undefined, timeZone?: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const part = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(date).map((item) => [item.type, item.value]));
  return `${part.year}-${part.month}-${part.day} ${part.hour}:${part.minute}`;
}
