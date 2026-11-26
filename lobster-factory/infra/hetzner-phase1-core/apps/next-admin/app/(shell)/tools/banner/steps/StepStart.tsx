"use client";
// ① 開始 (staff only): whose banner -- that client's brand kit (風格) and whose 我的設計 it is saved into.
import { useState } from "react";
import type { useBrandKit } from "../kit/useBrandKit";
import type { BannerStaffApi } from "../banner-state";
import { stepRef, type StepSlot } from "./order";
import { StepCard, type StepCtx } from "./ui";

export default function StepStart({ slot, setS, staff, brand, saveOrg, setSaveOrg, saveOrgName, setSaveOrgName }: Pick<StepCtx, "setS"> & {
  slot: StepSlot; staff: BannerStaffApi; brand: ReturnType<typeof useBrandKit>;
  saveOrg: string | null; setSaveOrg(v: string | null): void; saveOrgName: string | null; setSaveOrgName(v: string | null): void;
}) {
  const [pickingOrg, setPickingOrg] = useState(false);
  const client = saveOrg ? (saveOrgName ?? "開啟時指定的客戶") : "自用";
  return (
    <StepCard title={slot.title} step={slot.no} icon="👤" defaultOpen summary={client}>
      <div className="form-row" data-testid="banner-start" style={{ flexWrap: "wrap", gap: 8 }}>
        <label className="form-label">為哪個客戶做</label>
        <span style={{ fontSize: 13, fontWeight: 600 }} data-testid="banner-client-name">{client}</span>
        {brand.kit && <span className="form-hint">· 有品牌套組</span>}
        <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: "2px 8px" }} data-testid="banner-client-change"
          onClick={() => setPickingOrg((v) => !v)}>{pickingOrg ? "收起" : "更換"}</button>
      </div>
      {pickingOrg && (
        <div style={{ marginTop: 8 }}>
          <staff.SaveOrgPicker selected={saveOrg} onPick={(id, name) => {
            setSaveOrg(id); setSaveOrgName(name ?? null); setPickingOrg(false); setS((prev) => ({ ...prev, saved: false }));
          }} />
        </div>
      )}
      <p className="form-hint" style={{ margin: "8px 0 0" }}>選的客戶同時決定品牌套組（{stepRef("style", true)}）和存到誰的我的設計。</p>
    </StepCard>
  );
}
