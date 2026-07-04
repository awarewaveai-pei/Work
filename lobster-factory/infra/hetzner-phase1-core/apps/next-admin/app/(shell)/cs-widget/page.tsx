"use client";

// /cs-widget — local demo mount of the headless 清新自然 widget driven by MockTransport (no Chatwoot
// backend needed). Lets us render + click-test the UI before the carrier is deployed (U6). Swap
// MockTransport → ChatwootTransport(config) once Chatwoot is up to wire it live.

import { useMemo, useState } from "react";
import { CsWidget } from "./CsWidget";
import { MockTransport } from "@/lib/cs-widget/mock-transport";
import { DEFAULT_SEED } from "@/lib/cs-widget/theme";
import type { WidgetConfig } from "@/lib/cs-widget/types";

const SEEDS = [
  ["晨間鼠尾草", "#547C65"], ["海潮藍", "#3D6E8C"], ["赤陶土", "#B5603F"],
  ["李紫", "#7A5A86"], ["蜜橙", "#C08A3E"],
] as const;

export default function CsWidgetDemo() {
  const [seed, setSeed] = useState<string>(DEFAULT_SEED);
  const [mode, setMode] = useState<"light" | "dark">("light");
  // New transport instance per seed/mode so the conversation restarts cleanly.
  const transport = useMemo(() => new MockTransport(), [seed, mode]);
  const config: WidgetConfig = { baseUrl: "", inboxIdentifier: "demo", brandSeed: seed, mode, personaName: "AwareWave 小幫手" };

  return (
    <div style={{ minHeight: "100vh", padding: 32, display: "flex", gap: 32, flexWrap: "wrap", alignItems: "flex-start" }}>
      <div style={{ maxWidth: 320 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>客服 widget 預覽（MockTransport）</h1>
        <p style={{ fontSize: 13, color: "var(--text-muted, #888)", lineHeight: 1.7, marginTop: 8 }}>
          headless 清新自然 widget，CIS 品牌色自動配色。此頁用本地腳本 bot；接上 Chatwoot（U6）後改用 ChatwootTransport 即 live。
        </p>
        <div style={{ marginTop: 16, fontSize: 13 }}>品牌色</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
          {SEEDS.map(([name, hex]) => (
            <button key={hex} onClick={() => setSeed(hex)}
              style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, padding: "5px 10px", borderRadius: 9999, border: seed === hex ? "2px solid #555" : "1px solid #ccc", background: "transparent", cursor: "pointer" }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: hex }} />{name}
            </button>
          ))}
        </div>
        <div style={{ marginTop: 14, fontSize: 13 }}>模式</div>
        <div style={{ display: "inline-flex", gap: 4, marginTop: 6 }}>
          {(["light", "dark"] as const).map((mo) => (
            <button key={mo} onClick={() => setMode(mo)}
              style={{ fontSize: 12, padding: "5px 12px", borderRadius: 9999, border: mode === mo ? "2px solid #555" : "1px solid #ccc", background: "transparent", cursor: "pointer" }}>
              {mo === "light" ? "淺色" : "深色"}
            </button>
          ))}
        </div>
      </div>

      <CsWidget key={`${seed}-${mode}`} transport={transport} config={config} />
    </div>
  );
}
