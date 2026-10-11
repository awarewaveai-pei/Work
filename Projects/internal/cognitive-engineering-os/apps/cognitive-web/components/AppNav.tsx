"use client";

// The main menu (ENTRY_SLICE1_CHECKLIST.md items 11-12): five things a person does, then the account at the bottom. A
// left sidebar on a desktop, a bottom bar on a phone (design-system.css). Every platform page still has a place: the
// items under a section (開新案子, 我的群組, 工具目錄, 工作流, 課程, 校準) show while you are in that section. 帶領 shows only to a
// facilitator (GET /facilitate/me: the facilitator course finished, platform/visibility.py), even on /lead itself.
// aria-current = "page" on the item whose page this is, "true" on the section a deeper page sits under: a run page and a
// group sit under 我的案子, a tool page and a lesson under 直接分析, a group's 帶領 page under 帶領.
import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { strings } from "../lib/strings";

type Section = "home" | "projects" | "analyze" | "practice" | "lead" | "data" | "settings" | "help";
type Item = { id: Section; href: string; label: string; icon: string; subs?: Array<{ href: string; label: string; match: (path: string) => boolean }>; bottom?: boolean };
const NAV: Item[] = [
  { id: "home", href: "/", label: "首頁", icon: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>' },
  { id: "projects", href: "/projects", label: "我的案子", icon: '<path d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>',
    subs: [{ href: "/projects/new", label: "開新案子", match: (path) => path === "/projects/new" }, { href: "/groups", label: "我的群組", match: (path) => path.startsWith("/groups") }] },
  { id: "analyze", href: "/analyze", label: "直接分析", icon: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    subs: [{ href: "/methods", label: "工具目錄", match: (path) => path.startsWith("/methods") }, { href: "/workflows", label: "工作流", match: (path) => path.startsWith("/workflows") || path.startsWith("/learn/workflow/") }] },
  { id: "practice", href: "/me/teach", label: "練習", icon: '<path d="M4 5a1 1 0 0 1 1-1h5a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4z"/><path d="M20 5a1 1 0 0 0-1-1h-5a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z"/>',
    subs: [{ href: "/me/teach", label: "課程", match: (path) => path.startsWith("/me/teach") }, { href: "/me/learn", label: "校準", match: (path) => path.startsWith("/me/learn") }] },
  { id: "lead", href: "/lead", label: "帶領", icon: '<path d="M5 21V4"/><path d="M5 4h12l-2.5 4L17 12H5"/>' },
  { id: "data", href: "/me/data", label: "我的資料", icon: '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>', bottom: true },
  { id: "settings", href: "/settings", label: "設定", icon: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>', bottom: true },
  { id: "help", href: "/help", label: "求助", icon: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7"/><path d="M12 17h.01"/>', bottom: true },
];

export function sectionOf(path: string): Section {
  if (path === "/") return "home";
  if (path.startsWith("/settings")) return "settings";
  if (path.startsWith("/help")) return "help";
  if (path.startsWith("/lead") || /^\/groups\/[^/]+\/lead\/?$/.test(path)) return "lead";
  if (path.startsWith("/groups") || path.startsWith("/projects") || /^\/methods\/[^/]+\/run\/?$/.test(path)) return "projects";
  if (path.startsWith("/me/teach") || path.startsWith("/me/learn")) return "practice";
  if (path.startsWith("/me/data")) return "data";
  return "analyze";   // /analyze, /methods, a tool page, /workflows, a lesson
}

export function AppNav() {
  const path = usePathname() || "/";
  const section = sectionOf(path);
  const [leads, setLeads] = useState(false);
  useEffect(() => {
    let active = true;
    apiFetch<{ facilitator: boolean }>("/facilitate/me").then((me) => { if (active) setLeads(Boolean(me.facilitator)); }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  const shown = NAV.filter((item) => item.id !== "lead" || leads);
  const firstBottom = shown.find((item) => item.bottom)?.id;   // the account items sit at the bottom of the sidebar
  const link = (item: Item) => (
    <Link key={item.id} className={`navi${item.id === firstBottom ? " navbottom" : ""}`} href={item.href}
      aria-current={item.id === section ? (item.href === path && !item.subs?.some((sub) => sub.href === path) ? "page" : "true") : undefined}>
      <svg className="glyph" viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: item.icon }} />
      <span>{item.label}</span>
    </Link>
  );
  return (
    <nav className="side" aria-label="主選單">
      <Link className="brand" href="/"><b>{strings.appName}</b><small>{strings.appNameEn}</small></Link>
      {shown.map((item) => <div key={item.id} className="navgroup">
        {link(item)}
        {item.id === section && item.subs?.map((sub) => (
          <Link key={sub.href} className="navi sub" href={sub.href} aria-current={sub.match(path) ? (sub.href === path ? "page" : "true") : undefined}><span>{sub.label}</span></Link>
        ))}
      </div>)}
    </nav>
  );
}
