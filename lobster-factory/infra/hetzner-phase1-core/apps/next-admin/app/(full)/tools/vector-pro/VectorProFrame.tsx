"use client";
import { useEffect, useRef, useState } from "react";

// VectorCraft's web build is static files nginx serves at /vector-pro/ (R0-PLAN C2; locally next.config.ts rewrites
// it to VECTOR_PRO_DEV_ORIGIN). NEXT_PUBLIC_* is baked in at build time.
const FRAME_SRC = process.env.NEXT_PUBLIC_VECTOR_PRO_PATH || "/vector-pro/current/index.html?lang=zh-hant";
const NOTICE_HREF = `${FRAME_SRC.split(/[?#]/)[0].replace(/[^/]*$/, "")}NOTICE`;
// Our own dock (public/vector-pro-dock/, served by next-admin). Not under /vector-pro/: nginx's /vector-pro/ location
// answers that whole prefix from the VectorCraft build and would 404 it.
const DOCK_SRC = "/vector-pro-dock/dock.js";
const FALLBACK = "/tools/canvas";

declare global {
  interface Window { __vectorProFrame?: HTMLIFrameElement | null }
}

function hasWebGL2(): boolean {
  try {
    return document.createElement("canvas").getContext("webgl2") !== null;
  } catch {
    return false;
  }
}

export function VectorProFrame() {
  const frame = useRef<HTMLIFrameElement>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (!hasWebGL2()) {
      setFailure("這個瀏覽器不支援 WebGL2，專業版無法啟動。");
      return;
    }
    // An iframe fires no error on a 404, so ask for the entry file first.
    let live = true;
    fetch(FRAME_SRC, { method: "HEAD", cache: "no-store" })
      .then((r) => { if (live && !r.ok) setFailure(`專業版檔案讀不到（HTTP ${r.status}）。`); })
      .catch(() => { if (live) setFailure("專業版檔案讀不到（網路錯誤）。"); });
    // The dock reads the frame from here. Its script may not be deployed yet: a failed load leaves the page as it is.
    window.__vectorProFrame = frame.current;
    const dock = document.createElement("script");
    dock.type = "module";
    dock.src = DOCK_SRC;
    dock.onerror = () => console.warn(`[vector-pro] ${DOCK_SRC} did not load; running without the dock`);
    document.body.appendChild(dock);
    return () => {
      live = false;
      window.__vectorProFrame = null;
      dock.remove();
    };
  }, []);

  // The frame is gone once a failure shows: the dock must not hold a detached element.
  useEffect(() => { if (failure) window.__vectorProFrame = null; }, [failure]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--body-bg)" }}>
      {failure ? (
        <p style={{ flex: 1, margin: 0, padding: 16, color: "var(--text-primary)" }}>
          {failure} 請改用 <a href={FALLBACK} style={{ color: "var(--accent)" }}>Canvas 編輯器</a>。
        </p>
      ) : (
        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
          <iframe
            ref={frame}
            src={FRAME_SRC}
            title="向量（專業版）"
            onError={() => setFailure("專業版載入失敗。")}
            style={{ flex: 1, minWidth: 0, height: "100%", border: "none", display: "block" }}
          />
          <aside id="vector-pro-dock" style={{ flex: "none", height: "100%", overflow: "auto" }} />
        </div>
      )}
      <footer style={{ flex: "none", padding: "2px 8px", fontSize: 11, color: "var(--text-muted)", borderTop: "1px solid var(--card-border)" }}>
        VectorCraft（開源）授權與第三方聲明：<a href={NOTICE_HREF} target="_blank" rel="noopener" style={{ color: "inherit" }}>NOTICE</a>
      </footer>
    </div>
  );
}
