"use client";

import { useEffect, useRef, useState } from "react";
import { ALL_TOKEN_GROUPS } from "@/lib/theme/tokens";

const TOKEN_NAMES = ALL_TOKEN_GROUPS.flatMap((group) => group.tokens.map((token) => token.name));

export default function AwareWaveThemeFrame({ src, title }: { src: string; title: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [frameSrc, setFrameSrc] = useState<string>();
  const [connected, setConnected] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const target = new URL(src);
    target.searchParams.set("awarewaveParentOrigin", window.location.origin);
    setFrameSrc(target.href);
    setConnected(false);
    const send = () => {
      const style = getComputedStyle(document.documentElement);
      const tokens = Object.fromEntries(TOKEN_NAMES.map((name) => [name, style.getPropertyValue(name).trim()]));
      frame.current?.contentWindow?.postMessage({ channel: "awarewave:theme", tokens }, target.origin);
    };
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.origin !== target.origin) return;
      if (event.data?.channel === "awarewave:theme-ready") send();
      if (event.data?.channel === "awarewave:theme-applied") setConnected(true);
    };
    const observer = new MutationObserver(send);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "class", "data-theme"] });
    window.addEventListener("message", receive);
    window.addEventListener("awarewave:theme-change", send);
    window.addEventListener("themechange", send);
    return () => {
      observer.disconnect();
      window.removeEventListener("message", receive);
      window.removeEventListener("awarewave:theme-change", send);
      window.removeEventListener("themechange", send);
    };
  }, [src, attempt]);

  return (
    <>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
        <span role="status" style={{ color: "var(--text-muted)" }}>
          {connected ? "已連線，外觀由 AwareWave 統一管理。" : "請先執行本機工作台的 start.cmd，再按重新連線。"}
        </span>
        <button className="btn-secondary" onClick={() => setAttempt((value) => value + 1)}>重新連線</button>
      </div>
      {frameSrc && <iframe key={`${frameSrc}:${attempt}`} ref={frame} src={frameSrc} title={title}
        style={{ width: "100%", height: "calc(100dvh - 200px)", minHeight: 600, border: 0, background: "var(--body-bg)" }} />}
    </>
  );
}
