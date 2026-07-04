"use client";

import { useEffect, useRef } from "react";
import { Events, track } from "@/lib/analytics";

export function OpsConsoleTelemetry() {
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    track(Events.OPS_CONSOLE_VIEWED);
  }, []);

  return null;
}
