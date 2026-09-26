"use client";

// WpUpdateButtons — SSE-streaming WP plugin update buttons (wave1 / wave2 / wave3).
// Rendered only when the parent page detects cfg.ssh_host is present.
// Phase 2c — 2026-05-08

import { useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { blockedChangeMessage } from "@/lib/system-modes/blocked-change";

type Wave = "wave1" | "wave2" | "wave3";
interface WaveConfig {
  wave1?: string[];
  wave2?: string[];
  wave3?: string[];
}

interface Props {
  slug: string;
  waves: WaveConfig;
}

const WAVE_META: Record<Wave, { label: string; desc: string }> = {
  wave1: {
    label: "Wave 1 — High Risk",
    desc: "WooCommerce / Auth / Payment — one-by-one, stops on failure",
  },
  wave2: {
    label: "Wave 2 — Medium Risk",
    desc: "Forms / SEO / Caching — one-by-one",
  },
  wave3: {
    label: "Wave 3 — Low Risk",
    desc: "Utilities / Analytics — batch",
  },
};

export function WpUpdateButtons({ slug, waves }: Props) {
  const router = useRouter();
  const [running, setRunning] = useState<Wave | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  const appendLog = useCallback((line: string) => {
    setLog((prev) => [...prev, line]);
    // auto-scroll to bottom
    setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  const runWave = useCallback(
    async (wave: Wave) => {
      setRunning(wave);
      setLog([`▶ Starting ${wave} update for ${slug}…`]);
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        const resp = await fetch(`/api/ops/clients/${slug}/wp-update?wave=${wave}`, {
          method: "POST",
          signal: ctrl.signal,
        });

        if (resp.status === 423) {
          const info = (await resp.json().catch(() => ({}))) as { mode?: string };
          appendLog(`⛔ ${blockedChangeMessage(info.mode)}`);
          setRunning(null);
          return;
        }

        if (!resp.ok || !resp.body) {
          const text = await resp.text().catch(() => `HTTP ${resp.status}`);
          appendLog(`❌ Error: ${text}`);
          setRunning(null);
          return;
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const payload = line.slice(6).trim();
              if (payload && payload !== "[DONE]") {
                try {
                  const msg = JSON.parse(payload) as { type?: string; message?: string };
                  appendLog(
                    msg.type === "error"
                      ? `❌ ${msg.message ?? payload}`
                      : msg.type === "done"
                        ? `✅ ${msg.message ?? "Done"}`
                        : `   ${msg.message ?? payload}`,
                  );
                } catch {
                  appendLog(`   ${payload}`);
                }
              }
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          appendLog("⛔ Aborted by user");
        } else {
          appendLog(`❌ ${err instanceof Error ? err.message : String(err)}`);
        }
      } finally {
        setRunning(null);
        abortRef.current = null;
        router.refresh();
      }
    },
    [slug, appendLog, router],
  );

  const abort = () => {
    abortRef.current?.abort();
  };

  const pluginCount = (w: Wave) => waves[w]?.length ?? 0;

  return (
    <div className="wp-up-panel">
      <div className="wp-up-head">
        <h2 className="wp-up-title">WP Plugin Updates (SSH)</h2>
        {running && (
          <button onClick={abort} className="wp-up-abort">
            ⛔ Abort
          </button>
        )}
      </div>

      <div className="wp-up-btn-row">
        {(["wave1", "wave2", "wave3"] as Wave[]).map((wave) => {
          const meta = WAVE_META[wave];
          const count = pluginCount(wave);
          const isRunning = running === wave;
          return (
            <button
              key={wave}
              onClick={() => runWave(wave)}
              disabled={running !== null}
              title={meta.desc}
              className={`wp-up-btn wp-up-${wave}`}
            >
              {isRunning ? (
                <>
                  <span className="wp-up-spinner">⟳</span> {meta.label}
                </>
              ) : (
                `${meta.label} (${count})`
              )}
            </button>
          );
        })}
      </div>

      {log.length > 0 && (
        <div
          className={`wp-up-log wp-up-log-${running ?? "wave3"}`}
          style={{ maxHeight: 320 }}
        >
          {log.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
          <div ref={logEndRef} />
        </div>
      )}
    </div>
  );
}
