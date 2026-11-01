"use client";
// 主頁 模特 tab: pick several 模特兒圖 from the library (across models, men and women) + the design on the right, and
// composite one product mockup per photo (POST /api/tools/studio/fabric-print: engine ai = gpt-image-2.5 prints the design
// onto the photo following its folds, charged like any generated image; engine code = free displacement preview inside a
// photo's saved print box). The photos themselves are made in 【模特兒印製】 (ModelLibraryStudio).
import { useMemo, useState } from "react";
import { GARMENT_PLACEMENT } from "@/lib/studio/mockup-prompt";
import { STUDIO_MODEL_OPTIONS } from "@/lib/studio/model-options";
import { COLOR_LABEL, GENDER_LABEL, failureText, groupModels, inPairs, readJson, type LibraryPhoto, type Shot } from "./modelLibrary";

const PRINT_COST_NT = STUDIO_MODEL_OPTIONS.find((m) => m.value === "openai-25-edit")?.costNt ?? 2;

export default function ModelMockupPanel({ designRef, photos, onOpenLibrary }: {
  designRef: string | null;
  photos: LibraryPhoto[];
  /** Switches Mockup Studio to 【模特兒印製】. */
  onOpenLibrary: () => void;
}) {
  const models = useMemo(() => groupModels(photos), [photos]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [placement, setPlacement] = useState("center-chest");
  const [designScale, setDesignScale] = useState(100);
  const [results, setResults] = useState<{ photo: LibraryPhoto; engine: "ai" | "code"; shot: Shot; saved?: "saving" | "saved" | "error" }[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  // A photo deleted in 【模特兒印製】 drops out of the pick on its own.
  const pickedPhotos = photos.filter((p) => picked.has(p.id) && p.object_url);
  const boxedPicked = pickedPhotos.filter((p) => p.metadata?.print_box);
  // A new batch replaces the results: never while one is still generating or saving (its answer would land on the new one).
  const running = results.some((r) => r.shot.status === "generating" || r.saved === "saving");
  const toggle = (ids: string[], on: boolean) =>
    setPicked((prev) => { const n = new Set(prev); for (const id of ids) { if (on) n.add(id); else n.delete(id); } return n; });

  async function composite(engine: "ai" | "code") {
    if (!designRef) { setMsg("請先在右邊選一張設計圖"); return; }
    const targets = engine === "code" ? boxedPicked : pickedPhotos;
    if (targets.length === 0) { setMsg(engine === "code" ? "免費預覽只能用已框好印花位置的模特兒圖" : "請先勾選模特兒圖"); return; }
    setMsg(null);
    setResults(targets.map((photo) => ({ photo, engine, shot: { status: "generating" } })));
    await inPairs(targets, async (photo, i) => {
      let shot: Shot;
      try {
        const res = await fetch("/api/tools/studio/fabric-print", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            engine, photo: photo.object_url, design: designRef, designScale: designScale / 100, placement,
            garmentColor: photo.metadata?.garment_color,
            ...(engine === "code" ? { box: photo.metadata!.print_box } : {}),
          }),
        });
        const json = await readJson<{ ok: boolean; image?: string; error?: string; code?: string }>(res);
        shot = json.ok && json.image ? { status: "done", image: json.image } : { status: "error", error: failureText(res, json) };
      } catch (err) { shot = { status: "error", error: err instanceof Error ? err.message : String(err) }; }
      setResults((prev) => prev.map((r) => (r.photo.id === photo.id ? { ...r, shot } : r)));
    });
  }

  async function save(id: string) {
    const item = results.find((r) => r.photo.id === id);
    if (!item || item.shot.status !== "done" || item.saved === "saving" || item.saved === "saved") return;
    const mark = (saved: "saving" | "saved" | "error") => setResults((prev) => prev.map((r) => (r.photo.id === id ? { ...r, saved } : r)));
    mark("saving");
    const res = await fetch("/api/tools/designs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: item.shot.image, prompt: `[mockup:model] ${item.photo.metadata?.preset_name ?? ""}`,
        modelName: item.engine === "ai" ? "openai-25-edit" : "fabric-print", source: "mockup" }),
    }).catch(() => null);
    const ok = res ? ((await res.json().catch(() => ({}))) as { ok?: boolean }).ok === true : false;
    mark(ok ? "saved" : "error");
  }

  const chip = (on: boolean) => (on ? "btn-primary" : "btn-secondary");
  const thumb = { width: 84, height: 126, objectFit: "cover" as const, borderRadius: 4, background: "#111", display: "block" };
  const doneCount = results.filter((r) => r.shot.status === "done" && r.saved !== "saved").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>合成商品 Mockup</h3>
        <div style={{ fontSize: 12, opacity: 0.7 }}>
          勾選模特兒圖（可跨模特兒、男女都行）→ 右邊選設計圖 → 按「合成」：每張模特兒圖出一張穿著設計的商品圖。
        </div>
      </div>
      {msg && <div style={{ color: "var(--red)", fontSize: 13 }}>{msg}</div>}

      {models.length === 0 ? (
        <div style={{ fontSize: 13, opacity: 0.8 }}>
          還沒有模特兒圖。<button className="btn-secondary" style={{ fontSize: 12, marginLeft: 6 }} onClick={onOpenLibrary}>到【模特兒印製】生成</button>
        </div>
      ) : models.map((m) => {
        const ids = m.photos.map((p) => p.id);
        const all = ids.every((id) => picked.has(id));
        return (
          <div key={m.key}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 4 }}>
              <b>{m.name}</b>
              {GENDER_LABEL[m.gender] && <span style={{ fontSize: 11, opacity: 0.7 }}>{GENDER_LABEL[m.gender]}</span>}
              <button className="btn-secondary" style={{ fontSize: 11, padding: "1px 8px" }} onClick={() => toggle(ids, !all)}>{all ? "取消全選" : "全選"}</button>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {m.photos.map((p) => {
                const on = picked.has(p.id);
                return (
                  <label key={p.id} style={{ position: "relative", cursor: "pointer" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.object_url!} alt={m.name} style={{ ...thumb, border: on ? "2px solid var(--accent)" : "2px solid transparent" }} />
                    <input type="checkbox" checked={on} style={{ position: "absolute", top: 4, left: 4 }} onChange={() => toggle([p.id], !on)} />
                    <div style={{ fontSize: 10, textAlign: "center" }}>
                      {p.metadata?.garment_color ? `${COLOR_LABEL[p.metadata.garment_color]}衣` : "照片"}{p.metadata?.print_box ? "・已框" : ""}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}

      {models.length > 0 && (
        <div style={{ fontSize: 13 }}>
          圖案位置（AI 合成用；免費預覽照框的位置）
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
            {GARMENT_PLACEMENT.filter((o) => o.value !== "all-over").map((o) => (
              <button key={o.value} className={chip(placement === o.value)} style={{ fontSize: 11, padding: "2px 8px" }} onClick={() => setPlacement(o.value)}>{o.label}</button>
            ))}
          </div>
          <label style={{ display: "block", marginTop: 8, fontSize: 12 }}>
            設計大小 {designScale}%
            <input type="range" min={40} max={100} step={5} value={designScale} onChange={(e) => setDesignScale(Number(e.target.value))} style={{ width: 180, marginLeft: 6, verticalAlign: "middle" }} />
          </label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            <button className="btn-primary" disabled={pickedPhotos.length === 0 || !designRef || running} onClick={() => void composite("ai")}>
              合成（{pickedPhotos.length} 張，約 NT${Math.round(pickedPhotos.length * PRINT_COST_NT)}）
            </button>
            <button className="btn-secondary" disabled={boxedPicked.length === 0 || !designRef || running} onClick={() => void composite("code")}
              title="不用 AI、不扣點；只用已在【模特兒印製】框好印花位置的圖">
              免費預覽（{boxedPicked.length} 張）
            </button>
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div>
          {doneCount > 1 && (
            <button className="btn-secondary" style={{ fontSize: 12, marginBottom: 8 }} disabled={running}
              onClick={() => { for (const r of results) if (r.shot.status === "done") void save(r.photo.id); }}>
              全部存入 My Designs（{doneCount}）
            </button>
          )}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {results.map((r, i) => (
              <div key={`${r.photo.id}-${i}`} style={{ width: 240 }}>
                {r.shot.status === "generating" && <div style={{ ...thumb, width: 240, height: 360, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>合成中…</div>}
                {r.shot.status === "error" && <div style={{ fontSize: 12, color: "var(--red)" }}>✗ {r.shot.error}</div>}
                {r.shot.status === "done" && (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={r.shot.image} alt="商品 Mockup" style={{ width: 240, borderRadius: 6, display: "block" }} />
                    <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                      <button className="btn-secondary" style={{ fontSize: 11 }} disabled={r.saved === "saving" || r.saved === "saved"} onClick={() => void save(r.photo.id)}>
                        {r.saved === "saved" ? "已存 ✓" : r.saved === "saving" ? "儲存中…" : "存入 My Designs"}
                      </button>
                      <a className="btn-secondary" style={{ fontSize: 11 }} href={r.shot.image} download={`mockup-${r.photo.metadata?.preset_name ?? "model"}-${i + 1}.jpg`}>下載</a>
                    </div>
                    {r.saved === "error" && <div style={{ fontSize: 11, color: "var(--red)" }}>儲存失敗</div>}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
