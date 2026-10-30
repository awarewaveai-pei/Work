// Server-safe: app/DoorContext.tsx is "use client", so a server component (the launcher) cannot call anything exported from it.
import type { DoorNavItem } from "./products";

/** A staff link (e.g. "/tools/content/topics?d=1") as a door renders it: unchanged when nav is null (a staff page); on a
 *  door, the door page registered (door.nav `staff`) for that staff page, or null when the door has none. */
export function doorHref(nav: readonly DoorNavItem[] | null, staffHref: string): string | null {
  if (nav === null) return staffHref;
  const [, pathname, rest] = /^([^?#]*)(.*)$/.exec(staffHref)!;
  const hit = nav.find((n) => `/${n.staff}` === pathname.replace(/(.)\/$/, "$1"));
  return hit ? `/${hit.path}${rest}` : null;
}
