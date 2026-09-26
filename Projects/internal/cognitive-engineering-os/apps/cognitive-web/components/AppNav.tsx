"use client";

// The main menu (mockkit NAV / render_nav): a left sidebar on a desktop, a bottom bar on a phone (design-system.css).
// aria-current = "page" on the four top-level pages, "true" for the section a deeper page sits under -- a run page
// sits under 我的專案 (its result belongs to a project), a lesson under its tool or workflow list.
import Link from "next/link";
import { usePathname } from "next/navigation";

type Section = "home" | "tools" | "workflows" | "projects";
// Menu glyphs are the app's own chrome (same paths as display_catalog.py GLYPHS home / grid / flow / folder), so the
// menu renders even when the catalog cannot be read.
const NAV: Array<{ id: Section; href: string; label: string; icon: string }> = [
  { id: "home", href: "/", label: "首頁", icon: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>' },
  { id: "tools", href: "/methods", label: "工具", icon: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>' },
  { id: "workflows", href: "/workflows", label: "工作流", icon: '<circle cx="5" cy="12" r="2.5"/><circle cx="19" cy="6" r="2.5"/><circle cx="19" cy="18" r="2.5"/><path d="M7.5 12h4M11.5 12c3 0 3-6 5-6M11.5 12c3 0 3 6 5 6"/>' },
  { id: "projects", href: "/projects", label: "我的專案", icon: '<path d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>' },
];

export function sectionOf(path: string): Section {
  if (path === "/") return "home";
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
