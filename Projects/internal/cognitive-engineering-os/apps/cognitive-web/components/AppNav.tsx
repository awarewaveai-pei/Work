"use client";

// The main menu (mockkit NAV / render_nav): a left sidebar on a desktop, a bottom bar on a phone (design-system.css).
// aria-current = "page" on a top-level page, "true" for the section a deeper page sits under -- a run page sits under
// 我的專案 (its result belongs to a project), a lesson under its tool or workflow list, a group's 帶領 page under 帶領.
// Every platform page a person starts from has an item here (2026-10-10: 群組/帶領/課程/校準/我的資料 had none, so the live
// site looked like the old one; test "every top-level platform page is in the menu").
import Link from "next/link";
import { usePathname } from "next/navigation";

type Section = "home" | "projects" | "groups" | "lead" | "teach" | "calibrate" | "tools" | "workflows" | "data" | "settings" | "help";
// Menu glyphs are the app's own chrome (same paths as display_catalog.py GLYPHS home / grid / flow / folder), so the
// menu renders even when the catalog cannot be read.
const NAV: Array<{ id: Section; href: string; label: string; icon: string }> = [
  { id: "home", href: "/", label: "首頁", icon: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>' },
  { id: "projects", href: "/projects", label: "我的專案", icon: '<path d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>' },
  { id: "groups", href: "/groups", label: "我的群組", icon: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M15 14.5c3 0 6 2 6 5.5"/>' },
  { id: "lead", href: "/lead", label: "帶領", icon: '<path d="M5 21V4"/><path d="M5 4h12l-2.5 4L17 12H5"/>' },
  { id: "teach", href: "/me/teach", label: "課程", icon: '<path d="M4 5a1 1 0 0 1 1-1h5a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4z"/><path d="M20 5a1 1 0 0 0-1-1h-5a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z"/>' },
  { id: "calibrate", href: "/me/learn", label: "校準", icon: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>' },
  { id: "tools", href: "/methods", label: "工具", icon: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>' },
  { id: "workflows", href: "/workflows", label: "工作流", icon: '<circle cx="5" cy="12" r="2.5"/><circle cx="19" cy="6" r="2.5"/><circle cx="19" cy="18" r="2.5"/><path d="M7.5 12h4M11.5 12c3 0 3-6 5-6M11.5 12c3 0 3 6 5 6"/>' },
  { id: "data", href: "/me/data", label: "我的資料", icon: '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>' },
  { id: "settings", href: "/settings", label: "設定", icon: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>' },
  { id: "help", href: "/help", label: "求助", icon: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7"/><path d="M12 17h.01"/>' },
];

export function sectionOf(path: string): Section {
  if (path === "/") return "home";
  if (path.startsWith("/settings")) return "settings";
  if (path.startsWith("/help")) return "help";
  if (path.startsWith("/lead") || /^\/groups\/[^/]+\/lead\/?$/.test(path)) return "lead";
  if (path.startsWith("/groups")) return "groups";
  if (path.startsWith("/me/teach")) return "teach";
  if (path.startsWith("/me/data")) return "data";
  if (path.startsWith("/me/learn")) return "calibrate";
  if (/^\/methods\/[^/]+\/run\/?$/.test(path) || path.startsWith("/projects")) return "projects";
  if (path.startsWith("/workflows") || path.startsWith("/learn/workflow/")) return "workflows";
  return "tools";
}

export function AppNav({ counts }: { counts: { tools: number; workflows: number } | null }) {
  const path = usePathname() || "/";
  const section = sectionOf(path);
  const top = NAV.some((item) => item.href === path);
  const number: Partial<Record<Section, number>> = counts ? { tools: counts.tools, workflows: counts.workflows } : {};
  return (
    <nav className="side" aria-label="主選單">
      <Link className="brand" href="/"><b>認知作業系統</b><small>思考工具</small></Link>
      {NAV.map((item) => (
        <Link key={item.id} className="navi" href={item.href} aria-current={item.id === section ? (top ? "page" : "true") : undefined}>
          <svg className="glyph" viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: item.icon }} />
          <span>{item.label}</span>
          {number[item.id] !== undefined && <small aria-hidden="true">{number[item.id]}</small>}
        </Link>
      ))}
    </nav>
  );
}
