"use client";

// The new-site form: visible buttons and checkboxes only (no dropdowns). One POST /api/ops/site-flow; the form mints
// the idempotency key once, so a second press or a retry after a timeout returns the same site.
import Link from "next/link";
import { useRef, useState } from "react";
import {
  LOCALES, PLUGIN_PACKS, createErrorText, hostSlugOf, keptKeysText, normalizeDomain,
  type Locale, type PackKey,
} from "@/lib/site-flow/page-model";

const FIELD: React.CSSProperties = { marginBottom: 22 };
const LABEL: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 };

function Choice({ on, onClick, label, note }: { on: boolean; onClick: () => void; label: string; note?: string }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={on ? "btn btn-primary" : "btn btn-ghost"} style={{ flexDirection: "column", alignItems: "flex-start", textAlign: "left", gap: 2, whiteSpace: "normal" }}>
      <span>{label}</span>
      {note && <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.8 }}>{note}</span>}
    </button>
  );
}

interface Created { flowUrl: string; keptKeys: string[]; orgCreated: boolean; orgName: string }

export function NewSiteForm() {
  const [name, setName] = useState("");
  const [domainRaw, setDomainRaw] = useState("");
  const [locale, setLocale] = useState<Locale>("zh-TW");
  const [packs, setPacks] = useState<PackKey[]>(["base"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const siteIdRef = useRef<string | null>(null);
  const keyDomainRef = useRef<string | null>(null);

  const domain = normalizeDomain(domainRaw);
  const slug = domain ? hostSlugOf(domain) : null;
  const canSubmit = !!name.trim() && !!domain && !!slug && !busy;

  const togglePack = (p: PackKey) => setPacks((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));

  async function submit() {
    if (!canSubmit || !domain) return;
    // a changed domain is a different site: it gets its own key
    if (keyDomainRef.current !== domain) { siteIdRef.current = null; keyDomainRef.current = domain; }
    siteIdRef.current ??= crypto.randomUUID();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/ops/site-flow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId: siteIdRef.current, clientName: name.trim(), domain, locale, packs }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; flow_url?: string; kept_keys?: string[]; organization?: { created: boolean; name: string } };
      if (!r.ok || !j.ok || !j.flow_url) {
        setError(createErrorText(j.error ?? `http_${r.status}`));
        return;
      }
      setCreated({ flowUrl: j.flow_url, keptKeys: j.kept_keys ?? [], orgCreated: !!j.organization?.created, orgName: j.organization?.name ?? name.trim() });
    } catch {
      setError("連不上伺服器，請稍後再按一次「建立」（不會重複建立）。");
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    const kept = keptKeysText(created.keptKeys);
    return (
      <div style={{ background: "var(--bg-card)", border: "1px solid var(--card-border)", borderRadius: 12, padding: "18px 20px" }}>
        <p style={{ margin: "0 0 10px", fontSize: 14, color: "var(--text-primary)", fontWeight: 600 }}>
          {created.orgCreated ? `已建立客戶「${created.orgName}」與網站紀錄。` : `客戶「${created.orgName}」已經存在，已替它加上這個網站。`}
        </p>
        {kept && <p role="status" style={{ margin: "0 0 12px", fontSize: 13, color: "var(--badge-yellow-text)", background: "var(--badge-yellow-bg)", padding: "8px 10px", borderRadius: 8 }}>{kept}</p>}
        <Link href={created.flowUrl} className="btn btn-primary">前往建站流程</Link>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <div style={FIELD}>
        <label htmlFor="sf-name" style={LABEL}>客戶名稱</label>
        <input id="sf-name" className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="例：AwareWave 算命站" maxLength={120} />
      </div>
      <div style={FIELD}>
        <label htmlFor="sf-domain" style={LABEL}>網址</label>
        <input id="sf-domain" className="form-input" value={domainRaw} onChange={(e) => setDomainRaw(e.target.value)} placeholder="oracle.aware-wave.com" autoCapitalize="none" spellCheck={false} />
        <p className="form-hint">
          {domainRaw.trim() === "" ? "只填網域，不用寫 https://。" : domain && slug ? `主機代號會是 ${slug}。` : "這不是有效的網址，請填像 oracle.aware-wave.com 這樣的網域。"}
        </p>
      </div>
      <div style={FIELD} role="group" aria-label="語言">
        <span style={LABEL}>語言</span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {LOCALES.map((l) => <Choice key={l.value} on={locale === l.value} onClick={() => setLocale(l.value)} label={l.label} />)}
        </div>
      </div>
      <fieldset style={{ ...FIELD, border: "none", padding: 0, minWidth: 0 }}>
        <legend style={LABEL}>外掛組合</legend>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {PLUGIN_PACKS.map((p) => (
            <label key={p.value} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, color: "var(--text-primary)", cursor: p.fixed ? "default" : "pointer" }}>
              <input type="checkbox" checked={p.fixed || packs.includes(p.value)} disabled={p.fixed} onChange={() => togglePack(p.value)} style={{ marginTop: 3 }} />
              <span>{p.label}<span style={{ color: "var(--text-muted)", marginLeft: 8, fontSize: 12 }}>{p.note}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      {error && <p role="alert" style={{ margin: "0 0 12px", fontSize: 13, color: "var(--badge-red-text)", background: "var(--badge-red-bg)", padding: "8px 10px", borderRadius: 8 }}>{error}</p>}
      <button type="submit" className="btn-primary" disabled={!canSubmit}>{busy ? "建立中…" : "建立"}</button>
    </form>
  );
}
