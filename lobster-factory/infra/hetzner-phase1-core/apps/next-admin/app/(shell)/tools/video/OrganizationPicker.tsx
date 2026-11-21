"use client";

import { useEffect, useRef, useState } from "react";
import { inputStyle } from "@/components/tools/panel-primitives";
import { OrgPicker } from "@/app/(shell)/ops/clients/OrgPicker";
import type { PickOrg } from "@/app/(shell)/ops/clients/nav-orgs";

/**
 * The video-tool panels' client picker (StoryBibleWorkbench / ReleaseDeliveryPanel / ScriptForge): the client block
 * (OrgPicker.tsx) fed by GET /api/video/workbench/bootstrap?first=1 -- the first NAV_FIRST clients, the rest by search;
 * a customer gets only its own organization and no search box. One client = picked by itself.
 * On fetch failure (e.g. a role without access) or an empty answer it falls back to manual UUID entry instead of
 * blocking the panel.
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
  const [first, setFirst] = useState<{ orgs: PickOrg[]; total: number; scoped: boolean } | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  // the latest value when the fetch resolves (a caller may set one meanwhile; it must not be overwritten)
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    let cancelled = false;
    const include = valueRef.current ? `&include=${encodeURIComponent(valueRef.current)}` : "";
    fetch(`/api/video/workbench/bootstrap?first=1${include}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { ok: boolean; orgs?: PickOrg[]; total?: number; scoped?: boolean }) => {
        if (cancelled) return;
        const orgs = j.orgs ?? [];
        setFirst({ orgs, total: j.total ?? orgs.length, scoped: j.scoped === true });
        setStatus("ready");
        if (!valueRef.current && orgs.length === 1 && (j.total ?? 1) === 1) onChange(orgs[0].id);
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // an empty answer is as much a dead end as a failed one: both get the manual entry
  if (status === "error" || (status === "ready" && first?.orgs.length === 0)) {
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
  if (status === "loading" || !first) return <span style={{ fontSize: 12, color: "var(--text-muted)" }}>載入客戶清單…</span>;
  return (
    <div style={disabled ? { opacity: 0.4, pointerEvents: "none" } : undefined} aria-disabled={disabled || undefined}>
      <OrgPicker searchPath="/api/video/workbench/bootstrap" orgs={first.orgs} total={first.total} selected={value || null} by="id" searchable={!first.scoped}
        onPick={(org) => { if (org) onChange(org.id); }} />
    </div>
  );
}
