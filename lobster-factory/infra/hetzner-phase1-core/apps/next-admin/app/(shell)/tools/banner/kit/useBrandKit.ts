"use client";
// The organization's banner brand kit through GET/PUT /api/tools/presets/brand-kit (card C6). orgId null = the caller's
// own organization (a customer) or the default organization (staff, 自用). A logo is uploaded to My Designs before the
// kit is saved, so the organization row keeps only its URL.
import { useCallback, useEffect, useState } from "react";
import { saveDesign, saveFailureText } from "@/lib/studio/design-upload";
import type { BrandKit } from "./brand-kit";

const API = "/api/tools/presets/brand-kit";

export type BrandKitState = {
  kit: BrandKit | null;
  /** true = the organization saved this kit; false = built from its brand colours / CIS (or nothing yet). */
  saved: boolean;
  /** Staff owner/admin: may save. A customer and other staff see the kit read-only. */
  canEdit: boolean;
  status: "loading" | "ready" | "saving" | "error";
  error: string | null;
  /** The organization has a logo on another website (CIS): left out of the kit, the panel asks for an upload. */
  externalLogo: boolean;
  save(kit: BrandKit): Promise<boolean>;
  reload(): void;
};

async function dataUrlToBlob(url: string): Promise<Blob> {
  return (await fetch(url)).blob();
}

export function useBrandKit(orgId: string | null): BrandKitState {
  const [kit, setKit] = useState<BrandKit | null>(null);
  const [saved, setSaved] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [status, setStatus] = useState<BrandKitState["status"]>("loading");
  const [error, setError] = useState<string | null>(null);
  const [externalLogo, setExternalLogo] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // the kit always belongs to the organization picked now: the previous one's is dropped before this one loads
    setKit(null); setSaved(false); setCanEdit(false); setExternalLogo(false);
    setStatus("loading");
    setError(null);
    fetch(orgId ? `${API}?orgId=${encodeURIComponent(orgId)}` : API, { credentials: "same-origin" })
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as { ok?: boolean; kit?: BrandKit | null; saved?: boolean; canEdit?: boolean; externalLogo?: boolean; error?: string };
        if (!cancelled) setExternalLogo(!!j.externalLogo);
        if (cancelled) return;
        if (!r.ok || !j.ok) { setKit(null); setStatus("error"); setError(j.error ?? `HTTP ${r.status}`); return; }
        setKit(j.kit ?? null); setSaved(!!j.saved); setCanEdit(!!j.canEdit); setStatus("ready");
      })
      .catch((e) => { if (!cancelled) { setKit(null); setStatus("error"); setError(e instanceof Error ? e.message : String(e)); } });
    return () => { cancelled = true; };
  }, [orgId, tick]);

  const save = useCallback(async (next: BrandKit): Promise<boolean> => {
    setStatus("saving");
    setError(null);
    let logo = next.logo;
    if (logo?.startsWith("data:")) {
      const r = await saveDesign(await dataUrlToBlob(logo), { source: "brand-kit-logo", subject: `${next.name} logo` },
        orgId ? { organizationId: orgId } : {});
      if (!r.ok) { setStatus("error"); setError(saveFailureText(r)); return false; }
      logo = typeof r.asset?.object_url === "string" ? r.asset.object_url : undefined;
    }
    const res = await fetch(API, {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId: orgId ?? undefined, kit: { ...next, logo } }),
    }).catch(() => null);
    const j = (await res?.json().catch(() => ({}))) as { ok?: boolean; kit?: BrandKit; error?: string } | undefined;
    if (!res?.ok || !j?.ok || !j.kit) { setStatus("error"); setError(j?.error ?? `HTTP ${res?.status ?? 0}`); return false; }
    setKit(j.kit); setSaved(true); setStatus("ready");
    return true;
  }, [orgId]);

  return { kit, saved, canEdit, status, error, externalLogo, save, reload: () => setTick((t) => t + 1) };
}
