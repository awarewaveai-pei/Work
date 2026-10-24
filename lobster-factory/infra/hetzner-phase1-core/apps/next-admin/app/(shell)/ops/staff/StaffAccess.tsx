"use client";
// /ops/staff: one row per staff member -- role buttons, tool checkboxes in three rows, save. Only the owner edits; an
// owner's row is all ticked and locked (lib/accounts/staff-accounts.ts). Buttons and checkboxes, no dropdowns.
import { useEffect, useState } from "react";

type Role = "owner" | "admin" | "operator" | "viewer";
type Group = "product" | "utility" | "back_office";
interface Account { userId: string; email: string; role: Role; tools: string[] | null; verified: boolean; lastSignInAt: string | null }
interface Tool { key: string; name: string; group: Group }

const ROLE_NAMES: Record<Role, string> = { owner: "擁有者", admin: "管理員", operator: "操作", viewer: "唯讀" };
const ROLES = Object.keys(ROLE_NAMES) as Role[];
const GROUP_NAMES: Record<Group, string> = { product: "產品", utility: "工具", back_office: "後台" };
const ERRORS: Record<string, string> = {
  last_owner: "這是最後一位擁有者，不能改成其他角色。請先把另一位員工設為擁有者。",
  owner_tools_locked: "擁有者永遠可以使用全部工具，不能取消。",
  forbidden_role: "只有擁有者能修改員工權限。",
  already_staff: "這個電子郵件已經是員工帳號。",
  email_taken: "這個電子郵件屬於客戶帳號，不能設為員工。",
  invalid_email: "電子郵件格式不正確。",
  mail_not_configured: "伺服器尚未設定寄信功能，沒有寄出邀請。",
  network: "連不上伺服器，沒有儲存。請稍後再試。",
  audit_unavailable: "找不到記錄修改的位置（內部組織），為了留下紀錄，這次沒有儲存。",
};
const errText = (e: string) => ERRORS[e] ?? `儲存失敗（${e}）。`;

const chip = (on: boolean): React.CSSProperties => ({
  padding: "4px 10px", fontSize: 12, borderRadius: 6, cursor: "pointer",
  border: `1px solid ${on ? "var(--accent)" : "var(--card-border)"}`,
  background: on ? "var(--accent)" : "transparent", color: on ? "var(--bg-card)" : "var(--text-secondary)",
});

function Row({ a, tools, canEdit, onSaved }: { a: Account; tools: Tool[]; canEdit: boolean; onSaved: (a: Account) => void }) {
  const isOwner = a.role === "owner";
  const [role, setRole] = useState<Role>(a.role);
  const [ticked, setTicked] = useState<Set<string>>(new Set(a.tools ?? []));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const dirty = role !== a.role || (!isOwner && [...ticked].sort().join() !== [...(a.tools ?? [])].sort().join());

  async function save() {
    setBusy(true);
    setMsg(null);
    const body: Record<string, unknown> = { userId: a.userId };
    if (role !== a.role) body.role = role;
    if (!isOwner) body.tools = [...ticked];
    let json: { ok?: boolean; error?: string; account?: Account } = {};
    try {
      const res = await fetch("/api/ops/staff", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    } catch {
      json = { error: "network" };
    } finally {
      setBusy(false);
    }
    if (!json.ok || !json.account) {
      setRole(a.role);
      return setMsg({ text: errText(json.error ?? "unknown"), error: true });
    }
    onSaved(json.account);
    setTicked(new Set(json.account.tools ?? []));
    setMsg({ text: "已儲存。約 15 秒後生效。" });
  }

  const locked = !canEdit || busy;
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <strong style={{ fontSize: 14 }}>{a.email}</strong>
        {!a.verified && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>（尚未開啟邀請信）</span>}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: "var(--text-muted)", width: 40 }}>角色</span>
        {ROLES.map((r) => (
          <button type="button" key={r} style={chip(role === r)} disabled={locked} onClick={() => setRole(r)}>{ROLE_NAMES[r]}</button>
        ))}
      </div>
      {isOwner ? (
        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>全部工具 ✓（擁有者不能取消）</div>
      ) : (
        <>
          {a.tools === null && (
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>還沒設定過：目前所有工具都能用。儲存後，只能使用打勾的工具。</div>
          )}
          {(Object.keys(GROUP_NAMES) as Group[]).map((g) => (
            <div key={g} style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: "var(--text-muted)", width: 40 }}>{GROUP_NAMES[g]}</span>
              {tools.filter((t) => t.group === g).map((t) => (
                <label key={t.key} style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <input type="checkbox" disabled={locked} checked={ticked.has(t.key)}
                    onChange={(e) => setTicked((prev) => { const n = new Set(prev); if (e.target.checked) n.add(t.key); else n.delete(t.key); return n; })} />
                  {t.name}
                </label>
              ))}
            </div>
          ))}
          {canEdit && (
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <button type="button" className="btn" disabled={locked} onClick={() => setTicked(new Set(tools.map((t) => t.key)))}>全選</button>
              <button type="button" className="btn" disabled={locked} onClick={() => setTicked(new Set())}>全不選</button>
            </div>
          )}
        </>
      )}
      {canEdit && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
          <button type="button" className="btn-primary" disabled={locked || (!dirty && a.tools !== null) || (isOwner && role === a.role)} onClick={save}>
            {busy ? "儲存中…" : "儲存"}
          </button>
          {msg && <span role="status" style={{ fontSize: 12, color: msg.error ? "var(--red)" : "var(--text-secondary)" }}>{msg.text}</span>}
        </div>
      )}
    </div>
  );
}

export function StaffAccess() {
  const [data, setData] = useState<{ staff: Account[]; tools: Tool[]; canEdit: boolean } | { error: string } | null>(null);
  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<{ text: string; error?: boolean } | null>(null);

  async function load() {
    const res = await fetch("/api/ops/staff");
    const json = await res.json().catch(() => ({}));
    setData(json.ok ? json : { error: json.error ?? `HTTP ${res.status}` });
  }
  useEffect(() => { void load(); }, []);

  async function invite() {
    setInviting(true);
    setInviteMsg(null);
    let json: { ok?: boolean; error?: string; created?: boolean } = {};
    try {
      const res = await fetch("/api/ops/staff", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    } catch {
      json = { error: "network" };
    } finally {
      setInviting(false);
    }
    if (!json.ok) return setInviteMsg({ text: errText(json.error ?? "unknown"), error: true });
    setInviteMsg({ text: json.created ? `已建立帳號，邀請信已寄到 ${email}。新員工預設唯讀、沒有工具。` : `已重新寄送邀請信到 ${email}。` });
    setEmail("");
    void load();
  }

  if (data === null) return <p style={{ fontSize: 13, color: "var(--text-muted)" }}>載入中…</p>;
  if ("error" in data) return <p style={{ fontSize: 13, color: "var(--red)" }}>{errText(data.error)}</p>;
  return (
    <>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7, marginTop: 0 }}>
        替每位員工選角色、勾選能用的工具。沒勾的工具不會出現在側欄。{data.canEdit ? "" : "只有擁有者能修改；你目前只能查看。"}
      </p>
      {data.canEdit && (
        <div className="card" style={{ marginBottom: 16, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>新增員工</span>
          <input className="form-input" style={{ maxWidth: 280 }} type="email" placeholder="請輸入電子郵件" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button type="button" className="btn-primary" disabled={inviting || !email.trim()} onClick={invite}>{inviting ? "寄送中…" : "建立帳號並寄送邀請"}</button>
          {inviteMsg && <span role="status" style={{ fontSize: 12, color: inviteMsg.error ? "var(--red)" : "var(--text-secondary)" }}>{inviteMsg.text}</span>}
        </div>
      )}
      {data.staff.map((a) => (
        <Row key={`${a.userId}-${a.role}`} a={a} tools={data.tools} canEdit={data.canEdit}
          onSaved={(next) => setData((d) => (d && "staff" in d ? { ...d, staff: d.staff.map((x) => (x.userId === next.userId ? next : x)) } : d))} />
      ))}
    </>
  );
}
