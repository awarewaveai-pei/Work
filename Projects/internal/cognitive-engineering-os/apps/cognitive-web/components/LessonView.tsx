"use client";

// A lesson (lib/lessons.generated.ts: the lessons data, or a workflow's docs/mockups lesson mock) with the
// mock's behaviours, scoped to this container and removed on unmount (client-side navigation mounts it more than once):
//   tabs  -- partials/tabs-script.html: click, ←/→/Home/End on the focused tab (roving tabindex), a [data-tab-go]
//            button, an in-page link or the address (#panel-<id> or any id inside a panel, on load and on hashchange)
//   chips -- partials/lesson-chip-script.html: a domain chip shows that domain's examples (.ex[data-set]) everywhere
//   notes -- partials/page-actions-script.html: a button[data-note] (a link whose page the web does not have yet) writes
//            its sentence under its row; an in-page link opens the closed <details> its target sits in
// Ids are looked up with getElementById + contains (no selector escaping).
import React, { useEffect, useRef } from "react";

export function LessonView({ html }: { html: string }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = box.current;
    if (!root) return;
    const byId = (id: string | null) => {
      const el = id ? document.getElementById(id) : null;
      return el && root.contains(el) ? el : null;
    };
    const tabs = Array.from(root.querySelectorAll<HTMLElement>('.tabs [role="tab"]'));
    const bar = tabs[0]?.parentElement ?? null;
    const select = (tab: HTMLElement, focus = false) => {
      for (const t of tabs) {
        const on = t === tab;
        t.setAttribute("aria-selected", on ? "true" : "false");
        t.tabIndex = on ? 0 : -1;
        const panel = byId(t.getAttribute("aria-controls"));
        if (panel) panel.hidden = !on;
      }
      if (focus) tab.focus();
    };
    const tabFor = (el: Element | null) => {
      const panel = el?.closest('[role="tabpanel"]');
      return panel ? tabs.find((t) => t.getAttribute("aria-controls") === panel.id) ?? null : null;
    };
    const route = () => {
      let id = window.location.hash.slice(1);
      try { id = decodeURIComponent(id); } catch { /* a malformed %-escape: use the raw hash */ }
      const el = byId(id);
      const tab = tabFor(el);
      if (!el || !tab) return;
      select(tab);
      (el.getAttribute("role") === "tabpanel" ? bar ?? el : el).scrollIntoView?.();
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element;
      const chip = target.closest?.(".chip");
      if (chip) {
        const set = chip.getAttribute("data-set");
        root.querySelectorAll(".chip").forEach((c) => { c.classList.toggle("on", c === chip); c.setAttribute("aria-selected", c === chip ? "true" : "false"); });
        root.querySelectorAll<HTMLElement>(".ex").forEach((el) => { el.hidden = el.getAttribute("data-set") !== set; });
        // 用示範案例試一次 opens the chosen domain's example (the default set is the plain #demo) -- N-55
        root.querySelectorAll<HTMLAnchorElement>('a[href*="#demo"]').forEach((link) => { link.href = link.href.replace(/#demo(=[a-z]+)?$/, set && set !== "edd" ? `#demo=${set}` : "#demo"); });
        return;
      }
      const tab = target.closest<HTMLElement>('.tabs [role="tab"]');
      if (tab) { select(tab); return; }
      const go = target.closest("[data-tab-go]");
      if (go) {
        const next = byId(`tab-${go.getAttribute("data-tab-go")}`);
        if (next) { select(next, true); bar?.scrollIntoView?.(); }
        return;
      }
      const pending = target.closest("button[data-note]");
      if (pending) {
        const row = pending.closest(".btns, .tabnext") ?? pending;
        let note = row.nextElementSibling;
        if (!note?.classList.contains("mocknote")) {
          note = document.createElement("p"); note.className = "mocknote"; note.setAttribute("role", "status");
          row.after(note);
        }
        note.textContent = pending.getAttribute("data-note");
        return;
      }
      const link = target.closest('a[href^="#"]');
      const dest = link ? byId(link.getAttribute("href")!.slice(1)) : null;
      const linked = tabFor(dest);
      if (linked) select(linked);
      const fold = dest?.closest("details");
      if (fold) fold.open = true;
    };
    const onKey = (event: KeyboardEvent) => {
      const i = tabs.indexOf(document.activeElement as HTMLElement);
      const n = event.key === "ArrowRight" ? i + 1 : event.key === "ArrowLeft" ? i - 1 : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
      if (i < 0 || n === null) return;
      event.preventDefault();
      select(tabs[(n + tabs.length) % tabs.length], true);
    };
    root.addEventListener("click", onClick);
    bar?.addEventListener("keydown", onKey);
    window.addEventListener("hashchange", route);
    route();
    return () => { root.removeEventListener("click", onClick); bar?.removeEventListener("keydown", onKey); window.removeEventListener("hashchange", route); };
  }, [html]);
  return <div ref={box} dangerouslySetInnerHTML={{ __html: html }} />;
}
