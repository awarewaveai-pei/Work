"use client";
import { useEffect, useRef, useState } from "react";
import "./pro-editor-frame.css";

// One frame for every Craft editor (VectorCraft, PhotoCraft; agency-os/handoffs/2026-11-05-photocraft-pro/R0-PLAN.md C3.1):
// the editor's static web build in an iframe + our dock beside it. The dock's only link to this page is
// window.__proEditor = { editor, frame }; the dock script is a module the page loads and may be missing (it then
// runs without the dock). No theme link: the Craft editors keep their own dark/light (operator 2026-11-06).

export type ProEditorFrameProps = {
  /** Editor id, also handed to the dock ("vectorcraft", "photocraft"). */
  editor: string;
  /** Entry file of the editor's web build (nginx static; locally next.config.ts rewrites it to a dev origin). */
  frameSrc: string;
  /** Our dock module (public/<editor>-dock/dock.js, served by next-admin; not under the build's nginx prefix). */
  dockSrc: string;
  /** id of the empty <aside> the dock mounts into. */
  dockId: string;
  /** Where to send the user when the editor cannot start. */
  fallback: { href: string; label: string };
  /** iframe title. */
  title: string;
  /** Product name in the licence footer ("VectorCraft"). */
  product: string;
};

export type ProEditorLink = { editor: string; frame: HTMLIFrameElement | null };

declare global {
  interface Window { __proEditor?: ProEditorLink | null }
}

function hasWebGL2(): boolean {
  try {
    return document.createElement("canvas").getContext("webgl2") !== null;
  } catch {
    return false;
  }
}

export function ProEditorFrame({ editor, frameSrc, dockSrc, dockId, fallback, title, product }: ProEditorFrameProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const noticeHref = `${frameSrc.split(/[?#]/)[0].replace(/[^/]*$/, "")}NOTICE`;

  useEffect(() => {
    if (!hasWebGL2()) {
      setFailure("這個瀏覽器不支援 WebGL2，專業版無法啟動。");
      return;
    }
    // An iframe fires no error on a 404, so ask for the entry file first.
    let live = true;
    fetch(frameSrc, { method: "HEAD", cache: "no-store" })
      .then((r) => { if (live && !r.ok) setFailure(`專業版檔案讀不到（HTTP ${r.status}）。`); })
      .catch(() => { if (live) setFailure("專業版檔案讀不到（網路錯誤）。"); });
    // The dock reads the frame from here. Its script may not be deployed yet: a failed load leaves the page as it is.
    window.__proEditor = { editor, frame: frame.current };
    const dock = document.createElement("script");
    dock.type = "module";
    dock.src = dockSrc;
    dock.onerror = () => console.warn(`[${editor}] ${dockSrc} did not load; running without the dock`);
    document.body.appendChild(dock);
    return () => {
      live = false;
      window.__proEditor = null;
      dock.remove();
    };
  }, [editor, frameSrc, dockSrc]);

  // The frame is gone once a failure shows: the dock must not hold a detached element.
  useEffect(() => { if (failure) window.__proEditor = null; }, [failure]);

  return (
    <div className="vp-page">
      {failure ? (
        <p className="build-alert build-alert-warning vp-failure">
          {failure} 請改用 <a href={fallback.href}>{fallback.label}</a>。
        </p>
      ) : (
        <div className="vp-stage">
          <iframe
            ref={frame}
            src={frameSrc}
            title={title}
            onError={() => setFailure("專業版載入失敗。")}
            className="vp-frame"
          />
          <aside id={dockId} className="vp-dock" />
        </div>
      )}
      <footer className="form-hint vp-foot">
        {product}（開源）授權與第三方聲明：<a href={noticeHref} target="_blank" rel="noopener">NOTICE</a>
      </footer>
    </div>
  );
}
