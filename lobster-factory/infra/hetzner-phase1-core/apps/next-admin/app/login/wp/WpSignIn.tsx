"use client";

// Exchanges the one-time token in the URL fragment for this door's session. The fragment never reaches a server
// (access logs, Referer) and is cleared before anything else reads the address bar.
// Login fixation (critic 2026-10-25 M): a member could copy their own link and send it to someone else, who would then
// work inside the sender's account. So: an open session on this door is never replaced, the exchange waits for a button
// press, and the account it signed in to is shown with 「不是我的帳號」 before the door opens.
import { useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/ssr";

export function readWpToken(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const token = params.get("token_hash") ?? "";
  return token && params.get("type") === "recovery" ? token : null;
}

/** Where to land after the exchange (the portal launcher's 我的作品): a path on this door only. Anything else is "/". */
export function readWpNext(hash: string): string {
  const next = new URLSearchParams(hash.replace(/^#/, "")).get("next") ?? "";
  return next.startsWith("/") && !next.startsWith("//") && /^\/[a-z0-9\-\/]*$/.test(next) ? next : "/";
}

type State =
  | { kind: "loading" }
  | { kind: "ready"; token: string; next: string }
  | { kind: "signedIn"; email: string; next: string }
  | { kind: "alreadyIn"; email: string; next: string }
  | { kind: "failed" }
  | { kind: "signedOut" };

const box: React.CSSProperties = { background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: 12, padding: "24px 28px", maxWidth: 440, color: "var(--text-primary)", fontSize: 15 };
const btn: React.CSSProperties = { background: "var(--btn-primary-bg)", color: "var(--btn-primary-text)", border: 0, borderRadius: 8, padding: "8px 16px", fontSize: 14, fontWeight: 700, cursor: "pointer", marginRight: 8 };
const ghost: React.CSSProperties = { ...btn, background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--card-border)" };
const note: React.CSSProperties = { margin: "8px 0 16px", color: "var(--text-secondary)", fontSize: 14 };

export function WpSignIn() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // once: React StrictMode runs effects twice in dev
    started.current = true;
    const token = readWpToken(window.location.hash);
    const next = readWpNext(window.location.hash);
    window.history.replaceState(null, "", window.location.pathname);
    createSupabaseBrowserClient().auth.getUser()
      .then(({ data }) => {
        if (data.user) setState({ kind: "alreadyIn", email: data.user.email ?? "", next });
        else setState(token ? { kind: "ready", token, next } : { kind: "failed" });
      })
      .catch(() => setState(token ? { kind: "ready", token, next } : { kind: "failed" }));
  }, []);

  async function enter(token: string, next: string) {
    setBusy(true);
    const { data, error } = await createSupabaseBrowserClient().auth.verifyOtp({ type: "recovery", token_hash: token });
    setBusy(false);
    setState(error || !data.user ? { kind: "failed" } : { kind: "signedIn", email: data.user.email ?? "", next });
  }

  async function notMe() {
    setBusy(true);
    await createSupabaseBrowserClient().auth.signOut().catch(() => undefined);
    setBusy(false);
    setState({ kind: "signedOut" });
  }

  return (
    <div style={box}>
      {state.kind === "loading" ? <p style={{ margin: 0 }}>讀取中…</p> : null}
      {state.kind === "ready" ? (
        <>
          <p style={{ margin: 0, fontWeight: 700 }}>進入這扇門</p>
          <p style={note}>按下「進入」後，會用你的 AwareWave 帳號登入這扇門。</p>
          <button type="button" style={btn} disabled={busy} onClick={() => enter(state.token, state.next)}>{busy ? "登入中…" : "進入"}</button>
        </>
      ) : null}
      {state.kind === "signedIn" ? (
        <>
          <p style={{ margin: 0, fontWeight: 700 }}>已登入：{state.email}</p>
          <p style={note}>這不是你的帳號，請按「不是我的帳號」，不要繼續使用。</p>
          <button type="button" style={btn} onClick={() => window.location.replace(state.next)}>繼續</button>
          <button type="button" style={ghost} disabled={busy} onClick={notMe}>不是我的帳號</button>
        </>
      ) : null}
      {state.kind === "alreadyIn" ? (
        <>
          <p style={{ margin: 0, fontWeight: 700 }}>你已經登入：{state.email}</p>
          <p style={note}>要改用 aware-wave.com 的帳號，請先在這扇門登出，再回 aware-wave.com 按一次「進入」。</p>
          <button type="button" style={btn} onClick={() => window.location.replace(state.next)}>用目前的帳號繼續</button>
        </>
      ) : null}
      {state.kind === "failed" ? (
        <>
          <p style={{ margin: 0, fontWeight: 700 }}>這個登入連結已經失效</p>
          <p style={note}>連結只能用一次。請回到你按「進入」的那一頁（aware-wave.com 的「我的帳號」或「我的產品」）再按一次，或改用 <a href="/login" style={{ color: "var(--accent-text)" }}>這扇門的登入頁</a>。</p>
        </>
      ) : null}
      {state.kind === "signedOut" ? <p style={{ margin: 0 }}>已登出。請用自己的帳號從「我的帳號」、「我的產品」或 <a href="/login" style={{ color: "var(--accent-text)" }}>這扇門的登入頁</a> 登入。</p> : null}
    </div>
  );
}
