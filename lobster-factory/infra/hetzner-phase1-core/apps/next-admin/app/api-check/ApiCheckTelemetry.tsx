"use client";

import { useEffect, useRef } from "react";
import { Events, track } from "@/lib/analytics";

export function ApiCheckTelemetry({ ok }: { ok: boolean }) {
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    track(Events.API_CHECK_TRIGGERED, { mode: "server" });
    track(ok ? Events.API_CHECK_SUCCEEDED : Events.API_CHECK_FAILED, { mode: "server" });
  }, [ok]);

  return null;
}
