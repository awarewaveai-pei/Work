"use client";

import { useEffect, useRef } from "react";
import { Events, track } from "@/lib/analytics";

export function OpsInboxTelemetry() {
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    track(Events.OPS_INBOX_VIEWED);
  }, []);

  return null;
}
