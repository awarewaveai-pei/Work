"use client";
import { useCallback, useRef, useState, type MutableRefObject } from "react";
import { urlToBlob } from "@/lib/studio/design-upload";
import BrandKitPanel from "../kit/BrandKitPanel";
import type { useBrandKit } from "../kit/useBrandKit";
import type { BrandKit } from "../kit/brand-kit";
import {
  TEMPLATES, extractPalette, luminance, openerPlaceholders, saturation, templatePatch,
  type BannerStaffApi, type State,
} from "../banner-state";
import type { StepSlot } from "./order";
import { StepCard, SubHead, type StepCtx } from "./ui";

export default function StepStyle({ slot, s, set, setS, sRef, brand, staff }: StepCtx & {
  slot: StepSlot; sRef: MutableRefObject<State>; brand: ReturnType<typeof useBrandKit>; staff?: BannerStaffApi;
}) {
  const colorRefFileRef   = useRef<HTMLInputElement>(null);
  // colour tools (not part of design State / undo history — derived/fetched data)
  const [palette, setPalette]     = useState<string[]>([]);
  const [selSwatch, setSelSwatch] = useState<string | null>(null);

  // ── template apply ──
  const applyTemplate = useCallback((patch: Partial<State>) =>
    setS((prev) => ({ ...prev, brandBar: false, balanceTitle: false, ...patch, saved: false, error: null }))
  , []);

  async function applyBrandKit(kit: BrandKit) {
    const [main, second, accent, text, bg] = kit.colors;
    let logoImage: string | null = null;
    if (kit.logo) {
      try {
        // the logo lives in the bucket (another origin): fetch it through our download route so the canvas stays readable
        const blob = await urlToBlob(kit.logo);
        logoImage = await new Promise<string>((ok, fail) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => fail(r.error); r.readAsDataURL(blob); });
      } catch (err) {
        setS((prev) => ({ ...prev, error: `logo 讀取失敗：${err instanceof Error ? err.message : String(err)}` }));
      }
    }
    setS((prev) => ({
      ...prev,
      ...(main ? { gradFrom: main, badgeColor: main } : {}),
      ...(second ? { gradTo: second } : {}),
      ...(accent ? { accentColor: accent, ctaBg: accent } : {}),
      ...(text ? { textColor: text } : {}),
      ...(bg ? { bgColor: bg } : {}),
      headlineFont: kit.headlineFont, fontFamily: kit.bodyFont, headlineWeight: kit.headlineWeight, bodyWeight: kit.bodyWeight,
      ...(logoImage ? { logoImage } : {}),
      saved: false,
    }));
  }

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
          <input type="range" min={0.04} max={0.6} step={0.01} value={s.logoScale} data-testid="banner-logo-scale"
            onChange={(e) => set("logoScale", Number(e.target.value))} style={{ flex: 1, minWidth: 80 }} />
          <span style={{ fontSize: 12, opacity: 0.7 }}>{Math.round(s.logoScale * 100)}%</span>
          <button className="btn btn-ghost" style={{ fontSize: 12, padding: "2px 8px" }} onClick={() => set("logoImage", null)}>拿掉 logo</button>
          <span className="form-hint" style={{ width: "100%" }}>預設在左下角，可在預覽上拖曳。</span>
        </div>
      )}
      {staff ? <staff.BrandPicker onPick={(colors) => { setPalette(colors); setSelSwatch(colors[0] ?? null); }} /> : null}

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
      <SubHead first={false}>版型模板</SubHead>
      <p className="form-hint" style={{ marginBottom: 8, marginTop: 4 }}>套用後再填內容；只改版面/元素，不動你的文字與圖。</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {TEMPLATES.filter((t) => !t.group).map((t) => (
          <button key={t.key} className="btn btn-ghost"
            style={{ fontSize: 12, padding: "8px 6px", textAlign: "left", lineHeight: 1.3 }}
            onClick={() => applyTemplate(t.patch)}>
            <span style={{ fontSize: 15, marginRight: 4 }}>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>
      {/* card R3: cards a video opens with (存到我的設計 -> the editor's 片頭 「從我的設計挑」) */}
      <p className="form-hint" style={{ margin: "10px 0 6px" }}>做影片開頭的標題卡：選一種版面 → 改字 → 存到我的設計，之後在影片剪輯的片頭選「橫幅字卡」使用</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {TEMPLATES.filter((t) => t.group === "opener").map((t) => (
          <button key={t.key} className="btn btn-ghost"
            style={{ fontSize: 12, padding: "8px 6px", textAlign: "left", lineHeight: 1.3 }}
            onClick={() => applyTemplate({ ...templatePatch(t, s.preset), ...openerPlaceholders(t.key, s) })}>
            <span style={{ fontSize: 15, marginRight: 4 }}>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>
    </StepCard>
  );
}
