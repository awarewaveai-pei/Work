"use client";
// Card C6: shows the organization's brand kit (logo, colours, fonts) with 套用到這張 / 把目前設定存成套組 / 上傳 logo.
// Pure: data and saving come in through `brand` (useBrandKit); the banner's own state through getCurrent / onApply.
// Swatch backgrounds are the kit's colours (content); the chrome uses globals classes and theme tokens only.
import { useRef, useState } from "react";
import { COLOR_ROLES, type BrandKit } from "./brand-kit";
import type { BrandKitState } from "./useBrandKit";

const LOGO_TYPES = "image/png,image/jpeg,image/webp";

export type BrandKitPanelProps = {
  brand: BrandKitState;
  onApply(kit: BrandKit): void;
  /** The banner's current colours and fonts, for 把目前設定存成套組 (name and logo default to the saved kit's). */
  getCurrent(): Pick<BrandKit, "colors" | "headlineFont" | "bodyFont" | "headlineWeight" | "bodyWeight"> & Partial<Pick<BrandKit, "name" | "logo">>;
};

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((ok, fail) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => fail(r.error);
    r.readAsDataURL(file);
  });
}

export default function BrandKitPanel({ brand, onApply, getCurrent }: BrandKitPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  // The logo is a My Designs object: deleting it there leaves this URL dead (nothing stops that delete yet).
  const [brokenLogo, setBrokenLogo] = useState<string | null>(null);
  const { kit, saved, canEdit, status, error } = brand;
  const busy = status === "saving" || status === "loading";

  const fromCurrent = (): BrandKit => {
    const cur = getCurrent();
    return { ...(kit ?? {}), ...cur, name: cur.name ?? kit?.name ?? "品牌套組", logo: cur.logo ?? kit?.logo } as BrandKit;
  };

  const onLogo = async (file: File | undefined) => {
    if (!file) return;
    const logo = await readAsDataUrl(file);
    await brand.save({ ...(kit ?? fromCurrent()), logo });
  };

  return (
    <div className="card" style={{ padding: 12, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <strong style={{ color: "var(--text-primary)" }}>品牌套組</strong>
        {kit && <span className="form-hint">{kit.name}{saved ? "" : "（由品牌色帶入，尚未存）"}</span>}
      </div>

      {status === "loading" && <p className="form-hint">讀取中…</p>}
      {status !== "loading" && !kit && <p className="form-hint">這個客戶還沒有品牌套組。可把目前設定存成套組，或到客戶設定填品牌色。</p>}

      {kit && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {kit.logo && brokenLogo !== kit.logo
              ? <img src={kit.logo} alt="logo" onError={() => setBrokenLogo(kit.logo ?? null)} style={{ height: 40, maxWidth: 120, objectFit: "contain", border: "1px solid var(--border)", borderRadius: 6 }} />
              : <span className="form-hint">{kit.logo ? "logo 圖檔已不存在，請重新上傳" : "無 logo"}</span>}
            <div style={{ display: "flex", gap: 6 }}>
              {kit.colors.map((c, i) => (
                <div key={i} title={`${COLOR_ROLES[i] ?? ""} ${c}`} style={{ display: "grid", justifyItems: "center", gap: 2 }}>
                  <span style={{ width: 28, height: 28, borderRadius: 6, background: c, border: "1px solid var(--border)" }} />
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{COLOR_ROLES[i] ?? ""}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: "grid", gap: 2, color: "var(--text-primary)" }}>
            <span style={{ fontFamily: kit.headlineFont, fontWeight: kit.headlineWeight, fontSize: 18 }}>標題字 Headline</span>
            <span style={{ fontFamily: kit.bodyFont, fontWeight: kit.bodyWeight, fontSize: 13 }}>內文字 Body text</span>
          </div>
        </>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button type="button" className="btn btn-primary" disabled={!kit || busy} onClick={() => kit && onApply(kit)}>套用到這張</button>
        {canEdit && (
          <>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void brand.save(fromCurrent())}>把目前設定存成套組</button>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => fileRef.current?.click()}>上傳 logo</button>
            <input ref={fileRef} type="file" accept={LOGO_TYPES} hidden onChange={(e) => { void onLogo(e.target.files?.[0]); e.target.value = ""; }} />
          </>
        )}
      </div>
      {status === "saving" && <p className="form-hint">儲存中…</p>}
      {error && <p className="form-hint" style={{ color: "var(--badge-red-text)" }}>{error}</p>}
    </div>
  );
}
