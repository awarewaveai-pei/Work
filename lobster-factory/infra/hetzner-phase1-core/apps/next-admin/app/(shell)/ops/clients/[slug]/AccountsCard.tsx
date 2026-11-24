"use client";

// 帳號 tab: the client's own people. Staff create an account by email; the person proves the email by opening the
// mailed link (/login/set-password) before 社群發文 → 設定 → 成員 can add them (0103). API: /api/ops/clients/[slug]/accounts.
// Products = what this client holds; each row shows the person's role per product, read from that product's own list.
// aware-wave.com 會員 (ADR 021 D4, migration 0180): staff invite this account's contact to become its member; the link is
// made only after the person proves the email on aware-wave.com. The one-time code is shown once, right after issuing.
// 轉移給別人 (ADR 021 D5, migration 0182; API ./member-transfer): on a linked account staff hand the membership (= the
// manager) to another person the same way -- the swap happens only when that person proves the email; until then the
// current manager stays.
import { useCallback, useEffect, useState } from "react";
import { roleHeader } from "@/lib/ops-role";
import { ACCOUNT_COPY as C } from "@/lib/accounts/invite-copy";
import { Card, ChipBtn, NoData, SubLabel, Tag, relativeTime } from "./hub-ui";

type Account = { userId: string; email: string; verified: boolean; createdAt: string | null; lastSignInAt: string | null; roles: Record<string, string | null> };
/** settings: where staff change a person's role on this product; null = the product keeps no per-person role. */
type Product = { key: string; name: string; settings: string | null };
type Notice = { tone: "ok" | "error"; text: string };
/** null = could not be read; invite = the live one (expired until staff reissue). */
type Member = { eligible: boolean; linked: boolean; invite: { email: string; createdAt: string; expiresAt: string; status: "pending" | "expired" } | null } | null;

/** GET /member-transfer; null = not loaded or could not be read. */
type Transfer = {
  manager: { userId: string; email: string | null } | null;
  transfer: { email: string; reason: string; expiresAt: string; status: "pending" | "expired" } | null;
} | null;

const M = {
  title: "aware-wave.com 會員",
  intro: "請這個單位的聯絡人用自己的 email 在 aware-wave.com 驗證，驗證後這個單位就連上會員。不會自動寄信。",
  linked_tag: "已連上",
  linked: "這個單位已是 aware-wave.com 會員。",
  not_eligible: "這個單位不能成為會員（子品牌或內部單位跟著上層單位）。",
  unknown: "目前讀不到會員狀態。",
  pending: "待驗證",
  expired: "已過期",
  invited: "已邀請 {email}，{date} 前有效。",
  invited_expired: "邀請 {email} 已在 {date} 過期。",
  email_label: "聯絡人 email",
  start: "發起邀請",
  reissue: "作廢重發",
  void: "作廢",
  void_confirm: "作廢給 {email} 的邀請？對方手上的碼會失效。",
  issued: "邀請碼（只顯示這一次，請交給聯絡人）：",
  voided: "邀請已作廢。",
  manager: "目前管理者：{email}",
  transfer_open: "轉移給別人",
  transfer_intro: "換成另一個人管理這個單位的會員（例如聯絡人離職）。新的人在 aware-wave.com 驗證 email 後才會換；在那之前仍由目前管理者管理。權利、合約與點數都跟著單位，不會變。",
  transfer_email: "新聯絡人 email",
  transfer_reason: "原因",
  transfer_reason_placeholder: "例如：聯絡人離職",
  transfer_start: "發起轉移",
  cancel: "取消",
  transfer_pending: "轉移待驗證",
  transfer_expired: "轉移已過期",
  transfer_text: "轉移給 {email}，{date} 前有效；驗證前仍由目前管理者管理。原因：{reason}",
  transfer_text_expired: "轉移給 {email} 已在 {date} 過期。原因：{reason}",
  transfer_void_confirm: "作廢轉移給 {email}？對方手上的碼會失效，目前管理者不變。",
  transfer_voided: "轉移已作廢。",
  transfer_issued: "轉移碼（只顯示這一次，請交給新聯絡人）：",
  link_label: "或直接把這個連結交給對方（開啟後在網站上驗證 email）：",
  copy: "複製連結",
  copied: "已複製",
} as const;
const MEMBER_ERRORS: Record<string, string> = {
  member_linked: "這個單位已連上會員，不能再發起。",
  not_a_customer_account: "這個單位不能成為會員。",
  invite_busy: "剛好有人同時發起，請再按一次。",
  not_linked: "這個單位還沒連上會員，請改用「發起邀請」。",
  same_member: "這個 email 就是目前的管理者。",
  invalid_reason: "請填原因（500 字以內）。",
  invalid_email: C.err_invalid_email,
  forbidden_role: C.err_forbidden,
};
const day = (iso: string) => new Date(iso).toLocaleDateString("zh-TW");

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
  const [member, setMember] = useState<Member>(null);
  const [memberEmail, setMemberEmail] = useState("");
  /** the one-time code and its landing link (null when the API could not build one) */
  const [issued, setIssued] = useState<{ code: string; url: string | null } | null>(null);
  const [transfer, setTransfer] = useState<Transfer>(null);
  const [copied, setCopied] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferEmail, setTransferEmail] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const url =`/api/ops/clients/${encodeURIComponent(slug)}/accounts`;
  const transferUrl = `/api/ops/clients/${encodeURIComponent(slug)}/member-transfer`;

  const load = useCallback(async () => {
    try {
      const res = await fetch(url, { headers: { ...roleHeader("admin") } });
      const data = (await res.json()) as { ok?: boolean; error?: string; accounts?: Account[]; products?: Product[]; member?: Member };
      if (!res.ok || !data.ok) {
        setAccounts([]);
        setProducts(null);
        setMember(null);
        return setNotice({ tone: "error", text: errorText(data.error) });
      }
      setMember(data.member ?? null);
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

  const loadTransfer = useCallback(async () => {
    try {
      const res = await fetch(transferUrl, { headers: { ...roleHeader("admin") } });
      const data = (await res.json()) as { ok?: boolean; manager?: NonNullable<Transfer>["manager"]; transfer?: NonNullable<Transfer>["transfer"] };
      setTransfer(res.ok && data.ok ? { manager: data.manager ?? null, transfer: data.transfer ?? null } : null);
    } catch {
      setTransfer(null);
    }
  }, [transferUrl]);
  const linked = member?.linked === true;
  useEffect(() => {
    if (linked) void loadTransfer();
    else setTransfer(null);
  }, [linked, loadTransfer]);

  async function copyLink(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);   // the link stays selectable (userSelect all)
    }
  }

  async function startTransfer() {
    setBusy("transfer");
    setNotice(null);
    setIssued(null);
    try {
      const res = await fetch(transferUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...roleHeader("admin") },
        body: JSON.stringify({ email: transferEmail.trim().toLowerCase(), reason: transferReason.trim() }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; code?: string; url?: string | null };
      if (!res.ok || !data.ok || !data.code) {
        setNotice({ tone: "error", text: (data.error && MEMBER_ERRORS[data.error]) || C.err_generic });
      } else {
        setIssued({ code: data.code, url: data.url ?? null });
        setTransferOpen(false);
        setTransferEmail("");
        setTransferReason("");
      }
    } catch {
      setNotice({ tone: "error", text: C.err_generic });
    } finally {
      setBusy(null);
      void loadTransfer();
    }
  }

  async function voidTransfer(email: string) {
    if (!window.confirm(M.transfer_void_confirm.replace("{email}", email))) return;
    setBusy("transfer");
    setNotice(null);
    setIssued(null);
    try {
      const res = await fetch(transferUrl, { method: "DELETE", headers: { ...roleHeader("admin") } });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      setNotice(res.ok && data.ok
        ? { tone: "ok", text: M.transfer_voided }
        : { tone: "error", text: (data.error && MEMBER_ERRORS[data.error]) || C.err_generic });
    } catch {
      setNotice({ tone: "error", text: C.err_generic });
    } finally {
      setBusy(null);
      void loadTransfer();
    }
  }

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

  async function invite(target: string) {
    setBusy("member");
    setNotice(null);
    setIssued(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...roleHeader("admin") },
        body: JSON.stringify({ action: "member_invite", email: target }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; code?: string; url?: string | null };
      if (!res.ok || !data.ok || !data.code) {
        setNotice({ tone: "error", text: (data.error && MEMBER_ERRORS[data.error]) || C.err_generic });
      } else {
        setIssued({ code: data.code, url: data.url ?? null });
        setMemberEmail("");
      }
    } catch {
      setNotice({ tone: "error", text: C.err_generic });
    } finally {
      setBusy(null);
      void load();
    }
  }

  async function voidInvite(email: string) {
    if (!window.confirm(M.void_confirm.replace("{email}", email))) return;
    setBusy("member");
    setNotice(null);
    setIssued(null);
    try {
      const res = await fetch(`${url}?memberInvite=1`, { method: "DELETE", headers: { ...roleHeader("admin") } });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      setNotice(res.ok && data.ok
        ? { tone: "ok", text: M.voided }
        : { tone: "error", text: (data.error && MEMBER_ERRORS[data.error]) || C.err_generic });
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
  const codeBox = {
    display: "block", marginTop: 4, padding: "6px 10px", borderRadius: 6, wordBreak: "break-all", userSelect: "all",
    border: "1px solid var(--card-border)", background: "var(--bg-canvas)", color: "var(--text-primary)",
  } as const;
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

      <SubLabel>{M.title}</SubLabel>
      <NoData>{M.intro}</NoData>
      <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.7 }}>
        {member === null ? (
          <NoData>{M.unknown}</NoData>
        ) : member.linked ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Tag tone="green" dot>{M.linked_tag}</Tag>
              <span>{M.linked}</span>
              {transfer?.manager?.email && <span>{M.manager.replace("{email}", transfer.manager.email)}</span>}
            </div>
            {transfer?.transfer ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <Tag tone={transfer.transfer.status === "expired" ? "gray" : "yellow"} dot>
                  {transfer.transfer.status === "expired" ? M.transfer_expired : M.transfer_pending}
                </Tag>
                <span>
                  {(transfer.transfer.status === "expired" ? M.transfer_text_expired : M.transfer_text)
                    .replace("{email}", transfer.transfer.email)
                    .replace("{date}", day(transfer.transfer.expiresAt))
                    .replace("{reason}", transfer.transfer.reason)}
                </span>
                <button type="button" style={{ ...smallBtn, color: "var(--red)" }} disabled={busy !== null} onClick={() => voidTransfer(transfer.transfer!.email)}>
                  {M.void}
                </button>
              </div>
            ) : transferOpen ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <NoData>{M.transfer_intro}</NoData>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    type="email"
                    className="form-input"
                    style={{ maxWidth: 320 }}
                    placeholder={C.email_placeholder}
                    aria-label={M.transfer_email}
                    value={transferEmail}
                    onChange={(e) => setTransferEmail(e.target.value)}
                    disabled={busy !== null}
                  />
                  <input
                    type="text"
                    className="form-input"
                    style={{ maxWidth: 320 }}
                    maxLength={500}
                    placeholder={M.transfer_reason_placeholder}
                    aria-label={M.transfer_reason}
                    value={transferReason}
                    onChange={(e) => setTransferReason(e.target.value)}
                    disabled={busy !== null}
                  />
                  <button
                    type="button"
                    style={btn(busy !== null || !transferEmail.trim() || !transferReason.trim())}
                    disabled={busy !== null || !transferEmail.trim() || !transferReason.trim()}
                    onClick={() => startTransfer()}
                  >
                    {busy === "transfer" ? C.sending : M.transfer_start}
                  </button>
                  <button type="button" style={smallBtn} disabled={busy !== null} onClick={() => setTransferOpen(false)}>
                    {M.cancel}
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <button type="button" style={smallBtn} disabled={busy !== null || transfer === null} onClick={() => setTransferOpen(true)}>
                  {M.transfer_open}
                </button>
              </div>
            )}
          </div>
        ) : !member.eligible ? (
          <NoData>{M.not_eligible}</NoData>
        ) : member.invite ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Tag tone={member.invite.status === "expired" ? "gray" : "yellow"} dot>
              {member.invite.status === "expired" ? M.expired : M.pending}
            </Tag>
            <span>
              {(member.invite.status === "expired" ? M.invited_expired : M.invited)
                .replace("{email}", member.invite.email)
                .replace("{date}", day(member.invite.expiresAt))}
            </span>
            <button type="button" style={smallBtn} disabled={busy !== null} onClick={() => invite(member.invite!.email)}>
              {busy === "member" ? C.sending : M.reissue}
            </button>
            <button type="button" style={{ ...smallBtn, color: "var(--red)" }} disabled={busy !== null} onClick={() => voidInvite(member.invite!.email)}>
              {M.void}
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              type="email"
              className="form-input"
              style={{ maxWidth: 320 }}
              placeholder={C.email_placeholder}
              aria-label={M.email_label}
              value={memberEmail}
              onChange={(e) => setMemberEmail(e.target.value)}
              disabled={busy !== null}
            />
            <button
              type="button"
              style={btn(busy !== null || !memberEmail.trim())}
              disabled={busy !== null || !memberEmail.trim()}
              onClick={() => invite(memberEmail.trim().toLowerCase())}
            >
              {busy === "member" ? C.sending : M.start}
            </button>
          </div>
        )}
        {issued && (
          <div style={{ marginTop: 8 }}>
            {member?.linked ? M.transfer_issued : M.issued}
            <code style={codeBox}>{issued.code}</code>
            {issued.url && (
              <div style={{ marginTop: 8 }}>
                {M.link_label}
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
                  <code style={{ ...codeBox, marginTop: 0, flex: 1, minWidth: 0 }}>{issued.url}</code>
                  <button type="button" style={smallBtn} onClick={() => copyLink(issued.url!)}>
                    {copied ? M.copied : M.copy}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

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
