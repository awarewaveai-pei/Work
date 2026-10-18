"use client";
// 紀錄 (SOCIAL_MANAGER_PLAN.md C11; mock: #logView). 「全部紀錄」 = the brand's social_audit_log, newest first (every
// state change, edit, send, connection, list change writes one row: migrations 0098/0100/0101, lib/social/store.ts);
// 「需處理」 = lib/social/review.ts needs(): failed posts, expired channels, and for an approver the posts to review.
import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type LogRow, type NeedsResult } from "./api";
import { platformOf, shortDate, STATE_NAMES, zoned } from "./model";
import type { SlotContext } from "./SocialManager";
import { ROLE_NAMES } from "./model";
import type { PostState } from "@/lib/social/state";

export const ACTION_NAMES: Record<string, string> = {
  create: "建立", edit: "編輯", submit: "送審", approve: "核准", reject: "退回", schedule: "排程", unschedule: "取消排程",
  to_rotation: "加入輪播", from_rotation: "移出輪播", delete: "刪除", restore: "還原", publish_now: "立即發佈",
  queue: "交給 Postiz", send: "送出", send_failed: "送出失敗", published: "已發佈", failed: "發佈失敗",
  rotation_post: "輪播排入", rotation_withdraw: "輪播撤回", rotation_reorder: "輪播排序", review_setting: "審核設定",
  connect_start: "開始連接帳號", connected: "帳號已連接", connect_cancel: "取消連接", unlink: "移除帳號",
  list_save: "儲存輪播清單", list_delete: "刪除輪播清單", media_upload: "上傳媒體",
  member_add: "加入成員", member_role: "改成員角色", member_remove: "移除成員",
  // 0105 (V1.5): the repeat series, tags, auto-reply rules, smart links and reports write these
  repeat_post: "週期貼文排入", repeat_withdraw: "週期貼文撤回", repeat_stop: "停止週期", tag: "標籤", auto_rule: "自動回覆規則", smart_link: "智慧連結", report: "報表",
};

const OP_NAMES: Record<string, string> = { create: "新增", edit: "改", delete: "刪除", save: "儲存", hit: "觸發" };

// actor = "ops:<role>[:<user id>]" | "client:<org>[:<user id>]" | "system:..." (lib/social/authz.ts actorOf)
export const who = (actor: string) => actor.startsWith("system:") ? "系統" : actor.startsWith("client:") ? "客戶"
  : actor === "ops" ? "AwareWave 團隊" : actor.startsWith("ops:") ? `團隊・${actor.split(":")[1]}` : actor;

function summary(row: LogRow, tz: string): string {
  const d = row.detail ?? {};
  const parts: string[] = [];
  // member_* rows carry roles (0103), not post states; no email is logged
  if (row.action.startsWith("member_")) {
    const name = (r: unknown) => (typeof r === "string" && r in ROLE_NAMES ? ROLE_NAMES[r as keyof typeof ROLE_NAMES] : String(r));
    if (typeof d.from === "string" && typeof d.to === "string") return `${name(d.from)} → ${name(d.to)}`;
    return typeof d.role === "string" ? name(d.role) : "";
  }
  if (typeof d.op === "string") parts.push(OP_NAMES[d.op] ?? d.op);   // tag / auto_rule / smart_link / report rows
  if (typeof d.name === "string") parts.push(d.name);
  if (typeof d.from === "string" && typeof d.to === "string") parts.push(`${STATE_NAMES[d.from as PostState] ?? d.from} → ${STATE_NAMES[d.to as PostState] ?? d.to}`);
  if (typeof d.scheduled_at === "string") { const z = zoned(d.scheduled_at, tz); parts.push(`${shortDate(z.date)} ${z.time}`); }
  if (typeof d.reason === "string") parts.push(`理由：${d.reason}`);
  if (typeof d.error === "string") parts.push(d.error);
  if (typeof d.platform === "string") parts.push(platformOf(d.platform).name);
  if (typeof d.posts === "number") parts.push(`${d.posts} 則`);
  if (typeof d.require_review === "boolean") parts.push(d.require_review ? "要先審核" : "不用審核");
  return parts.join("　");
}

export default function LogView({ ctx, initialFilter = "all" }: { ctx: SlotContext; initialFilter?: "all" | "needs" }) {
  const { brand } = ctx;
  const tz = brand.default_timezone;
  const [filter, setFilter] = useState(initialFilter);
  const [rows, setRows] = useState<LogRow[]>([]);
  const [more, setMore] = useState(false);
  const [needs, setNeeds] = useState<NeedsResult | null>(null);

  const load = useCallback(async (before?: number) => {
    try {
      const r = await api.log(brand.id, before);
      setRows((cur) => (before ? [...cur, ...r.log] : r.log));
      setMore(r.log.length === 50);
    } catch (e) {
      ctx.say(e instanceof ApiError ? e.message : String(e), true);
    }
  }, [brand.id, ctx]);

  useEffect(() => { void load(); api.needs(brand.id).then(setNeeds).catch(() => setNeeds(null)); }, [brand.id, ctx.posts, load]);
  useEffect(() => setFilter(initialFilter), [initialFilter]);

  return (
    <div className="sm-list">
      <div className="sm-bar">
        <span className="sm-chips">
          <button type="button" className={filter === "all" ? "sm-on" : ""} onClick={() => setFilter("all")}>全部紀錄</button>
          <button type="button" className={filter === "needs" ? "sm-on" : ""} onClick={() => setFilter("needs")}>需處理（{needs?.n ?? 0}）</button>
        </span>
        <span className="sm-muted">發佈失敗和連線失效也會發 Telegram 通知。</span>
      </div>
      {filter === "all" ? (
        <table>
          <thead><tr><th>時間</th><th>誰</th><th>動作</th><th>結果</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => { const z = zoned(r.at, tz); return (
              <tr key={r.id}>
                <td>{shortDate(z.date)} {z.time}</td>
                <td>{who(r.actor)}</td>
                <td>{ACTION_NAMES[r.action] ?? r.action}</td>
                <td className="sm-wrap">{summary(r, tz)}</td>
                <td>{r.post_id && <button type="button" onClick={() => ctx.select({ kind: "post", id: r.post_id as string })}>打開</button>}</td>
              </tr>
            ); })}
            {!rows.length && <tr><td colSpan={5} className="sm-muted">還沒有紀錄。</td></tr>}
          </tbody>
        </table>
      ) : (
        <table>
          <thead><tr><th>什麼</th><th>內容</th><th>怎麼處理</th><th /></tr></thead>
          <tbody>
            {needs?.failed.map((p) => (
              <tr key={p.id}><td className="sm-err">發佈失敗</td><td className="sm-wrap">{p.body.slice(0, 60)}<br /><span className="sm-muted">{p.errors.join("；")}</span></td>
                <td>改好後重新排程</td><td><button type="button" onClick={() => ctx.select({ kind: "post", id: p.id })}>打開</button></td></tr>
            ))}
            {needs?.expired.map((a) => (
              <tr key={a.id}><td className="sm-err">連線失效</td><td>{platformOf(a.platform).name} {a.label}</td><td>到設定重新連接</td>
                <td><button type="button" onClick={() => ctx.setView("settings")}>重新連接</button></td></tr>
            ))}
            {needs?.review.map((p) => (
              <tr key={p.id}><td>等你審核</td><td className="sm-wrap">{p.body.slice(0, 60)}</td><td>核准或退回</td>
                <td><button type="button" onClick={() => ctx.select({ kind: "post", id: p.id })}>打開</button></td></tr>
            ))}
            {needs && needs.n === 0 && <tr><td colSpan={4} className="sm-muted">沒有需要處理的事。</td></tr>}
          </tbody>
        </table>
      )}
      {filter === "all" && more && <div style={{ padding: 8 }}><button type="button" onClick={() => load(rows[rows.length - 1]?.id)}>載入更多</button></div>}
    </div>
  );
}
