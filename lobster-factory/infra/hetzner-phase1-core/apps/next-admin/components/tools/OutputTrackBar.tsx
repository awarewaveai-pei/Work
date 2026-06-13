"use client";

/**
 * OutputTrackBar [1-g] — the three MVP output tracks below a generated image.
 *
 *   🌐 網頁用   → POST /api/tools/image/process mode=web   → download WebP
 *   🖨 印刷用   → POST … mode=print destination=<id>       → download CMYK PDF / sRGB PNG
 *   ✏️ 快速編輯 → onOpenCanvas() (Fabric.js editor, [1-h/i])
 *
 * The color-grade params are baked server-side (CSS preview is approximate — see
 * ColorGradePanel disclaimer). Neutral grade is omitted from the payload so the server
 * skips the op. Print destinations are a prop: Tarot passes the 4 card specs; POD omits
 * them (card-sized destinations don't fit apparel — POD print is a later slice, not faked).
 */
import { useCallback, useState } from "react";
import { roleHeader } from "@/lib/ops-role";
import { PRINT_DESTINATIONS, type PrintDestinationId } from "@/lib/studio/to-print-file";
import { isNeutralParams, type ColorGradeParams } from "@/lib/studio/color-grade";

type ProcessResponse = {
  ok: boolean;
  image?: string;
  mime?: string;
  filename?: string;
  error?: string;
  code?: string;
};

type Props = {
  /** current image data URL — the source the server re-bakes (grade applied fresh) */
  image: string;
  /** which studio — picks the web preset (tarot keeps 2:3, pod is square) */
  source: "tarot" | "pod";
  /** derived from useColorGrade(); omitted/neutral → server skips the op */
  colorGrade?: ColorGradeParams;
  /** print destinations to offer; omit/empty → hide the print track */
  printDestinations?: PrintDestinationId[];
  /** open the Fabric.js quick editor; omit → button shows 即將推出 */
  onOpenCanvas?: () => void;
};

function triggerDownload(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export default function OutputTrackBar({
  image,
  source,
  colorGrade,
  printDestinations,
  onOpenCanvas,
}: Props) {
  const [busy, setBusy] = useState<null | "web" | "print">(null);
  const [error, setError] = useState<string | null>(null);
  const [destId, setDestId] = useState<PrintDestinationId>(
    printDestinations && printDestinations.length > 0 ? printDestinations[0] : "tw-local"
  );

  const grade = colorGrade && !isNeutralParams(colorGrade) ? colorGrade : undefined;

  const run = useCallback(
    async (body: Record<string, unknown>, track: "web" | "print") => {
      setBusy(track);
      setError(null);
      try {
        const res = await fetch("/api/tools/image/process", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...roleHeader("operator") },
          body: JSON.stringify({ image, colorGrade: grade, ...body }),
        });
        const json = (await res.json()) as ProcessResponse;
        if (!json.ok || !json.image) {
          setError(json.error ?? `HTTP ${res.status}`);
          return;
        }
        triggerDownload(json.image, json.filename ?? `output.${track === "web" ? "webp" : "bin"}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(null);
      }
    },
    [image, grade]
  );

  const webPreset = source === "tarot" ? "web-tarot" : "web-square";
  const showPrint = !!printDestinations && printDestinations.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button
          className="btn-primary"
          disabled={busy !== null}
          onClick={() => void run({ mode: "web", preset: webPreset }, "web")}
        >
          {busy === "web" ? "輸出中…" : "🌐 網頁用 WebP"}
        </button>

        {showPrint ? (
          <>
            <select
              className="btn-secondary"
              value={destId}
              onChange={(e) => setDestId(e.target.value as PrintDestinationId)}
              disabled={busy !== null}
              title="印刷目的地"
            >
              {printDestinations!.map((id) => (
                <option key={id} value={id}>
                  {PRINT_DESTINATIONS[id].label}
                </option>
              ))}
            </select>
            <button
              className="btn-secondary"
              disabled={busy !== null}
              onClick={() => void run({ mode: "print", destination: destId }, "print")}
            >
              {busy === "print" ? "轉檔中…" : "🖨 印刷檔"}
            </button>
          </>
        ) : null}

        {onOpenCanvas ? (
          <button className="btn-secondary" disabled={busy !== null} onClick={onOpenCanvas}>
            ✏️ 快速編輯
          </button>
        ) : (
          <button className="btn-secondary" disabled title="Fabric.js 編輯器即將推出">
            ✏️ 快速編輯（即將推出）
          </button>
        )}
      </div>

      {error ? <span style={{ color: "#e5484d", fontSize: 12 }}>{error}</span> : null}
    </div>
  );
}
