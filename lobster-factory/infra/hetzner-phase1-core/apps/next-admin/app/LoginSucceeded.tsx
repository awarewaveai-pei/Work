"use client";

import { useEffect } from "react";
import { Events, track } from "@/lib/analytics";

const KEY = "aw_login_pending";

/** Call right before the post-login navigation: the flag survives the full-page reload. */
export function markLoginPending(door: "staff" | "portal" | "product" | "unknown", productKey?: string) {
  try { sessionStorage.setItem(KEY, JSON.stringify({ door, productKey })); } catch { /* storage blocked: no event */ }
}

/** Mounted once in the frame: after the post-login redirect lands, reports login_succeeded once and clears the flag. */
export function LoginSucceeded() {
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (!raw) return;
      sessionStorage.removeItem(KEY);
      const v = JSON.parse(raw) as { door?: string; productKey?: string };
      const door = v.door === "portal" || v.door === "product" || v.door === "unknown" ? v.door : "staff";
      track(Events.LOGIN_SUCCEEDED, { door, product_key: typeof v.productKey === "string" ? v.productKey : undefined });
    } catch { /* unreadable flag: no event */ }
  }, []);
  return null;
}
