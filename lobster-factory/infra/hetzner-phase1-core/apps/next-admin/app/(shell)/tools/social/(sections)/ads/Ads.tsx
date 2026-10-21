"use client";
// C28: the reviewable Meta Marketing API surface. Reads are available to every brand role; campaign state changes
// are restricted to owner/editor and require a browser confirmation before the external POST.
import { useEffect, useMemo, useState } from "react";
import { api, type AdsAccount, type AdsCampaign, type AdsInsight } from "../../api";
import type { SlotContext } from "../../SocialManager";

const message = (e: unknown) => e instanceof Error ? e.message : String(e);
const money = (value: string | null) => value == null ? "—" : Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Ads({ ctx }: { ctx: SlotContext }) {
  const [accounts, setAccounts] = useState<AdsAccount[] | null>(null);
  const [account, setAccount] = useState("");
  const [campaigns, setCampaigns] = useState<AdsCampaign[] | null>(null);
  const [insights, setInsights] = useState<AdsInsight[] | null>(null);
  const [accountMenu, setAccountMenu] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assets, setAssets] = useState<import("../../api").MetaAsset[] | null>(null);
  const [assetKind, setAssetKind] = useState<import("../../api").MetaAsset["kind"]>("facebook_page");
  const [assetExternalId, setAssetExternalId] = useState("");
  const [assetPageId, setAssetPageId] = useState("");
  const [assetLabel, setAssetLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const canWrite = ctx.brand.role === "owner" || ctx.brand.role === "editor";

  const load = async (id: string) => {
    if (!id) return;
    setBusy(true); setError(null);
    try {
      const [c, i] = await Promise.all([api.adsCampaigns(ctx.brand.id, id), api.adsInsights(ctx.brand.id, id)]);
      setCampaigns(c.campaigns); setInsights(i.insights);
    } catch (e) { setError(message(e)); setCampaigns(null); setInsights(null); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    let live = true;
    setAccounts(null); setCampaigns(null); setInsights(null); setAccount(""); setError(null);
    api.adsAccounts(ctx.brand.id).then((r) => {
      if (!live) return;
      setAccounts(r.accounts);
      const next = r.accounts[0]?.id ?? "";
      setAccount(next);
      if (next) void load(next);
    }).catch((e) => { if (live) setError(message(e)); });
    if (canWrite) api.metaAssets(ctx.brand.id).then((r) => { if (live) setAssets(r.assets); }).catch((e) => { if (live) setError(message(e)); });
    return () => { live = false; };
  }, [ctx.brand.id, canWrite]); // eslint-disable-line react-hooks/exhaustive-deps

  const insight = insights?.[0];
  const accountLabel = useMemo(() => accounts?.find((a) => a.id === account)?.name ?? account, [accounts, account]);
  async function setStatus(campaign: AdsCampaign) {
    const status = campaign.status === "PAUSED" ? "ACTIVE" : "PAUSED";
    if (!window.confirm(`${status === "PAUSED" ? "暫停" : "啟用"}「${campaign.name}」？這會直接修改 Meta 廣告活動。`)) return;
    try { await api.setAdsCampaignStatus(ctx.brand.id, account, campaign.id, status); await load(account); }
    catch (e) { setError(message(e)); }
  }

  async function addAsset() {
    try {
      const r = await api.addMetaAsset(ctx.brand.id, { kind: assetKind, externalId: assetExternalId, pageExternalId: assetKind === "instagram_account" ? assetPageId : null, label: assetLabel || null });
      setAssets((old) => [...(old ?? []), r.asset]); setAssetExternalId(""); setAssetPageId(""); setAssetLabel("");
    } catch (e) { setError(message(e)); }
  }

  return <section className="sm-panel" aria-label="廣告管理">
    <div className="sm-ptop"><h2>廣告管理</h2><span className="sm-muted">Meta Marketing API · Standard Access；<a href="https://developers.facebook.com/documentation/instagram-platform/webhooks/setup" target="_blank" rel="noreferrer">IG 留言自動回覆需 Advanced Access／審核</a>，這裡不提供</span></div>
    {error && <p className="sm-err" role="alert">{error}</p>}
    {!accounts && !error && <p className="sm-muted">正在讀取 Meta 廣告帳戶…</p>}
    {accounts && !accounts.length && <p className="sm-muted">Meta 沒有回傳可用的廣告帳戶，請確認此登入已授予 ads_read。</p>}
    {accounts && accounts.length > 0 && <>
      <div className="sm-toolbar"><div className="sm-dropdown"><span className="sm-muted">廣告帳戶</span><button type="button" aria-haspopup="listbox" aria-expanded={accountMenu} onClick={() => setAccountMenu((open) => !open)}>{accountLabel || "選擇廣告帳戶"}</button>{accountMenu && <div className="sm-pop" role="listbox" aria-label="廣告帳戶"><div>{accounts.map((a) => <button type="button" role="option" aria-selected={a.id === account} key={a.id} onClick={() => { setAccountMenu(false); setAccount(a.id); void load(a.id); }}>{a.name || a.id}</button>)}</div></div>}</div><span className="sm-muted">{accountLabel}{busy ? " · 更新中…" : ""}</span></div>
      {insight && <div className="sm-grid"><div><span className="sm-muted">花費</span><b>{money(insight.spend)}</b></div><div><span className="sm-muted">曝光</span><b>{insight.impressions ?? "—"}</b></div><div><span className="sm-muted">點擊</span><b>{insight.clicks ?? "—"}</b></div><div><span className="sm-muted">觸及</span><b>{insight.reach ?? "—"}</b></div></div>}
      <h3>廣告活動</h3>
      {!campaigns && !busy && <p className="sm-muted">尚未讀到活動。</p>}
      {campaigns && !campaigns.length && <p className="sm-muted">此帳戶沒有廣告活動。</p>}
      {campaigns?.map((c) => <div key={c.id} className="sm-row"><div><b>{c.name}</b><span className="sm-muted">{c.objective ?? "—"} · {c.effective_status ?? c.status ?? "—"}</span></div><button type="button" disabled={!canWrite || busy} onClick={() => void setStatus(c)}>{c.status === "PAUSED" ? "啟用" : "暫停"}</button></div>)}
    </>}
    {canWrite && <div className="sm-panel" aria-label="Meta 資產設定"><h3>Meta 資產綁定</h3><p className="sm-muted">只填 Meta asset ID；token 留在部署環境。Instagram DM 另外填 linked Facebook Page ID。</p><div className="sm-toolbar"><select value={assetKind} onChange={(e) => setAssetKind(e.target.value as typeof assetKind)}><option value="facebook_page">Facebook Page</option><option value="instagram_account">Instagram account</option><option value="ad_account">Ad account</option></select><input aria-label="Meta asset ID" value={assetExternalId} onChange={(e) => setAssetExternalId(e.target.value)} placeholder="Meta asset ID" /><input aria-label="Linked Page ID" value={assetPageId} onChange={(e) => setAssetPageId(e.target.value)} placeholder="IG linked Page ID（IG 才需要）" /><input aria-label="Asset label" value={assetLabel} onChange={(e) => setAssetLabel(e.target.value)} placeholder="標籤（可選）" /><button type="button" disabled={!assetExternalId.trim()} onClick={() => void addAsset()}>新增</button></div>{assets?.map((asset) => <div className="sm-row" key={asset.id}><div><b>{asset.label || asset.externalId}</b><span className="sm-muted">{asset.kind}{asset.pageExternalId ? ` · Page ${asset.pageExternalId}` : ""}</span></div><button type="button" onClick={() => void api.setMetaAssetEnabled(ctx.brand.id, asset.id, !asset.enabled).then((r) => setAssets((old) => old?.map((item) => item.id === r.asset.id ? r.asset : item) ?? null)).catch((e) => setError(message(e)))}>{asset.enabled ? "停用" : "啟用"}</button></div>)}</div>}
  </section>;
}
