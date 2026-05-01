"use client";

import { useEffect, useRef } from "react";
import {
  groupProject,
  registerOpsSuperProperties,
} from "@/lib/analytics";

/**
 * Registers PostHog groups + per-session ops role super-properties from trusted headers.
 * Must render inside PHProvider (after posthog.init).
 */
export function PostHogAnalytics() {
  const didGroup = useRef(false);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;

    let cancelled = false;
    fetch("/api/ops/analytics-context", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((ctx: { role?: string; source?: string } | null) => {
        if (cancelled || !ctx?.role) return;
        registerOpsSuperProperties(ctx.role, ctx.source ?? "unknown");
        if (!didGroup.current) {
          didGroup.current = true;
          groupProject();
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
