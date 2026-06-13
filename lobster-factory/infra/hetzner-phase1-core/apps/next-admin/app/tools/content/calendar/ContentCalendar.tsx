"use client";

import React, { useEffect, useState, useCallback } from "react";
import type { CalendarPost } from "@/app/api/content/calendar/route";
import type { WpSite } from "@/lib/content/wp-sites";

type ViewMode = "week" | "month";

const STATUS_LABEL: Record<CalendarPost["status"], { label: string; color: string }> = {
  draft:   { label: "草稿",     color: "#94a3b8" },
  future:  { label: "已排程",   color: "#f59e0b" },
  publish: { label: "已發布",   color: "#10b981" },
};

function getMonthDays(year: number, month: number): Date[] {
  const days: Date[] = [];
  const first = new Date(year, month, 1);
  const last  = new Date(year, month + 1, 0);

  // Fill leading days from previous month (to start on Monday)
  const startDow = (first.getDay() + 6) % 7; // 0=Mon
  for (let i = startDow - 1; i >= 0; i--) {
    days.push(new Date(year, month, -i));
  }
  for (let d = 1; d <= last.getDate(); d++) {
    days.push(new Date(year, month, d));
  }
  // Fill trailing days to complete last week
  while (days.length % 7 !== 0) {
    days.push(new Date(year, month + 1, days.length - last.getDate() - startDow + 1));
  }
  return days;
}

function getWeekDays(anchor: Date): Date[] {
  const dow = (anchor.getDay() + 6) % 7; // Monday=0
  const mon = new Date(anchor);
  mon.setDate(anchor.getDate() - dow);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return d;
  });
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function formatDateHeader(d: Date): string {
  return d.toLocaleDateString("zh-TW", { weekday: "short", month: "numeric", day: "numeric" });
}

function formatMonthYear(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString("zh-TW", { year: "numeric", month: "long" });
}

const DOW_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

export default function ContentCalendar() {
  const [posts, setPosts]           = useState<CalendarPost[]>([]);
  const [sites, setSites]           = useState<WpSite[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState("");
  const [view, setView]             = useState<ViewMode>("month");
  const [anchor, setAnchor]         = useState(() => new Date());
  const [hiddenSites, setHiddenSites] = useState<Set<string>>(new Set());
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [expandedPost, setExpandedPost] = useState<CalendarPost | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/content/calendar");
      const data = await res.json() as { ok: boolean; posts?: CalendarPost[]; sites?: WpSite[]; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Failed to load");
      setPosts(data.posts ?? []);
      setSites(data.sites ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Filter posts
  const visiblePosts = posts.filter(p => {
    if (hiddenSites.has(p.siteId)) return false;
    if (filterStatus !== "all" && p.status !== filterStatus) return false;
    return true;
  });

  // Grid days
  const days = view === "month"
    ? getMonthDays(anchor.getFullYear(), anchor.getMonth())
    : getWeekDays(anchor);

  function postsForDay(day: Date) {
    return visiblePosts.filter(p => isSameDay(new Date(p.date), day));
  }

  function navigate(dir: -1 | 1) {
    const next = new Date(anchor);
    if (view === "month") next.setMonth(next.getMonth() + dir);
    else next.setDate(next.getDate() + dir * 7);
    setAnchor(next);
  }

  const today = new Date();

  const totalScheduled = visiblePosts.filter(p => p.status === "future").length;
  const totalDraft     = visiblePosts.filter(p => p.status === "draft").length;
  const totalPublished = visiblePosts.filter(p => p.status === "publish").length;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-semibold">內容行事曆</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              跨站文章排程 · {totalScheduled} 篇排程 · {totalDraft} 篇草稿 · {totalPublished} 篇已發布
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a href="/tools/content" className="px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 rounded-md transition">
              ← 回內容工作室
            </a>
            <button onClick={() => void load()}
              className="px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 rounded-md transition">
              重新整理
            </button>
          </div>
        </div>
      </div>

      <div className="flex h-[calc(100vh-81px)]">
        {/* Sidebar */}
        <div className="w-56 border-r border-gray-800 p-4 flex-shrink-0 overflow-y-auto">
          <div className="mb-4">
            <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">檢視方式</div>
            <div className="flex rounded-md overflow-hidden border border-gray-700">
              {(["month", "week"] as ViewMode[]).map(v => (
                <button key={v}
                  onClick={() => setView(v)}
                  className={`flex-1 py-1.5 text-xs font-medium transition ${view === v ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}>
                  {v === "month" ? "月" : "週"}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">文章狀態</div>
            {([["all", "全部"], ["future", "已排程"], ["draft", "草稿"], ["publish", "已發布"]] as [string, string][]).map(([val, lbl]) => (
              <button key={val} onClick={() => setFilterStatus(val)}
                className={`w-full text-left px-2 py-1.5 rounded text-sm mb-1 transition ${filterStatus === val ? "bg-indigo-600/30 text-indigo-300" : "hover:bg-gray-800 text-gray-400"}`}>
                {lbl}
              </button>
            ))}
          </div>

          {sites.length > 0 && (
            <div>
              <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">WordPress 站點</div>
              {sites.map(s => (
                <button key={s.id}
                  onClick={() => setHiddenSites(prev => {
                    const next = new Set(prev);
                    if (next.has(s.id)) next.delete(s.id); else next.add(s.id);
                    return next;
                  })}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm mb-1 transition ${hiddenSites.has(s.id) ? "opacity-40" : "hover:bg-gray-800"}`}>
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                  <span className="truncate text-gray-300">{s.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Calendar */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Nav bar */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800">
            <button onClick={() => navigate(-1)}
              className="p-1.5 rounded hover:bg-gray-800 transition">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button onClick={() => setAnchor(new Date())}
              className="px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 rounded transition">
              今天
            </button>
            <button onClick={() => navigate(1)}
              className="p-1.5 rounded hover:bg-gray-800 transition">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <span className="font-medium text-sm">
              {view === "month"
                ? formatMonthYear(anchor.getFullYear(), anchor.getMonth())
                : `${formatDateHeader(getWeekDays(anchor)[0])} – ${formatDateHeader(getWeekDays(anchor)[6])}`}
            </span>
            {loading && <span className="text-xs text-gray-500 ml-2">載入中...</span>}
          </div>

          {error && (
            <div className="mx-4 mt-3 p-3 bg-red-900/30 border border-red-700 rounded text-sm text-red-300">
              {error} — 請確認 WordPress 站點設定
            </div>
          )}

          {/* Grid */}
          <div className="flex-1 overflow-auto">
            {/* DOW headers */}
            <div className="grid grid-cols-7 border-b border-gray-800 sticky top-0 bg-gray-950 z-10">
              {(view === "month" ? DOW_LABELS : getWeekDays(anchor).map(d => formatDateHeader(d))).map((lbl, i) => (
                <div key={i} className="py-2 text-center text-xs font-medium text-gray-500 border-r border-gray-800 last:border-r-0">
                  {lbl}
                </div>
              ))}
            </div>

            {/* Days */}
            <div className="grid grid-cols-7">
              {days.map((day, idx) => {
                const isToday  = isSameDay(day, today);
                const isThisMonth = view === "week" || day.getMonth() === anchor.getMonth();
                const dayPosts = postsForDay(day);

                return (
                  <div key={idx}
                    className={`min-h-[5.5rem] p-1.5 border-b border-r border-gray-800 last:border-r-0 transition-colors ${isToday ? "bg-indigo-950/30" : "hover:bg-gray-900/50"} ${!isThisMonth ? "opacity-40" : ""}`}>
                    <div className={`text-xs mb-1 font-medium w-6 h-6 flex items-center justify-center rounded-full ${isToday ? "bg-indigo-600 text-white" : "text-gray-500"}`}>
                      {day.getDate()}
                    </div>
                    <div className="space-y-0.5">
                      {dayPosts.slice(0, 3).map(post => (
                        <button key={`${post.siteId}-${post.id}`}
                          onClick={() => setExpandedPost(post)}
                          className="w-full text-left rounded px-1.5 py-0.5 text-xs truncate transition hover:brightness-110"
                          style={{ backgroundColor: post.siteColor + "33", color: post.siteColor, border: `1px solid ${post.siteColor}55` }}>
                          <span className="opacity-70 mr-1">{STATUS_LABEL[post.status].label}</span>
                          {post.title}
                        </button>
                      ))}
                      {dayPosts.length > 3 && (
                        <div className="text-xs text-gray-500 px-1">+{dayPosts.length - 3} 更多</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Post detail modal */}
      {expandedPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setExpandedPost(null)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: expandedPost.siteColor }} />
                  <span className="text-xs text-gray-400">{expandedPost.siteName}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: STATUS_LABEL[expandedPost.status].color + "33", color: STATUS_LABEL[expandedPost.status].color }}>
                    {STATUS_LABEL[expandedPost.status].label}
                  </span>
                </div>
                <h3 className="font-semibold text-base leading-tight">{expandedPost.title}</h3>
              </div>
              <button onClick={() => setExpandedPost(null)} className="text-gray-500 hover:text-gray-300 ml-3 flex-shrink-0">✕</button>
            </div>
            <p className="text-sm text-gray-400 mb-4">
              {new Date(expandedPost.date).toLocaleString("zh-TW", {
                year: "numeric", month: "long", day: "numeric",
                hour: "2-digit", minute: "2-digit",
              })}
            </p>
            <div className="flex gap-2">
              <a href={expandedPost.editUrl} target="_blank" rel="noopener noreferrer"
                className="flex-1 text-center py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium transition">
                WordPress 編輯
              </a>
              {expandedPost.viewUrl && expandedPost.status === "publish" && (
                <a href={expandedPost.viewUrl} target="_blank" rel="noopener noreferrer"
                  className="flex-1 text-center py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition">
                  查看文章
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
