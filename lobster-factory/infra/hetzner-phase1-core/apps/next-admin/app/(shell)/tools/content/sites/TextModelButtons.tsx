"use client";

// Card K7: which road the schedule's articles for this site take (訂閱通道 PLAN §3). The chain and the claude level are
// the shared TextChainButtons on the schedule lane (so each subscription segment says whether the host has that tool
// online); the API model is the chain's last segment. Each is saved on its own (PATCH { textChain, textClaudeModel, textCodexModel } /
// { textApiModel }), never with the defaults form. 「套用到所有網站」 copies these three fields, and only them, to this
// organization's other active sites after an in-page confirm that names them. Staff page only (the route refuses others).
import { useState } from "react";
import type { ManagedSite } from "@/app/api/content/sites/route";
import TextChainButtons, { TEXT_CHAIN_LABELS } from "@/components/tools/TextChainButtons";
import OptionButtons from "./OptionButtons";
import { siteTextChain } from "@/lib/content/brand-voice";
import { AI_TEXT_MODELS, DEFAULT_ARTICLE_TEXT_MODEL, DEFAULT_SUB_CLAUDE_MODEL, DEFAULT_SUB_CODEX_MODEL, SUB_TEXT_MODELS, isAiTextModel, isSubTextModel, type ChainChoice } from "@/lib/ai/text-model-options";

const COPY = {
  title: "排程文章的文字 AI",
  detail: "排程寫這個網站的文章時照這條走；前一段不能用（主機沒登入、額度用完、逾時）就換下一段，最後一段一定是 API。",
  apiModel: "最後一段的 API 模型",
  // the stored road as text: the chain buttons show only 只用 API to anyone but the owner, whatever is stored
  stored: (chain: string, models: string[]) => `目前存的走法：${chain}${models.length ? `（${models.join("、")}）` : ""}`,
  ownerOnly: "含訂閱的走法只有擁有者能設定或套用",
  apiOnly: "只用 API",
  ownSitesOnly: "訂閱只用在自己的網站",
  // the owner's mark on a client organization she runs for herself (client_config.ownerSubscription)
  markOn: "這個客戶的網站也是我的，允許用訂閱",
  markedNote: "已允許",
  markOff: "取消",
  applyAll: "套用到所有網站",
  applyNone: "這個客戶沒有其他啟用中的網站",
  confirm: (names: string) => `這三個設定（走法、Claude 等級、API 模型）會寫到：${names}。其他設定不動。確定嗎？`,
  confirmYes: "確定套用",
  cancel: "取消",
  applied: (names: string) => `已套用到：${names}`,
  conflicts: (names: string) => `這些網站剛被別人改過，沒有套用，請重新整理後再按一次：${names}`,
  saveFailed: (status: number) => `儲存失敗（${status}）`,
  network: "網路錯誤，請重試",
};

const API_OPTIONS = AI_TEXT_MODELS.map((m) => ({ value: m.value, label: m.label }));

/** The subscription models a stored road names, as the page's one-line text (a segment the chain does not have is left out). */
function storedModels(chain: string, claudeModel: string, codexModel: string): string[] {
  const label = (id: string, tool: "claude" | "codex") => (isSubTextModel(id) && SUB_TEXT_MODELS[id].tool === tool ? SUB_TEXT_MODELS[id].label : id);
  return [chain.startsWith("claude") ? label(claudeModel, "claude") : "", chain.includes("codex") ? label(codexModel, "codex") : ""].filter(Boolean);
}

export default function TextModelButtons({ site, sites, onSaved, onApplied }: {
  site: ManagedSite;
  /** Every site the page lists: the apply-all confirm names this organization's other active ones. */
  sites: readonly ManagedSite[];
  onSaved: (updated: ManagedSite) => void;
  /** Other sites changed on the server: the page reloads its list. */
  onApplied: () => void;
}) {
  const d = site.contentDefaults ?? {};
  const chain = siteTextChain(d);
  const claudeModel = typeof d.textClaudeModel === "string" ? d.textClaudeModel : DEFAULT_SUB_CLAUDE_MODEL;
  const codexModel = typeof d.textCodexModel === "string" ? d.textCodexModel : DEFAULT_SUB_CODEX_MODEL;
  const apiModel = isAiTextModel(d.textApiModel) ? d.textApiModel : DEFAULT_ARTICLE_TEXT_MODEL;
  const others = sites.filter((s) => s.id !== site.id && s.active && s.source === "db" && !!site.organization_id && s.organization_id === site.organization_id);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(patch: Record<string, string>) {
    setSaving(true); setError(null); setNote(null);
    try {
      const res = await fetch(`/api/content/sites/${site.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
      });
      const json = await res.json().catch(() => null) as { ok?: boolean; site?: ManagedSite; error?: string } | null;
      if (json?.ok && json.site) onSaved(json.site);
      else setError(json?.error === "sub_operator_only" ? COPY.ownerOnly : json?.error ?? COPY.saveFailed(res.status));
    } catch { setError(COPY.network); } finally { setSaving(false); }
  }

  async function mark(allowed: boolean) {
    setSaving(true); setError(null); setNote(null);
    try {
      const res = await fetch("/api/content/sites/owner-subscription", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId: site.organization_id, allowed }),
      });
      const json = await res.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (json?.ok) onApplied();   // every site of this organization changes: the page reloads its list
      else setError(json?.error === "sub_operator_only" ? COPY.ownerOnly : json?.error ?? COPY.saveFailed(res.status));
    } catch { setError(COPY.network); } finally { setSaving(false); }
  }
  // only the owner sees the mark, and only on a client organization (her own organization needs none)
  const markable = site.ownerViewing === true && !!site.organization_id && (site.ownerSubscription === true || !site.subscriptionsAllowed);

  async function applyAll() {
    setSaving(true); setError(null); setNote(null);
    try {
      const res = await fetch(`/api/content/sites/${site.id}/apply-text-road`, { method: "POST" });
      const json = await res.json().catch(() => null) as { ok?: boolean; updated?: string[]; conflicts?: string[]; error?: string } | null;
      if (json?.ok) {
        setConfirming(false);
        setNote([json.updated?.length ? COPY.applied(json.updated.join("、")) : "", json.conflicts?.length ? COPY.conflicts(json.conflicts.join("、")) : ""].filter(Boolean).join("；"));
        onApplied();
      } else setError(json?.error === "sub_operator_only" ? COPY.ownerOnly : json?.error ?? COPY.saveFailed(res.status));
    } catch { setError(COPY.network); } finally { setSaving(false); }
  }

  return (
    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ color: "var(--text-primary)", fontSize: 12 }}>{COPY.title}</span>
      <div style={{ color: "var(--text-muted)", fontSize: 12 }}>{COPY.detail}</div>
      <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
        {COPY.stored(TEXT_CHAIN_LABELS.find((c) => c.value === chain)?.label ?? chain, storedModels(chain, claudeModel, codexModel))}
      </div>
      {site.subscriptionsAllowed ? (
        <>
          <TextChainButtons lane="schedule" chain={chain} claudeModel={claudeModel} codexModel={codexModel} disabled={saving}
            onChange={(next: ChainChoice) =>
              void save({ textChain: next.chain, ...(next.chain.startsWith("claude") ? { textClaudeModel: next.claudeModel } : {}),
                ...(next.chain.includes("codex") ? { textCodexModel: next.codexModel } : {}) })} />
          {markable && site.ownerSubscription && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontSize: 12, color: "var(--text-muted)" }}>
              <span>{COPY.markOn}：{COPY.markedNote}</span>
              <button type="button" className="btn btn-sm" disabled={saving} onClick={() => void mark(false)}>{COPY.markOff}</button>
            </div>
          )}
        </>
      ) : (
        // a customer's site (or one whose organization could not be read): the schedule runs it on the API alone
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontSize: 12 }}>
          <button type="button" className="btn btn-sm btn-primary" aria-pressed disabled>{COPY.apiOnly}</button>
          <span style={{ color: "var(--text-muted)" }}>{COPY.ownSitesOnly}</span>
          {markable && <button type="button" className="btn btn-sm" disabled={saving} onClick={() => void mark(true)}>{COPY.markOn}</button>}
        </div>
      )}
      <OptionButtons label={COPY.apiModel} value={apiModel} options={API_OPTIONS} onChange={(v) => void save({ textApiModel: v })} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12 }}>
        <button type="button" className="btn btn-sm" disabled={saving || others.length === 0} onClick={() => { setConfirming(true); setNote(null); }}>
          {COPY.applyAll}
        </button>
        {others.length === 0 && <span style={{ color: "var(--text-muted)" }}>{COPY.applyNone}</span>}
      </div>
      {confirming && others.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12, color: "var(--text-primary)" }}>
          <span>{COPY.confirm(others.map((s) => s.name).join("、"))}</span>
          <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={() => void applyAll()}>{COPY.confirmYes}</button>
          <button type="button" className="btn btn-sm" disabled={saving} onClick={() => setConfirming(false)}>{COPY.cancel}</button>
        </div>
      )}
      {note && <div style={{ color: "var(--text-muted)", fontSize: 12 }}>{note}</div>}
      {error && <div style={{ color: "var(--red)", fontSize: 12 }}>{error}</div>}
    </div>
  );
}
