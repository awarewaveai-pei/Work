"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import "./globals.css";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  // A digest means the error came from the server, which onRequestError (instrumentation.ts)
  // already reported; capturing it again here would double every server event.
  useEffect(() => {
    if (!error.digest) Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="zh-TW">
      <body>
        <main className="card" style={{ maxWidth: 520, margin: "15vh auto", padding: 24 }}>
          <h1 className="section-title">頁面載入時發生錯誤</h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-md)" }}>伺服器產生頁面時發生錯誤，系統已自動通報工程團隊。</p>
          {error.digest && <p style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-sm)" }}>錯誤代碼：{error.digest}</p>}
          <button type="button" className="btn-primary" onClick={() => window.location.reload()}>重新載入</button>
        </main>
      </body>
    </html>
  );
}
