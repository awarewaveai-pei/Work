"use client";

// 登入 (B1, 2026-10-11 walk): email and password only -- nobody knows their workspace's system number. When the same
// email has an account in several workspaces, POST /auth/login answers 409 {code: "LOGIN_CHOOSE_WORKSPACE",
// workspaces: [{tenant_id, name}]}; each one is a visible button (no dropdown), and pressing it logs in there.
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../lib/api";
import { type Workspace, workspacesOf } from "../../lib/login";
import { humanError } from "../../lib/errors";
import { strings } from "../../lib/strings";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [choices, setChoices] = useState<Workspace[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function login(tenantId?: string) {
    setBusy(true);
    setError("");
    try {
      await apiFetch("/auth/login", { method: "POST", body: JSON.stringify({ email, password, ...(tenantId ? { tenant_id: tenantId } : {}) }) });
      router.push("/");
    } catch (reason) {
      const offered = workspacesOf(reason);
      setChoices(offered ?? []);
      if (!offered?.length) setError(humanError(reason));
    } finally {
      setBusy(false);
    }
  }
  const submit = (event: FormEvent) => { event.preventDefault(); void login(); };
  return (
    <main className="wrap">
      <div className="card">
        <h1>{strings.appName}</h1>
        <h2>{strings.login}</h2>
        <form onSubmit={submit}>
          <label className="field">信箱<input type="email" autoComplete="email" value={email} onChange={(event) => { setEmail(event.target.value); setChoices([]); }} required /></label>
          <label className="field">密碼<input type="password" autoComplete="current-password" value={password} onChange={(event) => { setPassword(event.target.value); setChoices([]); }} required /></label>
          <div className="btns"><button type="submit" className="btn primary" disabled={busy}>{busy ? "登入中…" : "登入"}</button></div>
        </form>
        {choices.length > 0 && (
          <div className="mt10" role="group" aria-label="選一個工作區登入">
            <p className="mb0">這個信箱在幾個工作區都有帳號，選一個登入：</p>
            <div className="btns mt6">{choices.map((choice) => <button key={choice.tenant_id} type="button" className="btn" disabled={busy} onClick={() => void login(choice.tenant_id)}>{choice.name}</button>)}</div>
          </div>
        )}
        {error && <p className="error" role="alert">{error}</p>}
      </div>
    </main>
  );
}
