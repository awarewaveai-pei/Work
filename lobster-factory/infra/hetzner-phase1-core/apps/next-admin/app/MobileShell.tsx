"use client";

// The frame's outer .shell plus the phone bottom bar (blueprint §9.1, §11). Widths are CSS only (globals.css, ≤ 640):
// there the left menu and the client rail take no room and 「更多」 shows them over the page; above it the bar is hidden.
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import type { BottomItem } from "./bottom-items";
import { useCarry } from "./NavRail";

export function MobileShell({ items, children }: { items: BottomItem[]; children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const carry = useCarry();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // another host's href never equals a path, so only this console's own pages are ever marked current
  const current = (href: string) => pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));

  return (
    // a followed link closes 「更多」 even when it leads to the page already open
    <div className="shell" data-more={open ? "open" : undefined}
      onClick={(e) => { if (open && (e.target as Element).closest("a")) setOpen(false); }}>
      {children}
      <nav className="bottom-bar" aria-label="底列">
        {items.map((i) => (
          <a key={i.href} href={i.href.startsWith("/") ? carry(i.href) : i.href} aria-current={current(i.href) ? "page" : undefined}>{i.label}</a>
        ))}
        <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)}>更多</button>
      </nav>
    </div>
  );
}
