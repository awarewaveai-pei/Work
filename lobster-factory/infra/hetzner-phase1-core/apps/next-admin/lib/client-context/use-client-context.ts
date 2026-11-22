"use client";

// 目前客戶（ADR 020）的 React 介面。頁面呼叫 useClientContext(layer)＝向外框的 ClientContextProvider 登記本頁要哪一層，
// 外框因此知道要不要畫客戶欄（app/ClientRail.tsx）。判斷全在 contract.ts 的 decide()；這裡只接線。
import { createContext, useContext, useEffect } from "react";
import type { DecideStatus, Layer, SiteRow } from "./contract";

/** /api/content/sites 回的一列（ClientRail 只用 id、name、organization_id）。 */
export interface ContextSite extends SiteRow {
  name: string;
}

/** Key of the staff console's origin in `hosts` (no product uses it). */
export const STAFF_HOST_KEY = "staff";

export interface ClientContextValue {
  viewer: "staff" | "client";
  /** 本頁登記的層；null＝本頁不需要客戶，客戶欄不出現。 */
  layer: Layer | null;
  status: DecideStatus;
  org: string | null;
  site: string | null;
  /** 目前客戶的網站列；null＝未載入或尚未選客戶。 */
  sites: readonly ContextSite[] | null;
  /** 網站讀取失敗：清單，或網址指定的那一站（與「這個客戶沒有網站」「找不到」不同）。 */
  sitesFailed: boolean;
  internalOrgId: string | null;
  onDoor: boolean;
  /** 產品 key → https://<host>（伺服器算好傳下，瀏覽器不讀 env）。 */
  hosts: Readonly<Record<string, string>>;
  /** 換客戶：一律清掉 ORG_DEPENDENT_PARAMS。null＝回到未選。 */
  setOrg(org: string | null): void;
  setSite(site: string | null): void;
  /** 內部：登記本頁的層，回傳取消登記。 */
  register(layer: Layer): () => void;
}

export const ClientContext = createContext<ClientContextValue | null>(null);

/** 外框用（不登記）：讀目前狀態。沒有 provider 時回 null。 */
export function useClientContextState(): ClientContextValue | null {
  return useContext(ClientContext);
}

/** 頁面用：登記本頁要 org 或 site 層，並取得目前客戶。必須在 ClientContextProvider 之內。 */
export function useClientContext(layer: Layer): Omit<ClientContextValue, "register"> {
  const ctx = useContext(ClientContext);
  if (!ctx) throw new Error("useClientContext must be used inside ClientContextProvider");
  const { register } = ctx;
  useEffect(() => register(layer), [register, layer]);
  return ctx;
}
