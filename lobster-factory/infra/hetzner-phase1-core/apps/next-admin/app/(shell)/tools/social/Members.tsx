"use client";
// A brand's members (ADR 018 §3; /api/social/members, migration 0103). Owners only: the list carries emails.
// A member row is the person's role on this brand; AwareWave owner/admin accounts are owners without one (authz.ts).
import { useCallback, useEffect, useState } from "react";
import { ApiError, api, type Member } from "./api";
import type { SlotContext } from "./SocialManager";
import type { BrandRole } from "@/lib/social/state";
import { ACCOUNT_COPY } from "@/lib/accounts/invite-copy";

export const ROLE_NAMES: Record<BrandRole, string> = { owner: "擁有者", editor: "編輯", reviewer: "審核人", client: "唯讀" };
const ROLES = Object.keys(ROLE_NAMES) as BrandRole[];

export function MembersSetting({ ctx }: { ctx: SlotContext }) {
  const brand = ctx.brand;
  const say = ctx.say;   // stable (useCallback); ctx itself is a new object every render
  const [members, setMembers] = useState<Member[] | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<BrandRole>("editor");
  const [removing, setRemoving] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The result shows under the add row: the page-level note sits at the top of the page, out of sight from here.
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);

  const load = useCallback(async () => {
    try { setMembers((await api.members(brand.id)).members); } catch (e) { say(e instanceof ApiError ? e.message : String(e), true); }
  }, [brand.id, say]);
  useEffect(() => { if (brand.role === "owner") void load(); }, [brand.role, load]);

  if (brand.role !== "owner") return null;

  async function run(work: () => Promise<unknown>, done: string) {
    setBusy(true);
    setMsg(null);
    try { await work(); setMsg({ text: done, error: false }); await load(); } catch (e) { setMsg({ text: e instanceof ApiError ? e.message : String(e), error: true }); }
    finally { setBusy(false); setRemoving(null); }
  }

  return (
    <div className="sm-sec">
      <h3>成員</h3>
      <span className="sm-muted">每個品牌各自的成員與角色：擁有者管理成員與核准，編輯寫文與排程，審核人核准或退回，唯讀只能看。AwareWave 的擁有者／管理員帳號在所有品牌都是擁有者，不必加。</span>
      <span className="sm-muted">{ACCOUNT_COPY.members_hint}</span>
      {members === null ? <span className="sm-muted">載入中…</span> : members.length === 0 ? <span className="sm-muted">還沒有成員。</span> : members.map((m) => (
        <div className="sm-row" key={m.user_id}>
          <span>{m.email ?? "（帳號已刪除）"}</span>
          <span className="sm-chips">
            {ROLES.map((r) => (
              <button type="button" key={r} className={m.role === r ? "sm-on" : ""} disabled={busy || m.role === r}
                onClick={() => run(() => api.setMemberRole(brand.id, m.user_id, r), `已改成${ROLE_NAMES[r]}。`)}>{ROLE_NAMES[r]}</button>
            ))}
          </span>
          {removing === m.user_id
            ? <><button type="button" disabled={busy} onClick={() => run(() => api.removeMember(brand.id, m.user_id), "已移除。")}>確定移除</button>
                <button type="button" disabled={busy} onClick={() => setRemoving(null)}>取消</button></>
            : <button type="button" disabled={busy} onClick={() => setRemoving(m.user_id)}>移除</button>}
        </div>
      ))}
      <div className="sm-row">
        <span className="sm-lab">加入</span>
        <input type="email" placeholder="對方登入用的 email" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="成員 email" />
        <span className="sm-chips">
          {ROLES.map((r) => <button type="button" key={r} className={role === r ? "sm-on" : ""} onClick={() => setRole(r)}>{ROLE_NAMES[r]}</button>)}
        </span>
        <button type="button" disabled={busy || !email.trim()}
          onClick={() => run(async () => { await api.addMember(brand.id, email.trim(), role); setEmail(""); }, `已加入為${ROLE_NAMES[role]}。`)}>加入</button>
      </div>
      {msg && <span className={msg.error ? "sm-err" : "sm-muted"} role="status">{msg.text}</span>}
      <span className="sm-muted">對方要先有帳號（目前由 AwareWave 開）。</span>
    </div>
  );
}
