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
import { PRINT_DESTINATIONS, type PrintDestinationId } from "@/lib/studio/print-destinations";
import { isNeutralParams, type ColorGradeParams } from "@/lib/studio/color-grade";
import { CANVAS_STAFF_HREF, openInCanvas } from "@/components/tools/canvas-handoff";
import { useDoorHref } from "@/app/DoorContext";
import {
  buildSemanticFilename,
  buildSemanticBase,
  extOf,
  type SemanticFileMeta,
} from "@/lib/studio/semantic-filename";

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
  /** which studio — tarot uses its fixed card output; POD preserves the generated ratio */
  source: "tarot" | "pod";
  /** derived from useColorGrade(); omitted/neutral → server skips the op */
  colorGrade?: ColorGradeParams;
  /** print destinations to offer; omit/empty → hide the print track */
  printDestinations?: PrintDestinationId[];
  /**
   * Semantic-filename metadata (產品/主圖名稱/風格). When present, downloads are named
   * 產品-主圖名稱-風格-軌.ext instead of the server's fixed preset name. Omit → fixed name.
   */
  fileMeta?: SemanticFileMeta;
  /** When true, the ✏️ 快速編輯 button is hidden (caller renders it separately). */
  hideQuickEdit?: boolean;
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
  fileMeta,
  hideQuickEdit,
}: Props) {
  const canvasHref = useDoorHref(CANVAS_STAFF_HREF);
  const quickEdit = !hideQuickEdit && canvasHref !== null;
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
        // Server returns a fixed name (web-tarot.webp / print-tgc.png …). When the studio
        // supplied fileMeta, re-name client-side to 產品-主圖名稱-風格-軌.ext (a.download wins
        // over the server filename); otherwise keep the server name as-is.
        const fallback = json.filename ?? `output.${track === "web" ? "webp" : "bin"}`;
        const name = fileMeta
          ? buildSemanticFilename(
              { ...fileMeta, track: track === "web" ? "網頁" : "印刷" },
              extOf(json.filename, track === "web" ? "webp" : "bin"),
              fallback,
            )
          : fallback;
        triggerDownload(json.image, name);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(null);
      }
    },
    [image, grade, fileMeta]
  );

  const webPreset = source === "tarot" ? "web-tarot" : "web-original";
  const showPrint = !!printDestinations && printDestinations.length > 0;

  const downloadPng = useCallback(() => {
    const fallback = "output.png";
    const name = fileMeta
      ? buildSemanticFilename({ ...fileMeta, track: "PNG" }, "png", fallback)
      : fallback;
    triggerDownload(image, name);
  }, [image, fileMeta]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Download row: PNG下載 + WebP下載 together */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button className="btn-secondary" disabled={busy !== null} onClick={downloadPng}>
          PNG下載
        </button>
        <button
          className="btn-primary"
          disabled={busy !== null}
          onClick={() => void run({ mode: "web", preset: webPreset }, "web")}
        >
          {busy === "web" ? "輸出中…" : "WebP下載"}
        </button>
      </div>

      {/* Print + quick-edit row */}
      {(showPrint || quickEdit) && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
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

          {quickEdit && (
            <button
              className="btn-secondary"
              disabled={busy !== null}
              onClick={() =>
                openInCanvas(image, fileMeta ? buildSemanticBase({ ...fileMeta, track: "編輯" }) : undefined, canvasHref!)
              }
              title="上傳圖案／加文字／微調構圖"
            >
              ✏️ 快速編輯
            </button>
          )}
        </div>
      )}

      {error ? <span style={{ color: "#e5484d", fontSize: 12 }}>{error}</span> : null}
    </div>
  );
}
