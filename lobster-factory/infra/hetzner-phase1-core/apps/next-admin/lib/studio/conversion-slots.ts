// How many web/print image conversions (sharp, Ghostscript) /api/tools/image/process runs at once in this process.
// Every product door serves that route (lib/portal/doors.ts PLATFORM_APIS) and it bills nothing, so CPU is its only
// cost: past the cap the caller gets 429 instead of queueing. Lives here, not in the route: a route file may export only
// the names Next.js allows (app/__tests__/route-exports.test.ts).
export const MAX_CONVERSIONS = 2;
let running = 0;

/** Take a slot; false = all slots busy. Every true must be paired with releaseConversionSlot() in a finally. */
export function takeConversionSlot(): boolean {
  if (running >= MAX_CONVERSIONS) return false;
  running++;
  return true;
}

export function releaseConversionSlot(): void {
  running = Math.max(0, running - 1);
}
