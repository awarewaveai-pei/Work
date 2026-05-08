"use client";

// WpUpdateButtons — SSE-streaming WP plugin update buttons (wave1 / wave2 / wave3).
// Rendered only when the parent page detects cfg.ssh_host is present.
// Phase 2c — 2026-05-08

import { useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

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

const WAVE_META: Record<Wave, { label: string; colour: string; borderColour: string; desc: string }> = {
  wave1: {
    label: "Wave 1 — High Risk",
    colour:
      "bg-red-600 hover:bg-red-700 disabled:bg-red-900 text-white",
    borderColour: "border-red-700",
    desc: "WooCommerce / Auth / Payment — one-by-one, stops on failure",
  },
  wave2: {
    label: "Wave 2 — Medium Risk",
    colour:
      "bg-amber-500 hover:bg-amber-600 disabled:bg-amber-800 text-white",
    borderColour: "border-amber-600",
    desc: "Forms / SEO / Caching — one-by-one",
  },
  wave3: {
    label: "Wave 3 — Low Risk",
    colour:
      "bg-green-600 hover:bg-green-700 disabled:bg-green-900 text-white",
    borderColour: "border-green-700",
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
    <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-100 uppercase tracking-wide">
          WP Plugin Updates (SSH)
        </h2>
        {running && (
          <button
            onClick={abort}
            className="text-xs px-2 py-1 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300"
          >
            ⛔ Abort
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
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
              className={`text-xs px-3 py-1.5 rounded font-medium transition-colors ${meta.colour}`}
            >
              {isRunning ? (
                <span className="flex items-center gap-1">
                  <span className="animate-spin">⟳</span> {meta.label}
                </span>
              ) : (
                `${meta.label} (${count})`
              )}
            </button>
          );
        })}
      </div>

      {log.length > 0 && (
        <div
          className={`rounded border ${WAVE_META[running ?? "wave3"].borderColour} bg-black font-mono text-xs text-green-400 p-3 overflow-y-auto`}
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
