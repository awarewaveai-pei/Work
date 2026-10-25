"use client";

// 帳號 tab: the client's own people. Staff create an account by email; the person proves the email by opening the
// mailed link (/login/set-password) before 社群發文 → 設定 → 成員 can add them (0103). API: /api/ops/clients/[slug]/accounts.
// Products = what this client holds; each row shows the person's role per product, read from that product's own list.
import { useCallback, useEffect, useState } from "react";
import { roleHeader } from "@/lib/ops-role";
import { ACCOUNT_COPY as C } from "@/lib/accounts/invite-copy";
import { Card, ChipBtn, NoData, SubLabel, relativeTime } from "./hub-ui";

type Account = { userId: string; email: string; verified: boolean; createdAt: string | null; lastSignInAt: string | null; roles: Record<string, string | null> };
/** settings: where staff change a person's role on this product; null = the product keeps no per-person role. */
type Product = { key: string; name: string; settings: string | null };
type Notice = { tone: "ok" | "error"; text: string };

const ERRORS: Record<string, string> = {
  email_taken: C.err_email_taken,
  invalid_email: C.err_invalid_email,
  mail_not_configured: C.err_mail_not_configured,
  forbidden_role: C.err_forbidden,
  product_not_held: C.err_product_not_held,
};
function errorText(code: string | undefined, ctx: { email?: string; created?: boolean } = {}): string {
  if (code === "mail_not_configured" && !ctx.created) return C.err_mail_not_configured_existing;
  if (code === "still_member") return C.err_still_member.replace("{email}", ctx.email ?? "");
  return (code && ERRORS[code]) || (code?.startsWith("mail_") ? C.err_mail_failed : C.err_generic);
}

export function AccountsCard({ slug }: { slug: string }) {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [products, setProducts] = useState<Product[] | null>(null); // null = not loaded (or the load failed)
  const [product, setProduct] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const url = `/api/ops/clients/${encodeURIComponent(slug)}/accounts`;

  const load = useCallback(async () => {
    try {
      const res = await fetch(url, { headers: { ...roleHeader("admin") } });
      const data = (await res.json()) as { ok?: boolean; error?: string; accounts?: Account[]; products?: Product[] };
      if (!res.ok || !data.ok) {
        setAccounts([]);
        setProducts(null);
        return setNotice({ tone: "error", text: errorText(data.error) });
      }
      setAccounts(data.accounts ?? []);
      setProducts(data.products ?? []);
      setProduct((p) => (data.products?.some((x) => x.key === p) ? p : data.products?.[0]?.key ?? ""));
    } catch {
      setAccounts([]);
      setProducts(null);
      setNotice({ tone: "error", text: C.err_generic });
    }
  }, [url]);
  const offered = products ?? [];

  useEffect(() => {
    void load();
  }, [load]);

  async function send(target: string) {
    setBusy(target);
    setNotice(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...roleHeader("admin") },
        body: JSON.stringify({ email: target, product }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; kind?: string; created?: boolean };
      if (!res.ok || !data.ok) {
        setNotice({ tone: "error", text: errorText(data.error, { created: data.created }) });
      } else {
        const tpl = data.kind === "recovery" ? C.sent_recovery : data.created ? C.sent_new : C.sent_resend;
        setNotice({ tone: "ok", text: `${tpl.replace("{email}", target)}${data.created ? C.sent_next : C.newest_only}` });
        if (target === email.trim().toLowerCase()) setEmail("");
      }
    } catch {
      setNotice({ tone: "error", text: C.err_generic });
    } finally {
      setBusy(null);
      void load();
    }
  }

  async function remove(a: Account) {
    if (!window.confirm(C.delete_confirm.replace("{email}", a.email))) return;
    setBusy(`del:${a.userId}`);
    setNotice(null);
    try {
      const res = await fetch(`${url}?userId=${encodeURIComponent(a.userId)}`, { method: "DELETE", headers: { ...roleHeader("admin") } });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      setNotice(
        res.ok && data.ok
          ? { tone: "ok", text: C.deleted.replace("{email}", a.email) }
          : { tone: "error", text: errorText(data.error, { email: a.email }) },
      );
    } catch {
      setNotice({ tone: "error", text: C.err_generic });
    } finally {
      setBusy(null);
      void load();
    }
  }

  const btn = (disabled: boolean) => ({
    padding: "6px 14px", borderRadius: 6, border: "none", fontSize: 12, fontWeight: 600,
    cursor: disabled ? "default" : "pointer",
    background: disabled ? "var(--card-border)" : "var(--accent)", color: "var(--btn-primary-text)",
    opacity: disabled ? 0.7 : 1,
  });
  const smallBtn = {
    padding: "2px 10px", borderRadius: 20, fontSize: 11, cursor: "pointer",
    border: "1px solid var(--card-border)", background: "transparent", color: "var(--text-secondary)",
  };

  return (
    <Card title={C.card_title}>
      <NoData>{C.card_intro}</NoData>

      <SubLabel>{C.steps_title}</SubLabel>
      <ol style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.8 }}>
        {[...C.steps, ...(offered.some((p) => p.settings) ? [C.step_roles] : [])].map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>

      <SubLabel>{C.product_label}</SubLabel>
      {products?.length === 0 ? (
        <NoData>{C.no_products}</NoData>
      ) : (
        <>
          <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 6 }}>{C.product_hint}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {offered.map((p) => (
              <ChipBtn key={p.key} label={p.name} active={product === p.key} onClick={() => setProduct(p.key)} />
            ))}
          </div>
        </>
      )}

      <SubLabel>{C.email_label}</SubLabel>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="email"
          className="form-input"
          style={{ maxWidth: 320 }}
          placeholder={C.email_placeholder}
          aria-label={C.email_label}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy !== null}
        />
        <button
          type="button"
          style={btn(busy !== null || !email.trim() || !product)}
          disabled={busy !== null || !email.trim() || !product}
          onClick={() => send(email.trim().toLowerCase())}
        >
          {busy === email.trim().toLowerCase() ? C.sending : C.send_button}
        </button>
      </div>

      {notice && (
        <div style={{ fontSize: 12, marginTop: 10, color: notice.tone === "ok" ? "var(--green)" : "var(--red)" }}>{notice.text}</div>
      )}

      <SubLabel>{C.list_title}</SubLabel>
      <div style={{ fontSize: 11.5, color: "var(--text-muted)", lineHeight: 1.7, marginBottom: 8 }}>
        <div>{C.status_pending}：{C.status_pending_hint}</div>
        <div>{C.status_verified}：{C.status_verified_hint}</div>
      </div>
      {accounts === null ? (
        <NoData>…</NoData>
      ) : accounts.length === 0 ? (
        <NoData>{C.list_empty}</NoData>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {accounts.map((a) => (
            <div key={a.userId}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, flexWrap: "wrap" }}>
                <span style={{ color: "var(--text-primary)", minWidth: 220 }}>{a.email}</span>
                <span
                  style={{
                    fontSize: 11, padding: "1px 8px", borderRadius: 20,
                    background: a.verified ? "var(--badge-green-bg)" : "var(--bg-canvas)",
                    color: a.verified ? "var(--badge-green-text)" : "var(--severity-medium)",
                    border: `1px solid ${a.verified ? "var(--green)" : "var(--severity-medium)"}`,
                  }}
                >
                  {a.verified ? C.status_verified : C.status_pending}
                </span>
                <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{relativeTime(a.lastSignInAt ?? a.createdAt)}</span>
                <button type="button" style={smallBtn} disabled={busy !== null || !product} onClick={() => send(a.email)}>
                  {busy === a.email ? C.sending : a.verified ? C.reset_button : C.resend_button}
                </button>
                <button type="button" style={{ ...smallBtn, color: "var(--red)" }} disabled={busy !== null} onClick={() => remove(a)}>
                  {C.delete_button}
                </button>
              </div>
              {offered.length > 0 && (
                <div style={{ display: "flex", gap: "2px 16px", flexWrap: "wrap", fontSize: 11.5, color: "var(--text-secondary)", marginTop: 4 }}>
                  {offered.map((p) => (
                    <span key={p.key}>
                      {p.name}：{p.settings ? a.roles[p.key] ?? C.role_none : C.role_open}
                      {p.settings && (
                        <a href={p.settings} style={{ marginLeft: 6, color: "var(--accent-text)" }}>{C.role_edit}</a>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
