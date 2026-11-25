"use client";

// The frame's outer .shell plus the phone bottom bar (blueprint §9.1, §11). Widths are CSS only (globals.css, ≤ 640):
// there the left menu and the client list take no room and 「更多」 shows them over the page; above it the bar is hidden.
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { BottomItem } from "./bottom-items";
import { useCarry } from "./NavRail";

const MENU = ".sidebar, .door-side";
/** What 「更多」 shows (and the bar); everything else in the frame is covered by them. */
const SHOWN = `${MENU}, .client-rail, .client-panel, .bottom-bar`;
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** The largest subtrees holding nothing 「更多」 shows -- the client list sits inside .main, so .main cannot be it. */
const covered = (el: Element): Element[] =>
  el.matches(SHOWN) ? [] : el.querySelector(SHOWN) ? [...el.children].flatMap(covered) : [el];

export function MobileShell({ items, children }: { items: BottomItem[]; children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const carry = useCarry();
  const [open, setOpen] = useState(false);
  const shell = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLElement>(null);
  const more = useRef<HTMLButtonElement>(null);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const root = shell.current;
    if (!open || !root) return;
    // inert, not a focus loop: Tab and screen readers skip the covered page
    const hidden = [...root.children].flatMap(covered);
    hidden.forEach((el) => el.setAttribute("inert", ""));
    root.querySelector(MENU)?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    // a rotated phone can leave the CSS breakpoint with 「更多」 open: the bar is gone, so nothing could close it
    const onResize = () => { if (bar.current && getComputedStyle(bar.current).display === "none") setOpen(false); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      hidden.forEach((el) => el.removeAttribute("inert"));
      more.current?.focus();
    };
  }, [open]);

  // another host's href never equals a path, so only this console's own pages are ever marked current
  const current = (href: string) => pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));

  return (
    // a followed link closes 「更多」 even when it leads to the page already open
    <div ref={shell} className="shell" data-more={open ? "open" : undefined}
      onClick={(e) => { if (open && (e.target as Element).closest("a")) setOpen(false); }}>
      {children}
      <nav ref={bar} className="bottom-bar" aria-label="底列">
        {items.map((i) => (
          <a key={i.href} href={i.noCarry ? i.href : carry(i.href)} aria-current={current(i.href) ? "page" : undefined}>{i.label}</a>
        ))}
        <button ref={more} type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)}>更多</button>
      </nav>
    </div>
  );
}
