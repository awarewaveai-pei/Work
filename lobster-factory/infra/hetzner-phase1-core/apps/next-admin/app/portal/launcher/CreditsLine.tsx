"use client";
// One line: points balance (+ earliest end date) from GET /portal/api/account. A manager gets a link to the wallet page
// (U10, /portal/wallet); an authorized member sees balance and date only, no top-up button (blueprint §7.3).
import { useEffect, useState } from "react";

interface Account { ok: true; role: "manager" | "member"; balance: number; frozen: boolean; next_period_end: string | null }

export function CreditsLine() {
  const [state, setState] = useState<Account | "loading" | "failed">("loading");
  useEffect(() => {
    let alive = true;
    fetch("/portal/api/account", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((a: Account) => { if (alive) setState(a); })
      .catch(() => { if (alive) setState("failed"); });
    return () => { alive = false; };
  }, []);

  const wrap = { fontSize: 13.5, color: "var(--text-muted)", margin: "0 0 20px", display: "flex", gap: 12, flexWrap: "wrap" as const, alignItems: "center" };
  if (state === "loading") return <p style={wrap} aria-busy="true">點數讀取中…</p>;
  if (state === "failed") return <p style={wrap}>暫時讀不到點數。</p>;
  const end = state.next_period_end?.slice(0, 10);
  return (
    <p style={wrap} data-credits>
      <span>點數 <strong style={{ color: "var(--text-primary)" }}>{state.balance}</strong></span>
      {end && <span>合約到 {end}</span>}
      {state.role === "manager" && <a href="/portal/wallet" className="btn-secondary">點數與合約</a>}
    </p>
  );
}
