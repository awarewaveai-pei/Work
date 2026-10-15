"use client";
// 審核與通知 (SOCIAL_MANAGER_PLAN.md C8). The header's 「通知 N」 (lib/social/review.ts needs), the reviewer's approve /
// reject bar in the editor, and the brand's 「要先審核」 setting (owner only; migration 0102).
// Roles: a member row on the brand (Members.tsx, 0103), else ops_role (lib/social/authz.ts roleOn): owner/admin = 擁有者, operator = 編輯, viewer = 唯讀.
import { useEffect, useState } from "react";
import { api, ApiError } from "./api";
import { instantAt, zoned, type Brand, type Post } from "./model";
import type { SlotContext } from "./SocialManager";

export function NeedsButton({ ctx }: { ctx: SlotContext }) {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => { api.needs(ctx.brand.id).then((r) => setN(r.n)).catch(() => setN(null)); }, [ctx.brand.id, ctx.posts, ctx.accounts]);
  return <button type="button" onClick={ctx.openNeeds} title="發佈失敗、連線失效、等你審核">通知 <b>{n ?? "–"}</b></button>;
}

export function ReviewSetting({ ctx }: { ctx: SlotContext }) {
  const [on, setOn] = useState<boolean | null>(null);
  const owner = ctx.brand.role === "owner";
  useEffect(() => { api.settings(ctx.brand.id).then((r) => setOn(r.requireReview)).catch(() => setOn(null)); }, [ctx.brand.id]);
  return (
    <div className="sm-sec">
      <h3>審核與團隊</h3>
      <div className="sm-row sm-chips"><span className="sm-lab">發文前要先審核</span>
        {([[false, "不用"], [true, "要"]] as const).map(([v, label]) => (
          <button type="button" key={label} className={on === v ? "sm-on" : ""} disabled={!owner || on === null}
            onClick={async () => { try { setOn((await api.setRequireReview(ctx.brand.id, v)).requireReview); ctx.say(v ? "之後編輯的貼文要先送審，擁有者核准才會排程。" : "編輯可以直接排程。"); } catch (e) { ctx.say(e instanceof ApiError ? e.message : String(e), true); } }}>
            {label}
          </button>
        ))}
      </div>
      <span className="sm-muted">要審核時：編輯只能送審，擁有者核准或退回；已核准的貼文，編輯要先取消排程才能改內容。</span>
      <span className="sm-muted">沒有加成員的後台帳號照後台角色：擁有者／管理員＝擁有者（可核准），操作員＝編輯，檢視者＝唯讀。每個品牌的成員與審核人在下面「成員」指定。</span>
    </div>
  );
}

/** The approver's bar in the editor: approve at the post's time (or a new one), or reject with a reason. */
export function ReviewBar({ brand, post, onDone }: { brand: Brand; post: Post; onDone: (id: string, message: string) => void }) {
  const tz = brand.default_timezone;
  const at = post.scheduled_at ? zoned(post.scheduled_at, tz) : null;
  const [date, setDate] = useState(at?.date ?? "");
  const [time, setTime] = useState(at?.time ?? "09:00");
  const [reason, setReason] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  if (post.state !== "review" || !(brand.role === "owner" || brand.role === "reviewer")) return null;
  async function act(action: "approve" | "reject") {
    try {
      if (action === "reject" && !reason.trim()) return setHint("退回要寫理由，編輯才知道要改什麼。");
      const when = action === "approve" ? (date ? instantAt(date, time, tz) : "") : undefined;
      if (action === "approve" && (!when || Date.parse(when) <= Date.now())) return setHint("核准要給一個未來的發文時間。");
      const r = await api.setState(brand.id, post.id, post.version, action === "approve" ? { action, scheduledAt: when } : { action, reason: reason.trim() });
      onDone(r.post.id, action === "approve" ? "已核准，照排定時間發。" : "已退回成草稿，理由寫在備註和紀錄。");
    } catch (e) {
      setHint(e instanceof ApiError ? e.message : String(e));
    }
  }
  return (
    <div className="sm-row" style={{ border: "1px solid var(--card-border)", borderRadius: 8, padding: 6 }}>
      <span className="sm-lab">審核</span>
      <input type="date" aria-label="核准後的發文日期" value={date} onChange={(e) => setDate(e.target.value)} />
      <input type="time" aria-label="核准後的發文時間" value={time} onChange={(e) => setTime(e.target.value)} />
      <button type="button" className="btn-primary" onClick={() => act("approve")}>核准並排程</button>
      <input type="text" aria-label="退回理由" placeholder="退回理由（退回時必填）" value={reason} onChange={(e) => setReason(e.target.value)} style={{ flex: 1, minWidth: 120 }} />
      <button type="button" className="sm-danger" onClick={() => act("reject")}>退回</button>
      {hint && <span className="sm-err" style={{ flexBasis: "100%" }}>{hint}</span>}
    </div>
  );
}
