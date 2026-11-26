"use client";
import { badgeShadowOf } from "../banner-layers";
import { FIELD_RANGES } from "../field-ranges";
import { applyLayout, type BadgePos, type BadgeStyle, type TrustType } from "../banner-state";
import type { StepSlot } from "./order";
import { AccordionSection, PresetChips, ShadowControls, StepCard, type StepCtx } from "./ui";

const CTA_PRESETS   = ["立即選購", "馬上搶購", "了解更多", "限時下單", "免費領取", "預約諮詢"];
const BADGE_PRESETS = ["限時優惠", "母親節限定", "新品上市", "買一送一", "免運費", "熱賣中"];

export default function StepMarketing({ slot, s, set, setS }: StepCtx & { slot: StepSlot }) {
  return (
    <StepCard title={slot.title} step={slot.no} icon="🛒" summary={[s.ctaText, s.badgeText, s.showPrice ? s.priceNow || "價格" : "", s.trustType !== "none" ? "信任標記" : ""].filter(Boolean).join(" · ") || "無"}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>

        {/* CTA 按鈕 */}
        <AccordionSection title="CTA 按鈕" summary={s.ctaText || "無"} icon="🛒" defaultOpen>
          <input className="form-input" type="text" placeholder="例：立即選購、馬上搶購…"
            value={s.ctaText} onChange={(e) => set("ctaText", e.target.value)}
            style={{ width: "100%", fontSize: 13, marginBottom: 4 }} />
          <PresetChips chips={CTA_PRESETS} selected={s.ctaText}
            onSelect={(v) => set("ctaText", v === s.ctaText ? "" : v)} />
          {s.ctaText && (
            <div style={{ display: "flex", gap: 12, marginTop: 8, alignItems: "center" }}>
              <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                底色 <input type="color" value={s.ctaBg.startsWith("#") ? s.ctaBg : "#ff5a5f"}
                  onChange={(e) => set("ctaBg", e.target.value)}
                  style={{ width: 32, height: 26, border: "none", background: "none", cursor: "pointer" }} />
              </label>
              <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                字色 <input type="color" value={s.ctaTextColor}
                  onChange={(e) => set("ctaTextColor", e.target.value)}
                  style={{ width: 32, height: 26, border: "none", background: "none", cursor: "pointer" }} />
              </label>
            </div>
          )}
          {s.ctaText && (
            <ShadowControls label="按鈕陰影" unit="按鈕高度" testId="banner-cta-shadow"
              value={s.ctaShadow} onChange={(v) => set("ctaShadow", v)} />
          )}
        </AccordionSection>

        {/* 促銷徽章 */}
        <AccordionSection title="促銷徽章" summary={s.badgeText || "無"} icon="🏷">
          <input className="form-input" type="text" placeholder="例：限時優惠、母親節限定…"
            value={s.badgeText} onChange={(e) => set("badgeText", e.target.value)}
            style={{ width: "100%", fontSize: 13, marginBottom: 4 }} />
          <PresetChips chips={BADGE_PRESETS} selected={s.badgeText}
            onSelect={(v) => set("badgeText", v === s.badgeText ? "" : v)} />
          {s.badgeText && (
            <>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8, alignItems: "center" }}>
                {(["ribbon", "pill", "burst"] as BadgeStyle[]).map((st) => (
                  <button key={st}
                    className={s.badgeStyle === st ? "btn btn-primary" : "btn btn-ghost"}
                    style={{ fontSize: 11, padding: "2px 8px" }}
                    onClick={() => set("badgeStyle", st)}>
                    {{ ribbon: "緞帶", pill: "膠囊", burst: "爆炸星" }[st]}
                  </button>
                ))}
                {(["tl", "tr"] as BadgePos[]).map((pos) => (
                  <button key={pos}
                    className={s.badgePos === pos ? "btn btn-primary" : "btn btn-ghost"}
                    style={{ fontSize: 11, padding: "2px 8px" }}
                    data-testid={`banner-badge-pos-${pos}`}
                    onClick={() => setS((prev) => ({ ...applyLayout(prev, { badgePos: pos }), saved: false, error: null }))}>
                    {{ tl: "左上", tr: "右上" }[pos]}
                  </button>
                ))}
                <input type="color" value={s.badgeColor}
                  onChange={(e) => set("badgeColor", e.target.value)}
                  style={{ width: 32, height: 26, border: "none", background: "none", cursor: "pointer" }} />
              </div>
              <div className="form-row" style={{ marginTop: 8 }}>
                <label className="form-label">徽章大小</label>
                <input type="range" {...FIELD_RANGES.badgeScale} value={s.badgeScale}
                  onChange={(e) => set("badgeScale", Number(e.target.value))} style={{ flex: 1 }} />
                <span style={{ fontSize: 12, opacity: 0.7, marginLeft: 6, minWidth: 32 }}>{s.badgeScale.toFixed(1)}×</span>
              </div>
              <ShadowControls label="徽章陰影" unit="徽章高度" testId="banner-badge-shadow"
                value={badgeShadowOf(s.badgeStyle, s.badgeShadow)} onChange={(v) => set("badgeShadow", v)} />
            </>
          )}
        </AccordionSection>

        {/* 價格 */}
        <AccordionSection title="價格" summary={s.showPrice ? (s.priceNow || "已開") : "無"} icon="💰">
          <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <input type="checkbox" checked={s.showPrice} onChange={(e) => set("showPrice", e.target.checked)} />
            顯示價格
          </label>
          {s.showPrice && (
            <div style={{ display: "flex", gap: 8 }}>
              <input className="form-input" type="text" placeholder="現價 例：NT$590"
                value={s.priceNow} onChange={(e) => set("priceNow", e.target.value)}
                style={{ flex: 1, fontSize: 13 }} />
              <input className="form-input" type="text" placeholder="原價 例：NT$890"
                value={s.priceWas} onChange={(e) => set("priceWas", e.target.value)}
                style={{ flex: 1, fontSize: 13 }} />
            </div>
          )}
        </AccordionSection>

        {/* 信任標記 */}
        <AccordionSection title="信任標記" summary={s.trustType === "none" ? "無" : { stars: "評分", reviews: "評論", guarantee: "保固" }[s.trustType]} icon="⭐">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {(["none", "stars", "reviews", "guarantee"] as TrustType[]).map((tt) => (
              <button key={tt}
                className={s.trustType === tt ? "btn btn-primary" : "btn btn-ghost"}
                style={{ fontSize: 11, padding: "2px 8px" }}
                onClick={() => set("trustType", tt)}>
                {{ none: "無", stars: "★ 評分", reviews: "評論數", guarantee: "保固" }[tt]}
              </button>
            ))}
          </div>
          {(s.trustType === "stars" || s.trustType === "reviews") && (
            <div className="form-row" style={{ marginTop: 8 }}>
              <label className="form-label">星數</label>
              <input type="range" {...FIELD_RANGES.trustStars} value={s.trustStars}
                onChange={(e) => set("trustStars", Number(e.target.value))} style={{ flex: 1 }} />
              <span style={{ fontSize: 12, opacity: 0.7, marginLeft: 6 }}>{s.trustStars}★</span>
            </div>
          )}
          {(s.trustType === "reviews" || s.trustType === "guarantee") && (
            <input className="form-input" type="text"
              placeholder={s.trustType === "reviews" ? "例：12,000+ 則好評" : "例：30 天滿意保證"}
              value={s.trustText} onChange={(e) => set("trustText", e.target.value)}
              style={{ width: "100%", fontSize: 13, marginTop: 8 }} />
          )}
        </AccordionSection>

      </div>
    </StepCard>
  );
}
