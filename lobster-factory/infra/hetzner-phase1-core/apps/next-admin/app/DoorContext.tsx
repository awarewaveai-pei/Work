"use client";
// Whether a page renders on a product door (ADR 018 §2), and that door's menu. ProductDoorShell sets it; staff pages
// leave it unset. A shared component's link to a staff page goes through useDoorHref: staff pages 404 on a door.
import { createContext, useContext, type ReactNode } from "react";
import type { DoorNavItem } from "@/lib/portal/products";

const Door = createContext<readonly DoorNavItem[] | null>(null);

export function DoorProvider({ nav = [], children }: { nav?: readonly DoorNavItem[]; children: ReactNode }) {
  return <Door.Provider value={nav}>{children}</Door.Provider>;
}

export const useOnDoor = () => useContext(Door) !== null;

export const useDoorNav = (): readonly DoorNavItem[] => useContext(Door) ?? [];

/** A staff link (e.g. "/tools/content/topics?d=1") as this page renders it: unchanged on a staff page; on a door, the
 *  door page registered (door.nav `staff`) for that staff page, or null when the door has none -- hide the link. */
export function useDoorHref(staffHref: string): string | null {
  return doorHref(useContext(Door), staffHref);
}

export function doorHref(nav: readonly DoorNavItem[] | null, staffHref: string): string | null {
  if (nav === null) return staffHref;
  const [, pathname, rest] = /^([^?#]*)(.*)$/.exec(staffHref)!;
  const hit = nav.find((n) => `/${n.staff}` === pathname.replace(/(.)\/$/, "$1"));
  return hit ? `/${hit.path}${rest}` : null;
}
