// Imports nothing: client pages use it, and wp-calendar.ts reaches the service-role client (a door page may not).
// WP returns post.date as site-local time with no TZ offset (e.g. "2026-06-13T14:00:00"). Never round-trip it through
// new Date(): that shifts by the browser's offset. datetime-local uses the same YYYY-MM-DDTHH:MM, so slice/pad.
export function toDatetimeLocal(iso: string): string {
  return iso.slice(0, 16);
}

export function fromDatetimeLocal(val: string): string {
  return val.length === 16 ? `${val}:00` : val;
}
