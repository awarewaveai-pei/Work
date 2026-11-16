"use client";

import { useEffect, useRef, useState } from "react";
import { inputStyle, optionStyle } from "@/components/tools/panel-primitives";

type Org = { id: string; name: string; slug: string };

/**
 * Shared org picker for video-tool panels. Backed by the existing
 * /api/video/workbench/bootstrap route (human-readable {id,name,slug} list,
 * auto-scoped to the caller's own org for client-kind tenants). Replaces the
 * raw-UUID text inputs that StoryBibleWorkbench/ReleaseDeliveryPanel/
 * MediaOperationsPanel/FootageEditor each built independently.
 * On fetch failure (e.g. non-ops role gets 403) falls back to manual UUID
 * entry instead of blocking the panel.
 */
export default function OrganizationPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  // 解決 critic 發現：single-org auto-select 原本讀取 mount 時關閉的 value，未來若有呼叫端
  // 在 fetch 進行中透過別的途徑設值，會被靜默覆蓋。改讀 ref，反映 resolve 當下的最新值。
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/video/workbench/bootstrap")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { ok: boolean; organizations?: Org[] }) => {
        if (cancelled) return;
        const list = j.organizations ?? [];
        setOrgs(list);
        setStatus("ready");
        if (!valueRef.current && list.length === 1) onChange(list[0].id);
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // fetch 成功但清單為空（例如 client 租戶 fallback UUID 查不到任何 active org）跟 fetch 失敗
  // 一樣是死路——都要給手動輸入逃生口，不能只在 status==="error" 才給（critic 發現）。
  if (status === "error" || (status === "ready" && orgs.length === 0)) {
    return (
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="organization UUID（租戶清單載入失敗或為空，改手動輸入）"
        style={inputStyle()}
        disabled={disabled}
      />
    );
  }
  // Visible buttons, no dropdown (video-unify-plan-20261116 hard rule; style contract app/video/(wb)/__tests__).
  if (status === "loading") return <span style={{ fontSize: 12, color: "var(--text-muted)" }}>載入租戶清單…</span>;
  return (
    <div role="group" aria-label="選擇租戶" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {orgs.map((o) => (
        <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id)} disabled={disabled}
          style={{ ...optionStyle(value === o.id), opacity: disabled ? 0.4 : 1, cursor: disabled ? "not-allowed" : "pointer" }}>
          {o.name}（{o.slug}）
        </button>
      ))}
    </div>
  );
}
