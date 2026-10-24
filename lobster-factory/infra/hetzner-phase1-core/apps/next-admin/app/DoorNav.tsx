"use client";
// A multi-page door's menu (registry door.nav, ADR 018 §2 rule 3). Links are door-relative ("/calendar"); middleware
// serves them under the door's page prefix, so either spelling of the current path marks the active item.
import { usePathname } from "next/navigation";
import { useDoorNav } from "./DoorContext";

export function DoorNav({ page }: { page: string }) {
  const nav = useDoorNav();
  const pathname = usePathname() ?? "/";
  if (nav.length === 0) return null;
  return (
    <nav className="door-nav">
      {nav.map((n) => {
        const href = `/${n.path}`;
        const active = pathname === href || pathname === (n.path ? `${page}/${n.path}` : page);
        return <a key={n.path} href={href} className={active ? "door-nav-link active" : "door-nav-link"}>{n.name}</a>;
      })}
    </nav>
  );
}
