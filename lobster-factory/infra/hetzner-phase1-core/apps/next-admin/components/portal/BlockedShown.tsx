"use client";

import { useEffect } from "react";
import { Events, track, type PlatformEventProps } from "@/lib/analytics";

/** Renders nothing; reports once per mount that a "blocked" state was shown (blocked_shown). */
export function BlockedShown(props: PlatformEventProps["blocked_shown"]) {
  const { state, surface, product_key, feature_key } = props;
  useEffect(() => {
    track(Events.BLOCKED_SHOWN, { state, surface, product_key, feature_key });
  }, [state, surface, product_key, feature_key]);
  return null;
}

/** Right-label codes that mean "you cannot use this" (S1, S2, S7, S8, S9, S11, S12, S14), not a state label. */
export const BLOCKED_CODES: ReadonlySet<string> = new Set(["S1", "S2", "S7", "S8", "S9", "S11", "S12", "S14"]);
