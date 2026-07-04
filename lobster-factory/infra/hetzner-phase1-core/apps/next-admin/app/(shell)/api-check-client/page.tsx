"use client";

import { useEffect, useState } from "react";
import { Events, track } from "@/lib/analytics";

const path = process.env.NEXT_PUBLIC_API_BASE_PATH ?? "/api";

export default function ApiCheckClientPage() {
  const [body, setBody] = useState<string>("loading…");
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    track(Events.API_CHECK_TRIGGERED, { mode: "browser" });
    fetch(`${path}/health`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const success = j.ok === true;
        setOk(success);
        setBody(JSON.stringify(j, null, 2));
        track(success ? Events.API_CHECK_SUCCEEDED : Events.API_CHECK_FAILED, {
          mode: "browser",
        });
      })
      .catch((e) => {
        setOk(false);
        setBody(String(e));
        track(Events.API_CHECK_FAILED, { mode: "browser", error: String(e) });
      });
  }, []);

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">API Health — Browser</span>
        {ok === null ? (
          <span className="card-badge badge-gray">
            <span className="dot dot-yellow" /> Checking…
          </span>
        ) : (
          <span className={`card-badge ${ok ? "badge-green" : "badge-red"}`}>
            <span className={`dot ${ok ? "dot-green" : "dot-red"}`} />
            {ok ? "Online" : "Down"}
          </span>
        )}
      </div>

      <div className="page">
        <p style={{ color: "var(--text-muted)", marginBottom: 16, fontSize: 13 }}>
          Browser fetch via same-origin <code>{path}/health</code> through nginx proxy.
        </p>
        <pre>{body}</pre>
      </div>
    </>
  );
}
