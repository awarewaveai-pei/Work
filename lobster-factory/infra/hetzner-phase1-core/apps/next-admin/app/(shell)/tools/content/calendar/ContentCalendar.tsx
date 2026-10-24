"use client";

import React, { useEffect, useState, useCallback } from "react";
import type { CalendarPost } from "@/lib/content/wp-calendar";
import type { WpSite } from "@/lib/content/wp-sites";
import { useDoorHref } from "@/app/DoorContext";

type ViewMode = "week" | "month";

const STATUS_META: Record<CalendarPost["status"], { label: string; color: string }> = {
  draft:   { label: "草稿",   color: "#94a3b8" },
  future:  { label: "已排程", color: "#f59e0b" },
  publish: { label: "已發布", color: "#10b981" },
};

// ─── Date helpers ─────────────────────────────────────────────────────────────

function getMonthDays(year: number, month: number): Date[] {
  const days: Date[] = [];
  const first = new Date(year, month, 1);
  const last  = new Date(year, month + 1, 0);
  const startDow = (first.getDay() + 6) % 7;
  for (let i = startDow - 1; i >= 0; i--) days.push(new Date(year, month, -i));
  for (let d = 1; d <= last.getDate(); d++) days.push(new Date(year, month, d));
  while (days.length % 7 !== 0) days.push(new Date(year, month + 1, days.length - last.getDate() - startDow + 1));
  return days;
}

function getWeekDays(anchor: Date): Date[] {
  const dow = (anchor.getDay() + 6) % 7;
  const mon = new Date(anchor);
  mon.setDate(anchor.getDate() - dow);
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return d; });
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatDateHeader(d: Date) {
  return d.toLocaleDateString("zh-TW", { weekday: "short", month: "numeric", day: "numeric" });
}

function formatMonthYear(year: number, month: number) {
  return new Date(year, month, 1).toLocaleDateString("zh-TW", { year: "numeric", month: "long" });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false });
}

// WP returns post.date as site-local time with no TZ offset (e.g. "2026-06-13T14:00:00").
// Do NOT round-trip through new Date() — that would shift by the browser's UTC offset.
// datetime-local input uses the same YYYY-MM-DDTHH:MM format, so we just slice/pad.
function toDatetimeLocal(iso: string): string {
  return iso.slice(0, 16); // "2026-06-13T14:00:00" → "2026-06-13T14:00"
}

function fromDatetimeLocal(val: string): string {
  // Return site-local as WP expects: YYYY-MM-DDTHH:MM:SS (no TZ offset)
  return val.length === 16 ? `${val}:00` : val;
}

const DOW_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

// ─── Edit Modal ───────────────────────────────────────────────────────────────

interface EditModalProps {
  post: CalendarPost;
  onClose: () => void;
  onSaved: (updated: CalendarPost) => void;
  onDeleted: (siteId: string, postId: number) => void;
}

function EditModal({ post, onClose, onSaved, onDeleted }: EditModalProps) {
  const [dateVal, setDateVal]   = useState(() => toDatetimeLocal(post.date));

  // Re-sync when post.date changes after a save (prevents stale field on re-edit)
  useEffect(() => { setDateVal(toDatetimeLocal(post.date)); }, [post.date]);
  const [saving, setSaving]     = useState(false);
  const [publishing, setPub]    = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [error, setError]       = useState("");

  async function handleSaveDate() {
    setSaving(true); setError("");
    try {
      const isoDate = fromDatetimeLocal(dateVal);
      const newStatus = post.status === "draft" ? "future" : post.status;
      const res = await fetch("/api/content/wp-post", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId: post.siteId, postId: post.id, date: isoDate, status: newStatus }),
      });
      const data = await res.json() as { ok: boolean; error?: string; post?: { status: string; date: string } };
      if (!data.ok) { setError(data.error ?? "更新失敗"); return; }
      onSaved({ ...post, date: data.post?.date ?? isoDate, status: (data.post?.status ?? newStatus) as CalendarPost["status"] });
    } finally { setSaving(false); }
  }

  async function handlePublishNow() {
    setPub(true); setError("");
    try {
      const res = await fetch("/api/content/wp-post", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId: post.siteId, postId: post.id, status: "publish" }),
      });
      const data = await res.json() as { ok: boolean; error?: string; post?: { status: string; date: string; link?: string } };
      if (!data.ok) { setError(data.error ?? "發布失敗"); return; }
      onSaved({ ...post, status: "publish", viewUrl: data.post?.link ?? post.viewUrl });
    } finally { setPub(false); }
  }

  async function handleDelete() {
    setDeleting(true); setError("");
    try {
      const res = await fetch("/api/content/wp-post", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId: post.siteId, postId: post.id }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) { setError(data.error ?? "刪除失敗"); return; }
      onDeleted(post.siteId, post.id);
    } finally { setDeleting(false); }
  }

  const inputStyle = "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-indigo-500";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: post.siteColor }} />
              <span className="text-xs text-gray-400">{post.siteName}</span>
              <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ background: STATUS_META[post.status].color + "25", color: STATUS_META[post.status].color }}>
                {STATUS_META[post.status].label}
              </span>
            </div>
            <h3 className="font-semibold text-base leading-snug text-gray-100 line-clamp-2">{post.title}</h3>
          </div>
          <button onClick={onClose} className="ml-3 flex-shrink-0 text-gray-500 hover:text-gray-300 text-lg leading-none mt-0.5">✕</button>
        </div>

        {/* Date/time editor */}
        <div className="mb-5">
          <label className="block text-xs font-medium text-gray-400 mb-1.5">排程時間</label>
          <input
            type="datetime-local"
            value={dateVal}
            onChange={e => setDateVal(e.target.value)}
            className={inputStyle}
          />
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-900/40 border border-red-700 rounded-lg text-sm text-red-300">{error}</div>
        )}

        {/* Actions */}
        <div className="space-y-2">
          {/* Publish now */}
          {post.status !== "publish" && (
            <button
              onClick={handlePublishNow}
              disabled={publishing || saving}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-xl text-sm font-semibold transition flex items-center justify-center gap-2">
              {publishing ? "發布中…" : "⚡ 立即發布"}
            </button>
          )}

          {/* Save schedule */}
          <button
            onClick={handleSaveDate}
            disabled={saving || publishing}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-xl text-sm font-semibold transition">
            {saving ? "儲存中…" : post.status === "publish" ? "更新發布時間" : "儲存排程時間"}
          </button>

          {/* WP edit link */}
          <a href={post.editUrl} target="_blank" rel="noopener noreferrer"
            className="w-full py-2.5 bg-gray-700 hover:bg-gray-600 rounded-xl text-sm font-medium transition flex items-center justify-center gap-1.5">
            WordPress 後台編輯 ↗
          </a>

          {post.viewUrl && post.status === "publish" && (
            <a href={post.viewUrl} target="_blank" rel="noopener noreferrer"
              className="w-full py-2.5 bg-gray-800 hover:bg-gray-700 rounded-xl text-sm font-medium transition flex items-center justify-center gap-1.5 text-gray-300">
              查看文章 ↗
            </a>
          )}

          {/* Delete */}
          <div className="pt-1">
            {confirmDel ? (
              <div className="flex gap-2">
                <button onClick={handleDelete} disabled={deleting}
                  className="flex-1 py-2.5 bg-red-700 hover:bg-red-600 disabled:opacity-50 rounded-xl text-sm font-semibold transition">
                  {deleting ? "刪除中…" : "確認移至垃圾桶"}
                </button>
                <button onClick={() => setConfirmDel(false)}
                  className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 rounded-xl text-sm font-medium transition">
                  取消
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmDel(true)}
                className="w-full py-2 text-red-400 hover:text-red-300 text-sm font-medium transition">
                移至垃圾桶
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Post card (used in both week and month views) ───────────────────────────

function PostCard({ post, onClick }: { post: CalendarPost; onClick: () => void }) {
  const sm = STATUS_META[post.status];
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-lg px-2 py-1.5 text-xs transition hover:brightness-110 group"
      style={{ backgroundColor: post.siteColor + "22", border: `1px solid ${post.siteColor}44` }}>
      <div className="flex items-center gap-1 mb-0.5">
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: sm.color }} />
        <span className="font-medium tabular-nums" style={{ color: post.siteColor }}>{formatTime(post.date)}</span>
      </div>
      <div className="truncate text-gray-200 group-hover:text-white">{post.title}</div>
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ContentCalendar() {
  // Staff links as this page renders them; null on the content door when it has no such page (hide).
  const clientsHref = useDoorHref("/ops/clients");
  const studioHref = useDoorHref("/tools/content");
  const [posts, setPosts]             = useState<CalendarPost[]>([]);
  const [sites, setSites]             = useState<WpSite[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");
  const [view, setView]               = useState<ViewMode>("week");
  const [anchor, setAnchor]           = useState(() => new Date());
  const [hiddenSites, setHiddenSites] = useState<Set<string>>(new Set());
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [editing, setEditing]         = useState<CalendarPost | null>(null);

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

  function handleSaved(updated: CalendarPost) {
    setPosts(prev => prev.map(p => (p.siteId === updated.siteId && p.id === updated.id) ? updated : p));
    setEditing(updated);
  }

  function handleDeleted(siteId: string, postId: number) {
    setPosts(prev => prev.filter(p => !(p.siteId === siteId && p.id === postId)));
    setEditing(null);
  }

  const visiblePosts = posts.filter(p => {
    if (hiddenSites.has(p.siteId)) return false;
    if (filterStatus !== "all" && p.status !== filterStatus) return false;
    return true;
  });

  const days = view === "month" ? getMonthDays(anchor.getFullYear(), anchor.getMonth()) : getWeekDays(anchor);

  function postsForDay(day: Date) {
    return visiblePosts
      .filter(p => isSameDay(new Date(p.date), day))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  function navigate(dir: -1 | 1) {
    const next = new Date(anchor);
    if (view === "month") next.setMonth(next.getMonth() + dir);
    else next.setDate(next.getDate() + dir * 7);
    setAnchor(next);
  }

  const today   = new Date();
  const weekStr = `${formatDateHeader(getWeekDays(anchor)[0])} – ${formatDateHeader(getWeekDays(anchor)[6])}`;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* ── Topbar ── */}
      <div className="border-b border-gray-800 px-6 py-3 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">內容行事曆</h1>
          <div className="flex rounded-lg overflow-hidden border border-gray-700 text-xs">
            {(["week", "month"] as ViewMode[]).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3 py-1.5 font-medium transition ${view === v ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}>
                {v === "week" ? "週" : "月"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {clientsHref && <a href={clientsHref} className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg transition text-gray-400">🔗 客戶管理</a>}
          {studioHref && <a href={studioHref} className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg transition text-gray-400">← 內容工作室</a>}
          <button onClick={() => void load()} className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg transition text-gray-400">↻ 重整</button>
        </div>
      </div>

      <div className="flex" style={{ height: "calc(100vh - 57px)" }}>
        {/* ── Sidebar ── */}
        <aside className="w-52 border-r border-gray-800 p-4 flex-shrink-0 overflow-y-auto text-sm">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-1.5 mb-4">
            {([["future", "排程"], ["draft", "草稿"], ["publish", "發布"]] as [string, string][]).map(([s, l]) => {
              const cnt = visiblePosts.filter(p => p.status === s).length;
              const c = STATUS_META[s as CalendarPost["status"]].color;
              return (
                <button key={s} onClick={() => setFilterStatus(filterStatus === s ? "all" : s)}
                  className={`rounded-lg p-2 text-center border transition ${filterStatus === s ? "border-current" : "border-gray-800 hover:border-gray-700"}`}
                  style={{ color: c, background: filterStatus === s ? c + "18" : "transparent" }}>
                  <div className="text-lg font-bold leading-none">{cnt}</div>
                  <div className="text-xs mt-0.5 opacity-80">{l}</div>
                </button>
              );
            })}
          </div>

          {/* Status filter */}
          <div className="mb-4">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">狀態篩選</div>
            {([["all", "全部顯示"]] as [string, string][]).concat([["future", "已排程"], ["draft", "草稿"], ["publish", "已發布"]]).map(([val, lbl]) => (
              <button key={val} onClick={() => setFilterStatus(val)}
                className={`w-full text-left px-2 py-1.5 rounded-lg text-xs mb-0.5 transition ${filterStatus === val ? "bg-indigo-600/25 text-indigo-300" : "hover:bg-gray-800 text-gray-400"}`}>
                {lbl}
              </button>
            ))}
          </div>

          {/* Site filter */}
          {sites.length > 0 && (
            <div>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5">站點</div>
              {sites.map(s => (
                <button key={s.id}
                  onClick={() => setHiddenSites(prev => { const n = new Set(prev); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n; })}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs mb-0.5 transition hover:bg-gray-800 ${hiddenSites.has(s.id) ? "opacity-35" : ""}`}>
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                  <span className="truncate text-gray-300">{s.name}</span>
                </button>
              ))}
            </div>
          )}
        </aside>

        {/* ── Calendar area ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Nav */}
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-800 text-sm">
            <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-gray-800 transition">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button onClick={() => setAnchor(new Date())}
              className="px-2.5 py-1 text-xs bg-gray-800 hover:bg-gray-700 rounded-lg transition">今天</button>
            <button onClick={() => navigate(1)} className="p-1.5 rounded-lg hover:bg-gray-800 transition">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <span className="font-medium text-sm ml-1">
              {view === "month" ? formatMonthYear(anchor.getFullYear(), anchor.getMonth()) : weekStr}
            </span>
            {loading && <span className="text-xs text-gray-600 ml-2 animate-pulse">載入中…</span>}
          </div>

          {error && (
            <div className="mx-4 mt-3 p-3 bg-red-900/30 border border-red-700/50 rounded-xl text-sm text-red-300">
              {error} — 請確認 WordPress 站點設定
            </div>
          )}

          {/* Grid */}
          <div className="flex-1 overflow-auto">
            {/* DOW headers */}
            <div className="grid grid-cols-7 border-b border-gray-800 sticky top-0 bg-gray-950 z-10">
              {(view === "month" ? DOW_LABELS : getWeekDays(anchor).map(formatDateHeader)).map((lbl, i) => (
                <div key={i} className="py-2 px-2 text-xs font-medium text-gray-500 border-r border-gray-800 last:border-r-0 text-center">
                  {lbl}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {days.map((day, idx) => {
                const isToday   = isSameDay(day, today);
                const inRange   = view === "week" || day.getMonth() === anchor.getMonth();
                const dayPosts  = postsForDay(day);
                const isWeek    = view === "week";

                return (
                  <div key={idx}
                    className={`border-b border-r border-gray-800 last:border-r-0 transition-colors ${isToday ? "bg-indigo-950/20" : "hover:bg-gray-900/30"} ${!inRange ? "opacity-30" : ""}`}
                    style={{ minHeight: isWeek ? "160px" : "88px" }}>
                    {/* Day number */}
                    <div className="px-2 pt-2 pb-1 flex items-center gap-1.5">
                      <span className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full leading-none ${isToday ? "bg-indigo-500 text-white" : "text-gray-500"}`}>
                        {day.getDate()}
                      </span>
                      {dayPosts.length > 0 && !isWeek && (
                        <span className="text-xs text-gray-600">{dayPosts.length}</span>
                      )}
                    </div>

                    {/* Posts */}
                    <div className="px-1.5 pb-1.5 space-y-1">
                      {isWeek ? (
                        // Week view: show all cards with time
                        dayPosts.map(post => (
                          <PostCard key={`${post.siteId}-${post.id}`} post={post} onClick={() => setEditing(post)} />
                        ))
                      ) : (
                        // Month view: compact chips
                        <>
                          {dayPosts.slice(0, 3).map(post => (
                            <button key={`${post.siteId}-${post.id}`}
                              onClick={() => setEditing(post)}
                              className="w-full text-left rounded px-1.5 py-0.5 text-xs truncate transition hover:brightness-110"
                              style={{ backgroundColor: post.siteColor + "28", color: post.siteColor, border: `1px solid ${post.siteColor}40` }}>
                              <span className="opacity-60 mr-1">{formatTime(post.date)}</span>
                              {post.title}
                            </button>
                          ))}
                          {dayPosts.length > 3 && (
                            <div className="text-xs text-gray-600 px-1.5">+{dayPosts.length - 3} 更多</div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Edit modal ── */}
      {editing && (
        <EditModal
          post={editing}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}
