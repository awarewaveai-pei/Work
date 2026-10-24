"use client";
// A product door's left menu (ADR 018 §2): the product name, its pages (registry door.nav; links are door-relative and
// middleware serves them under the door's page prefix, so either spelling of the current path marks the active item),
// and its features from the signed list -- each one is bought separately or given by us, so one not held is greyed
// (operator 2026-10-24). The tools' own buttons still grey and the API still asks can().
import { usePathname } from "next/navigation";
import { useDoorNav } from "./DoorContext";
import { usePaidFeatures } from "@/lib/entitlements/use-paid-features";

export function DoorNav({ page, name, features }: { page: string; name: string; features: readonly { key: string; name: string }[] }) {
  const nav = useDoorNav();
  const pathname = usePathname() ?? "/";
  const { holds, why } = usePaidFeatures();
  return (
    <aside className="door-side">
      <div className="door-side-title">{name}</div>
      {nav.length > 0 ? (
        <nav className="door-nav">
          {nav.map((n) => {
            const href = `/${n.path}`;
            const active = pathname === href || pathname === (n.path ? `${page}/${n.path}` : page);
            return <a key={n.path} href={href} className={active ? "door-nav-link active" : "door-nav-link"}>{n.name}</a>;
          })}
        </nav>
      ) : null}
      {features.length > 0 ? (
        <>
          <div className="door-side-head">功能</div>
          <ul className="door-features">
            {features.map((f) => (
              <li key={f.key} className={holds(f.key) ? "door-feature" : "door-feature off"} title={why(f.key)}>{f.name}</li>
            ))}
          </ul>
        </>
      ) : null}
    </aside>
  );
}
