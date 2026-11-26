"use client";
// 成員授權 view. The manager (holder of the unit's member link, ADR 021 D5) lists the unit's accounts and invites, resends
// to and removes them. An authorized person gets the page with an explanation and nothing else: the list and the
// controls are not rendered for them at all (the API answers role "member" without data, and refuses every action).
import { useCallback, useEffect, useState } from "react";

type Person = { userId: string; email: string; verified: boolean; lastSignInAt: string | null; self: boolean };
type Product = { key: string; name: string };
type People = { ok: true; role: "manager"; accounts: Person[]; products: Product[] } | { ok: true; role: "member" };

const ERRORS: Record<string, string> = {
  invalid_email: "請輸入正確的 email。",
  email_taken: "這個 email 已經是別的單位或 AwareWave 的帳號，無法加入。",
  product_not_held: "請先選一個產品。",
  cannot_delete_self: "不能刪除你自己的帳號。",
  still_member: "這個人在社群發文還有品牌角色，請先到「社群發文 → 設定 → 成員」移除。",
  account_not_found: "找不到這個帳號，請重新整理。",
  mail_not_configured: "目前無法寄信，請稍後再試。",
  not_manager: "只有單位的管理者可以授權他人。",
};
const errorText = (code: string | undefined) => (code && ERRORS[code]) || "操作失敗，請稍後再試一次。";
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei" }) : "尚未登入");

const th: React.CSSProperties = { textAlign: "left", padding: "6px 10px", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", borderBottom: "1px solid var(--border-subtle)", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "6px 10px", fontSize: 12.5, color: "var(--text-primary)", borderBottom: "1px solid var(--border-subtle)" };

export function PeopleView() {
  const [people, setPeople] = useState<People | null>(null);
  const [failed, setFailed] = useState(false);
  const [email, setEmail] = useState("");
  const [product, setProduct] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch("/portal/api/people", { cache: "no-store" });
      const body = (await res.json()) as People | { ok: false };
      if (!res.ok || !body.ok) throw new Error("people");
      setPeople(body);
      if (body.role === "manager" && body.products.length === 1) setProduct(body.products[0].key);
    } catch {
      setPeople(null);
      setFailed(true);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const send = async (to: string) => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/portal/api/people", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: to, product }),
      });
      const body = (await res.json()) as { ok: boolean; error?: string };
      setNotice(body.ok ? { ok: true, text: `已寄出設定密碼的連結給 ${to}。` } : { ok: false, text: errorText(body.error) });
      if (body.ok) { setEmail(""); await load(); }
    } catch {
      setNotice({ ok: false, text: errorText(undefined) });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (p: Person) => {
    if (!window.confirm(`刪除 ${p.email} 的帳號？對方將無法再登入。`)) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/portal/api/people?userId=${encodeURIComponent(p.userId)}`, { method: "DELETE" });
      const body = (await res.json()) as { ok: boolean; error?: string };
      setNotice(body.ok ? { ok: true, text: `已刪除 ${p.email}。` } : { ok: false, text: errorText(body.error) });
      if (body.ok) await load();
    } catch {
      setNotice({ ok: false, text: errorText(undefined) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 16px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 16 }}>成員授權</h1>
      {failed && (
        <div role="alert">
          <p style={{ fontSize: 13.5, color: "var(--badge-red-text)", marginBottom: 12 }}>讀取失敗，請重新整理再試一次。</p>
          <button type="button" className="btn-primary" onClick={() => void load()}>重新整理</button>
        </div>
      )}
      {!failed && !people && <p style={{ fontSize: 13.5, color: "var(--text-muted)" }}>讀取中…</p>}
      {people?.role === "member" && (
        <div className="card" style={{ padding: 20 }}>
          <p style={{ fontSize: 13.5 }}>成員由單位的管理者授權。需要新增或移除同事，請找你們單位的管理者。</p>
        </div>
      )}
      {people?.role === "manager" && (
        <>
          <div className="card" style={{ padding: 20, marginBottom: 16 }}>
            <p style={{ fontSize: 13.5, marginBottom: 12 }}>邀請同事使用你們單位的產品。對方會收到設定密碼的信，設定後就能登入。</p>
            {people.products.length === 0 ? (
              <p style={{ fontSize: 13.5, color: "var(--text-muted)" }}>你們單位目前沒有可以邀請同事使用的產品。</p>
            ) : (
              <>
                <div role="group" aria-label="登入的產品" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                  {people.products.map((p) => (
                    <button key={p.key} type="button" aria-pressed={product === p.key} className={product === p.key ? "btn-primary" : "btn-secondary"}
                      disabled={busy} onClick={() => setProduct(p.key)}>{p.name}</button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <input type="email" className="form-input" style={{ maxWidth: 320, flex: "1 1 220px" }} placeholder="同事的 email" aria-label="同事的 email"
                    value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} />
                  <button type="button" className="btn-primary" disabled={busy || !email.trim() || !product}
                    onClick={() => void send(email.trim().toLowerCase())}>邀請</button>
                </div>
              </>
            )}
          </div>
          {notice && <p role="status" style={{ fontSize: 13.5, marginBottom: 12, color: notice.ok ? "var(--badge-green-text)" : "var(--badge-red-text)" }}>{notice.text}</p>}
          <div className="card" style={{ padding: 0, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={th}>email</th><th style={th}>狀態</th><th style={th}>上次登入</th><th style={th}>動作</th></tr></thead>
              <tbody>
                {people.accounts.map((p) => (
                  <tr key={p.userId}>
                    <td style={td}>{p.email}{p.self ? "（你）" : ""}</td>
                    <td style={td}>{p.verified ? "已啟用" : "等對方設定密碼"}</td>
                    <td style={td}>{day(p.lastSignInAt)}</td>
                    <td style={td}>
                      {!p.self && (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button type="button" className="btn-secondary" disabled={busy || !product} onClick={() => void send(p.email)}>重寄</button>
                          <button type="button" className="btn-secondary" disabled={busy} onClick={() => void remove(p)}>刪除</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
