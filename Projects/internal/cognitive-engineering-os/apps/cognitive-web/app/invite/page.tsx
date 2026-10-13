"use client";

// 邀請連結 (GroupsPage makes `/invite#<token>`): the engine's POST /invites/accept joins a signed-in person, or makes a
// visitor's account in the invitation's workspace (ai_lego/apps/api/blocks/groups.py). This page was missing until
// 2026-10-13, so a link sent the visitor to the login page with nowhere to make an account. The token stays in the
// URL fragment: it never reaches a server log. Open without a session (middleware.ts).
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { inviteToken, joinAsMember, joinAsNew, type Joined } from "../../lib/invite";
import { humanError } from "../../lib/errors";
import { type Workspace, workspacesOf } from "../../lib/login";
import { strings } from "../../lib/strings";

export default function InvitePage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [oldEmail, setOldEmail] = useState("");
  const [oldPassword, setOldPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [held, setHeld] = useState(false);
  const [choices, setChoices] = useState<Workspace[]>([]);

  useEffect(() => { setToken(inviteToken(window.location.hash)); }, []);

  async function go(join: () => Promise<Joined>) {
    setBusy(true);
    setError("");
    try {
      const joined = await join();
      if (joined.review_state === "pending_review") setHeld(true);
      else router.push(`/groups/${encodeURIComponent(joined.group_id)}`);
    } catch (reason) {
      const offered = workspacesOf(reason);   // the address has several workspaces: the person picks one, the invitation is untouched
      setChoices(offered ?? []);
      if (!offered?.length) setError(humanError(reason));
    } finally {
      setBusy(false);
    }
  }
  const submitNew = (event: FormEvent) => { event.preventDefault(); if (token) void go(() => joinAsNew(token, name.trim(), email.trim(), password)); };
  const asMember = (tenantId?: string) => { if (token) void go(() => joinAsMember(token, oldEmail.trim(), oldPassword, tenantId)); };
  const submitOld = (event: FormEvent) => { event.preventDefault(); asMember(); };

  return (
    <main className="wrap">
      <div className="card">
        <h1>{strings.appName}</h1>
        <h2>有人邀請你加入一個群組</h2>
        {token === "" && <p className="error" role="alert">這個連結少了邀請碼。請邀請你的人再傳一次完整的連結。</p>}
        {held && (
          <div role="status">
            <p>你已經加入了。這個群組最近加入的人比較多，召集人確認之後，你就會看到群組裡的內容。</p>
            <div className="btns"><button type="button" className="btn primary" onClick={() => router.push("/groups")}>到我的群組</button></div>
          </div>
        )}
        {token && !held && (
          <>
            <form onSubmit={submitNew} aria-label="第一次來">
              <h3>第一次來：建立帳號並加入</h3>
              <label className="field">你的名字（群組裡的人會看到）<input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} /></label>
              <label className="field">信箱<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
              <label className="field">密碼（至少 12 個字）<input type="password" autoComplete="new-password" minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
              <div className="btns"><button type="submit" className="btn primary" disabled={busy}>{busy ? "建立中…" : "建立帳號並加入"}</button></div>
            </form>
            <form onSubmit={submitOld} aria-label="已經有帳號" className="mt10">
              <h3>已經有帳號：登入並加入</h3>
              <label className="field">信箱<input type="email" autoComplete="email" value={oldEmail} onChange={(event) => { setOldEmail(event.target.value); setChoices([]); }} required /></label>
              <label className="field">密碼<input type="password" autoComplete="current-password" value={oldPassword} onChange={(event) => { setOldPassword(event.target.value); setChoices([]); }} required /></label>
              <div className="btns"><button type="submit" className="btn" disabled={busy}>{busy ? "登入中…" : "登入並加入"}</button></div>
              {choices.length > 0 && (
                <div className="mt10" role="group" aria-label="選一個工作區登入">
                  <p className="mb0">這個信箱在幾個工作區都有帳號，選邀請你的那一個：</p>
                  <div className="btns mt6">{choices.map((choice) => <button key={choice.tenant_id} type="button" className="btn" disabled={busy} onClick={() => asMember(choice.tenant_id)}>{choice.name}</button>)}</div>
                </div>
              )}
            </form>
          </>
        )}
        {error && <p className="error" role="alert">{error}</p>}
      </div>
    </main>
  );
}
