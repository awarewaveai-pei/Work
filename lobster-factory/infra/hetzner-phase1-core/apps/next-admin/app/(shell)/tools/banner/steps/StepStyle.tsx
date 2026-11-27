"use client";
import { useRef, useState, type MutableRefObject } from "react";
import BrandKitPanel from "../kit/BrandKitPanel";
import type { useBrandKit } from "../kit/useBrandKit";
import type { BrandKit } from "../kit/brand-kit";
import { brandKitPatch } from "../kit/apply-kit";
import { LOGO_AUTO, type LogoPos } from "../banner-layout";
import type { TypeSizes } from "../banner-layers";
import { FIELD_RANGES } from "../field-ranges";
import { applyLayout, extractPalette, luminance, saturation, type State } from "../banner-state";
import type { StepSlot } from "./order";
import { StepCard, SubHead, type StepCtx } from "./ui";

/** `drawnType.logo`: the logo height the preview drew (share of the short side) -- the slider shows it. */
export default function StepStyle({ slot, s, set, setS, sRef, brand, drawnType }: StepCtx & {
  slot: StepSlot; sRef: MutableRefObject<State>; brand: ReturnType<typeof useBrandKit>; drawnType: TypeSizes | null;
}) {
  const colorRefFileRef   = useRef<HTMLInputElement>(null);
  // colour tools (not part of design State / undo history — derived/fetched data)
  const [palette, setPalette]     = useState<string[]>([]);
  const [selSwatch, setSelSwatch] = useState<string | null>(null);

  async function applyBrandKit(kit: BrandKit) {
    const { patch, logoError } = await brandKitPatch(kit, true);
    setS((prev) => ({ ...prev, ...patch, saved: false, ...(logoError ? { error: logoError } : {}) }));
  }
  // a corner button goes through applyLayout like every position button: the logo's drag is dropped, so it always shows
  const logoPos: LogoPos = s.logoPos ?? "bl";
  // the slider turns logoAuto off, 自動大小 back on; it shows the drawn size (a corner's room / the width cap may shrink it)
  const logoAuto = s.logoAuto;
  const logoShown = drawnType?.logo ?? (logoAuto ? LOGO_AUTO : s.logoScale);
  const logoShrunk = !logoAuto && logoShown < s.logoScale - 0.0005;
  const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;
  const setLogo = (patch: Pick<State, "logoAuto"> & { logoScale?: number }) =>
    setS((prev) => ({ ...prev, ...patch, saved: false, error: null }));
  const LOGO_CORNERS: { pos: LogoPos; label: string }[] = [
    { pos: "tl", label: "左上" }, { pos: "tr", label: "右上" }, { pos: "bl", label: "左下" }, { pos: "br", label: "右下" },
  ];

  // ── colour-tool handlers ──
  function handleColorRefUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const pal = await extractPalette(reader.result as string);
        setPalette(pal); setSelSwatch(pal[0] ?? null);
      } catch { setS((prev) => ({ ...prev, error: "palette_extract_failed" })); }
    };
    reader.onerror = () => setS((prev) => ({ ...prev, error: "upload_read_failed" }));
    reader.readAsDataURL(file);
  }

  // Auto-distribute a palette across the design (dark→bg gradient, most-saturated→CTA/accent, light→text).
  function autoApplyPalette(pal: string[]) {
    if (!pal.length) return;
    const byLum = [...pal].sort((a, b) => luminance(a) - luminance(b));
    const dark = byLum[0];
    const dark2 = byLum[1] ?? byLum[0];
    const light = byLum[byLum.length - 1];
    const accent = [...pal].sort((a, b) => saturation(b) - saturation(a))[0];
    setS((prev) => ({
      ...prev,
      bgMode: "gradient", gradFrom: dark, gradTo: dark2,
      textColor: luminance(light) > 150 ? light : "#ffffff",
      ctaBg: accent, badgeColor: accent, accentColor: accent,
      ctaTextColor: luminance(accent) > 150 ? "#111111" : "#ffffff",
      saved: false, error: null,
    }));
  }

  type ColorKey = "textColor" | "accentColor" | "ctaBg" | "badgeColor" | "gradFrom" | "gradTo" | "bgColor";
  const SWATCH_TARGETS: { label: string; key: ColorKey }[] = [
    { label: "標題字", key: "textColor" }, { label: "重點字", key: "accentColor" },
    { label: "CTA 底", key: "ctaBg" }, { label: "徽章", key: "badgeColor" },
    { label: "背景起", key: "gradFrom" }, { label: "背景迄", key: "gradTo" }, { label: "純色背景", key: "bgColor" },
  ];

  return (
    <StepCard title={slot.title} step={slot.no} icon="🎨" summary={brand.kit ? `品牌套組 · ${brand.kit.name}` : "自訂配色"}>
      <SubHead first={true}>配色／品牌色</SubHead>
      <BrandKitPanel brand={brand} onApply={(kit) => void applyBrandKit(kit)}
        getCurrent={() => {
          const c = sRef.current;
          return { colors: [c.gradFrom, c.gradTo, c.accentColor, c.textColor, c.bgColor], headlineFont: c.headlineFont, bodyFont: c.fontFamily, headlineWeight: c.headlineWeight, bodyWeight: c.bodyWeight };
        }} />
      {s.logoImage && (
        <div className="form-row" style={{ marginTop: 8, flexWrap: "wrap", gap: 6 }}>
          <label className="form-label">Logo</label>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={s.logoImage} alt="logo" style={{ height: 28, maxWidth: 80, objectFit: "contain" }} />
          <span style={{ fontSize: 12 }}>大小</span>
          <input type="range" {...FIELD_RANGES.logoScale} value={logoShown} data-testid="banner-logo-scale"
            onChange={(e) => setLogo({ logoAuto: false, logoScale: Number(e.target.value) })} style={{ flex: 1, minWidth: 80 }} />
          <span style={{ fontSize: 12, opacity: 0.7 }} data-testid="banner-logo-scale-shown">
            {`短邊 ${pct(logoShown)}`}{logoAuto ? "（自動）" : logoShrunk ? `（已縮，設定 ${pct(s.logoScale)}）` : ""}
          </span>
          <button type="button" className={logoAuto ? "btn btn-primary" : "btn btn-ghost"} style={{ fontSize: 12, padding: "2px 8px" }}
            data-testid="banner-logo-auto" onClick={() => setLogo({ logoAuto: true })}>自動大小</button>
          <button className="btn btn-ghost" style={{ fontSize: 12, padding: "2px 8px" }} onClick={() => set("logoImage", null)}>拿掉 logo</button>
          <div style={{ display: "flex", gap: 4, width: "100%", alignItems: "center" }} data-testid="banner-logo-pos">
            <span style={{ fontSize: 12, minWidth: 28 }}>位置</span>
            {LOGO_CORNERS.map((c) => (
              <button key={c.pos} type="button" className={logoPos === c.pos ? "btn btn-primary" : "btn btn-ghost"}
                style={{ fontSize: 12, padding: "2px 8px" }} data-testid={`banner-logo-pos-${c.pos}`}
                onClick={() => setS((prev) => ({ ...applyLayout(prev, { logoPos: c.pos }), saved: false, error: null }))}>
                {c.label}
              </button>
            ))}
          </div>
          <span className="form-hint" style={{ width: "100%" }}>自動大小＝高度取畫面短邊 10%，且不超過主標字高 1.5 倍，四周留 logo 高 25% 的淨空；拉滑桿改成手動。也可在預覽上拖曳；按位置鈕會回到那個角落。</span>
        </div>
      )}

      <input ref={colorRefFileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleColorRefUpload} />
      <button className="btn btn-ghost" style={{ fontSize: 12, marginTop: 8 }} onClick={() => colorRefFileRef.current?.click()}>
        📷 從參考圖擷取配色
      </button>

      {palette.length > 0 && (
        <>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
            {palette.map((c, i) => (
              <button key={`${c}-${i}`} onClick={() => setSelSwatch(c)} title={c}
                style={{
                  width: 30, height: 30, borderRadius: 6, background: c, cursor: "pointer", padding: 0,
                  border: selSwatch === c ? "3px solid var(--accent)" : "1px solid var(--border)",
                }} />
            ))}
          </div>
          <button className="btn btn-primary" style={{ fontSize: 12, marginTop: 10 }} onClick={() => autoApplyPalette(palette)}>
            ✨ 自動套用整組配色
          </button>
          {selSwatch && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, opacity: 0.55, marginBottom: 4, display: "flex", alignItems: "center", gap: 5 }}>
                把選中色
                <span style={{ display: "inline-block", width: 13, height: 13, background: selSwatch, borderRadius: 3, border: "1px solid var(--border)" }} />
                套到：
              </div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {SWATCH_TARGETS.map((t) => (
                  <button key={t.key} className="btn btn-ghost" style={{ fontSize: 11, padding: "2px 8px" }}
                    onClick={() => { if (selSwatch) set(t.key, selSwatch); }}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </StepCard>
  );
}
