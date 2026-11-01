"use client";
// 模特兒印製: a library of saved models (plain-garment photos grouped by metadata.model_key) and a code print of one
// design onto any photos picked across models (POST /api/tools/studio/fabric-print: engine ai = gpt-image-2.5 edit, charged
// like any generated image; engine code = free displacement preview inside a saved print box). Building the library calls AI: a 4-angle identity sheet per new model, then plain pose photos that use the model's photos as
// references. Plan: agency-os/docs/operations/MOCKUP_FIXED_MODEL_PLAN.md.
import { useMemo, useRef, useState } from "react";
import {
  MODEL_AGES,
  MODEL_ETHNICITIES,
  MODEL_LIGHTING,
  MODEL_POSES,
  MODEL_SCENES,
  MODEL_SHEET_ANGLES,
  buildModelSheetPrompt,
  buildPlainPosePrompt,
  type GarmentColor,
} from "@/lib/studio/mockup-prompt";
import { STUDIO_MODEL_OPTIONS } from "@/lib/studio/model-options";
import { isPrintBox, type Point, type PrintBox } from "@/lib/studio/fabric-print";

export interface LibraryPhoto {
  id: string;
  object_url: string | null;
  asset_domain: "mockup_model_preset" | "mockup_product_preset";
  metadata: {
    preset_name?: string | null;
    preset_settings?: Record<string, string> | null;
    model_key?: string;
    photo_role?: string;
    garment_color?: string;
    print_box?: PrintBox;
  } | null;
}

export interface Model { key: string; name: string; gender: string; photos: LibraryPhoto[] }
type Shot = { status: "generating" } | { status: "done"; image: string } | { status: "error"; error: string };

// Generation always uses nano-banana-2: it takes up to 14 reference images (lib/studio/model-options.ts).
const GEN_MODEL = "nano-banana-2";
const PRINT_COST_NT = STUDIO_MODEL_OPTIONS.find((m) => m.value === "openai-25-edit")?.costNt ?? 2;
const MAX_IDENTITY_REFS = 14;
const ROLE_LABEL: Record<string, string> = {
  ...Object.fromEntries(MODEL_SHEET_ANGLES.map((a) => [a.role, a.label])), pose: "姿勢", upload: "上傳",
};
const COLOR_LABEL: Record<string, string> = { white: "白", grey: "灰", black: "黑" };
const GENDER_LABEL: Record<string, string> = { woman: "女", man: "男", "androgynous person": "中性" };
const DEFAULT_BOX: PrintBox = { x: 0.32, y: 0.3, w: 0.36, h: 0.32 };
type Quad = [Point, Point, Point, Point];
const quadOf = (b: PrintBox): Quad => b.quad ?? [
  { x: b.x, y: b.y }, { x: b.x + b.w, y: b.y }, { x: b.x + b.w, y: b.y + b.h }, { x: b.x, y: b.y + b.h },
];
/** The saved form: the quad plus its bounding rectangle (the server caps work by the rectangle). */
function boxOf(q: Quad): PrintBox {
  const xs = q.map((p) => p.x);
  const ys = q.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y, quad: q };
}
const CORNER_LABEL = ["左上", "右上", "右下", "左下"];

export function groupModels(photos: LibraryPhoto[]): Model[] {
  const byKey = new Map<string, Model>();
  for (const p of photos) {
    if (!p.object_url) continue;
    const key = p.metadata?.model_key ?? p.id; // a row saved before model_key existed is a one-photo model
    const m = byKey.get(key) ?? { key, name: p.metadata?.preset_name ?? "模特兒", gender: "", photos: [] };
    m.gender ||= p.metadata?.preset_settings?.mGender ?? "";
    m.photos.push(p);
    byKey.set(key, m);
  }
  return [...byKey.values()];
}

async function generateImage(prompt: string, referenceImages: string[]): Promise<Shot> {
  try {
    const res = await fetch("/api/tools/studio/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: GEN_MODEL, prompt, referenceImages, aspectRatio: "2:3" }),
    });
    const json = (await res.json()) as { ok: boolean; image?: string; error?: string };
    return json.ok && json.image ? { status: "done", image: json.image } : { status: "error", error: json.error ?? `HTTP ${res.status}` };
  } catch (err) {
    return { status: "error", error: err instanceof Error ? err.message : String(err) };
  }
}

/** Runs `jobs` two at a time, reporting each as it lands (same pace as Mockup Studio's Printful batch). */
async function inPairs<T>(items: T[], run: (item: T, i: number) => Promise<void>) {
  for (let i = 0; i < items.length; i += 2) await Promise.all(items.slice(i, i + 2).map((it, j) => run(it, i + j)));
}

export default function ModelLibraryStudio({ designRef, photos, setPhotos, onDeleted }: {
  designRef: string | null;
  photos: LibraryPhoto[];
  setPhotos: (update: (prev: LibraryPhoto[]) => LibraryPhoto[]) => void;
  /** A deleted photo may be the 模特 tab's fixed model; the parent drops it there too. */
  onDeleted: (id: string) => void;
}) {
  const models = useMemo(() => groupModels(photos.filter((p) => p.asset_domain === "mockup_model_preset")), [photos]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const active = models.find((m) => m.key === activeKey) ?? null;
  const [msg, setMsg] = useState<string | null>(null);

  // ── New model (4-angle sheet) ──
  const [newName, setNewName] = useState("");
  const [newGender, setNewGender] = useState("woman");
  const [newEthnicity, setNewEthnicity] = useState("East Asian");
  const [newAge, setNewAge] = useState("in their 20s");
  const [sheetColor, setSheetColor] = useState<GarmentColor>("white");
  const [sheet, setSheet] = useState<Shot[]>([]);
  const [busy, setBusy] = useState(false);

  async function makeSheet() {
    if (busy) return;
    setBusy(true); setMsg(null);
    const desc = [newEthnicity, newGender, newAge].filter(Boolean).join(", ");
    setSheet(MODEL_SHEET_ANGLES.map(() => ({ status: "generating" })));
    await inPairs([...MODEL_SHEET_ANGLES], async (a, i) => {
      const shot = await generateImage(buildModelSheetPrompt({ role: a.role, modelDescription: desc, ageGroup: "adult", color: sheetColor }), []);
      setSheet((prev) => prev.map((s, k) => (k === i ? shot : s)));
    });
    setBusy(false);
  }

  async function savePhoto(image: string, fields: Record<string, unknown>): Promise<LibraryPhoto | null> {
    const res = await fetch("/api/tools/presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image, presetType: "model", ...fields }),
    }).catch(() => null);
    const json = res ? ((await res.json().catch(() => ({}))) as { ok?: boolean; preset?: LibraryPhoto; error?: string }) : {};
    if (!json.ok || !json.preset) { setMsg(`儲存失敗：${json.error ?? "網路錯誤"}`); return null; }
    return json.preset;
  }

  async function saveSheet() {
    const name = newName.trim();
    if (!name) { setMsg("請先幫模特兒取名字"); return; }
    const done = sheet.map((s, i) => (s.status === "done" ? { image: s.image, role: MODEL_SHEET_ANGLES[i].role } : null)).filter(Boolean) as { image: string; role: string }[];
    if (done.length === 0) return;
    setBusy(true);
    const modelKey = crypto.randomUUID();
    const saved: LibraryPhoto[] = [];
    const savedImages = new Set<string>();
    for (const d of done) {
      const p = await savePhoto(d.image, {
        presetName: name, modelKey, photoRole: d.role, garmentColor: sheetColor,
        presetSettings: { mGender: newGender, mEthnicity: newEthnicity, mAge: newAge },
      });
      if (p) { saved.push(p); savedImages.add(d.image); }
    }
    setPhotos((prev) => [...saved, ...prev]);
    // Keep what failed to save on screen: those images were paid for.
    const left = sheet.filter((s) => !(s.status === "done" && savedImages.has(s.image)));
    if (saved.length) setActiveKey(modelKey);
    if (left.every((s) => s.status !== "done")) { setSheet([]); setNewName(""); } else setSheet(left);
    setBusy(false);
  }

  // ── Pose photos for the active model ──
  const [poses, setPoses] = useState<Set<string>>(new Set(["standing"]));
  const [scene, setScene] = useState(MODEL_SCENES[0].value);
  const [lighting, setLighting] = useState(MODEL_LIGHTING[0].value);
  const [poseColor, setPoseColor] = useState<GarmentColor>("white");
  const [poseShots, setPoseShots] = useState<{ pose: string; shot: Shot; keep: boolean }[]>([]);

  async function makePoses() {
    if (!active || busy || poses.size === 0) return;
    setBusy(true); setMsg(null);
    // The sheet angles first (cleanest identity), then the newest others, within the model's reference limit.
    const refs = [...active.photos]
      .sort((a, b) => Number(!(a.metadata?.photo_role ?? "").startsWith("face-")) - Number(!(b.metadata?.photo_role ?? "").startsWith("face-")))
      .map((p) => p.object_url!).slice(0, MAX_IDENTITY_REFS);
    const list = [...poses];
    setPoseShots(list.map((pose) => ({ pose, shot: { status: "generating" }, keep: true })));
    await inPairs(list, async (pose, i) => {
      const shot = await generateImage(buildPlainPosePrompt({ pose, scene, lighting, color: poseColor }), refs);
      setPoseShots((prev) => prev.map((s, k) => (k === i ? { ...s, shot } : s)));
    });
    setBusy(false);
  }

  async function savePoses() {
    if (!active) return;
    setBusy(true);
    const saved: LibraryPhoto[] = [];
    const savedIdx = new Set<number>();
    for (const [i, s] of poseShots.entries()) {
      if (!s.keep || s.shot.status !== "done") continue;
      const p = await savePhoto(s.shot.image, {
        presetName: active.name, modelKey: active.key, photoRole: "pose", garmentColor: poseColor,
        presetSettings: { mGender: active.gender, pose: s.pose, scene },
      });
      if (p) { saved.push(p); savedIdx.add(i); }
    }
    setPhotos((prev) => [...saved, ...prev]);
    // Keep what failed to save on screen: those images were paid for.
    setPoseShots((prev) => prev.filter((_, i) => !savedIdx.has(i)));
    setBusy(false);
  }

  const uploadRef = useRef<HTMLInputElement>(null);
  async function uploadPhoto(file: File | undefined) {
    if (!active || !file) return;
    const image = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(new Error("read_failed"));
      r.readAsDataURL(file);
    }).catch(() => null);
    if (!image) { setMsg("讀不到這張照片"); return; }
    const p = await savePhoto(image, { presetName: active.name, modelKey: active.key, photoRole: "upload", presetSettings: { mGender: active.gender } });
    if (p) setPhotos((prev) => [p, ...prev]);
  }

  async function deletePhotos(list: LibraryPhoto[]): Promise<boolean> {
    for (const p of list) {
      const res = await fetch(`/api/tools/presets?id=${p.id}`, { method: "DELETE" }).catch(() => null);
      if (!res?.ok) { setMsg("刪除失敗，請重試"); return false; }
      setPhotos((prev) => prev.filter((x) => x.id !== p.id));
      onDeleted(p.id);
      setPicked((prev) => { const n = new Set(prev); n.delete(p.id); return n; });
    }
    return true;
  }

  // ── Print box editor ──
  const [boxPhoto, setBoxPhoto] = useState<LibraryPhoto | null>(null);
  const [draft, setDraft] = useState<Quad | null>(null);
  // Dragging on the photo draws a new upright box; dragging a corner handle moves just that corner (a tilted torso).
  const drag = useRef<{ kind: "draw"; from: Point } | { kind: "corner"; index: number } | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const pointAt = (e: React.PointerEvent) => {
    const r = frame.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  async function saveBox() {
    if (!boxPhoto || !draft) return;
    const printBox = boxOf(draft);
    if (!isPrintBox(printBox)) { setMsg("四個角拉成交叉或太小了，請重拉"); return; }
    const res = await fetch(`/api/tools/presets?id=${boxPhoto.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ printBox }),
    }).catch(() => null);
    const json = res ? ((await res.json().catch(() => ({}))) as { ok?: boolean; preset?: LibraryPhoto; error?: string }) : {};
    if (!json.ok || !json.preset) { setMsg(`印花框儲存失敗：${json.error ?? "網路錯誤"}`); return; }
    setPhotos((prev) => prev.map((p) => (p.id === json.preset!.id ? json.preset! : p)));
    setBoxPhoto(null);
  }

  // ── Print (code, free) ──
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [designScale, setDesignScale] = useState(100);
  const [prints, setPrints] = useState<{ photo: LibraryPhoto; shot: Shot; saved?: "saving" | "saved" | "error" }[]>([]);
  const pickedPhotos = photos.filter((p) => picked.has(p.id) && p.object_url);
  // The free code preview needs a saved print outline; the AI print places the design itself.
  const boxedPicked = pickedPhotos.filter((p) => p.metadata?.print_box);

  async function printAll(engine: "ai" | "code") {
    if (!designRef) { setMsg("請先在右邊選一張設計圖"); return; }
    const targets = engine === "code" ? boxedPicked : pickedPhotos;
    if (targets.length === 0) { setMsg(engine === "code" ? "免費預覽只能印已框好印花位置的照片" : "請先勾選照片"); return; }
    setMsg(null);
    setPrints(targets.map((photo) => ({ photo, shot: { status: "generating" } })));
    await inPairs(targets, async (photo, i) => {
      let shot: Shot;
      try {
        const res = await fetch("/api/tools/studio/fabric-print", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            engine, photo: photo.object_url, design: designRef, designScale: designScale / 100,
            garmentColor: photo.metadata?.garment_color,
            ...(engine === "code" ? { box: photo.metadata!.print_box } : {}),
          }),
        });
        const json = (await res.json()) as { ok: boolean; image?: string; error?: string; code?: string };
        // withFeature refuses with { ok:false, code } and no message (lib/entitlements/grant.ts).
        const why = json.error ?? (res.status === 403 ? `沒有使用權限（${json.code ?? "403"}）` : `HTTP ${res.status}`);
        shot = json.ok && json.image ? { status: "done", image: json.image } : { status: "error", error: why };
      } catch (err) { shot = { status: "error", error: err instanceof Error ? err.message : String(err) }; }
      setPrints((prev) => prev.map((p, k) => (k === i ? { ...p, shot } : p)));
    });
  }

  async function saveToDesigns(i: number) {
    const item = prints[i];
    if (item.shot.status !== "done") return;
    setPrints((prev) => prev.map((p, k) => (k === i ? { ...p, saved: "saving" } : p)));
    const res = await fetch("/api/tools/designs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: item.shot.image, prompt: `[mockup:fabric-print] ${item.photo.metadata?.preset_name ?? ""}`, modelName: "fabric-print", source: "mockup" }),
    }).catch(() => null);
    const ok = res ? ((await res.json().catch(() => ({}))) as { ok?: boolean }).ok === true : false;
    setPrints((prev) => prev.map((p, k) => (k === i ? { ...p, saved: ok ? "saved" : "error" } : p)));
  }

  const chip = (on: boolean) => (on ? "btn-primary" : "btn-secondary");
  const thumb = { width: 72, height: 108, objectFit: "cover" as const, borderRadius: 4, background: "#111", display: "block" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {msg && <div style={{ color: "var(--red)", fontSize: 13 }}>{msg}</div>}

      {/* ── 1. Pick photos across models, print the design (free) ── */}
      <section>
        <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>印製</h3>
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
          勾選要用的照片（可跨模特兒、男女都行）→ 右邊選設計圖 → 按「印上設計」。AI 印會跟著皺褶和身體，每張約 NT$2；免費預覽是程式印，要先在「管理」裡框印花位置。
        </div>
        {models.length === 0 && <p style={{ fontSize: 13, opacity: 0.6 }}>還沒有模特兒，先在下方建立一位。</p>}
        {models.map((m) => (
          <div key={m.key} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 4 }}>
              <b>{m.name}</b>
              {GENDER_LABEL[m.gender] && <span style={{ fontSize: 11, opacity: 0.7 }}>{GENDER_LABEL[m.gender]}</span>}
              <span style={{ fontSize: 11, opacity: 0.5 }}>{m.photos.length} 張</span>
              <button className={chip(activeKey === m.key)} style={{ fontSize: 11, padding: "1px 8px" }} onClick={() => setActiveKey(activeKey === m.key ? null : m.key)}>
                {activeKey === m.key ? "管理中" : "管理"}
              </button>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {m.photos.map((p) => {
                const boxed = !!p.metadata?.print_box;
                const on = picked.has(p.id);
                return (
                  <label key={p.id} style={{ position: "relative", cursor: "pointer" }} title={boxed ? "勾選來印" : "可 AI 印；免費預覽要先在「管理」框印花位置"}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.object_url!} alt={m.name} style={{ ...thumb, border: on ? "2px solid var(--accent)" : "2px solid transparent" }} />
                    <input type="checkbox" checked={on} style={{ position: "absolute", top: 4, left: 4 }}
                      onChange={() => setPicked((prev) => { const n = new Set(prev); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })} />
                    <div style={{ fontSize: 10, textAlign: "center" }}>
                      {ROLE_LABEL[p.metadata?.photo_role ?? ""] ?? "照片"}{p.metadata?.garment_color ? `・${COLOR_LABEL[p.metadata.garment_color]}` : ""}{boxed ? "" : "・未框"}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 6 }}>
          <label style={{ fontSize: 12 }}>
            設計大小 {designScale}%
            <input type="range" min={40} max={100} step={5} value={designScale} onChange={(e) => setDesignScale(Number(e.target.value))} style={{ width: 160, marginLeft: 6, verticalAlign: "middle" }} />
          </label>
          <button className="btn-primary" disabled={pickedPhotos.length === 0 || !designRef || prints.some((p) => p.shot.status === "generating")} onClick={() => void printAll("ai")}>
            印上設計（AI，{pickedPhotos.length} 張，約 NT${(pickedPhotos.length * PRINT_COST_NT).toFixed(0)}）
          </button>
          <button className="btn-secondary" disabled={boxedPicked.length === 0 || !designRef || prints.some((p) => p.shot.status === "generating")} onClick={() => void printAll("code")}
            title={boxedPicked.length < pickedPhotos.length ? `${pickedPhotos.length - boxedPicked.length} 張沒框印花位置，免費預覽會跳過` : undefined}>
            免費預覽（程式印，{boxedPicked.length} 張）
          </button>
        </div>
        {prints.length > 0 && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
            {prints.map((p, i) => (
              <div key={`${p.photo.id}-${i}`} style={{ width: 220 }}>
                {p.shot.status === "generating" && <div style={{ ...thumb, width: 220, height: 330, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>印製中…</div>}
                {p.shot.status === "error" && <div style={{ fontSize: 12, color: "var(--red)" }}>✗ {p.shot.error}</div>}
                {p.shot.status === "done" && (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.shot.image} alt="印製結果" style={{ width: 220, borderRadius: 6, display: "block" }} />
                    <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                      <button className="btn-secondary" style={{ fontSize: 11 }} disabled={p.saved === "saving" || p.saved === "saved"} onClick={() => void saveToDesigns(i)}>
                        {p.saved === "saved" ? "已存 ✓" : p.saved === "saving" ? "儲存中…" : "存入 My Designs"}
                      </button>
                      <a className="btn-secondary" style={{ fontSize: 11 }} href={p.shot.image} download={`print-${p.photo.metadata?.preset_name ?? "model"}-${i + 1}.jpg`}>下載</a>
                    </div>
                    {p.saved === "error" && <div style={{ fontSize: 11, color: "var(--red)" }}>儲存失敗</div>}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── 2. Manage the active model: print boxes, new pose photos, uploads ── */}
      {active && (
        <section style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>管理：{active.name}</h3>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>點照片 → 在照片上拖一個框，標出印花位置。每張照片只要框一次。</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {active.photos.map((p) => (
              <div key={p.id} style={{ position: "relative", cursor: "pointer" }} onClick={() => { setBoxPhoto(p); setDraft(quadOf(p.metadata?.print_box ?? DEFAULT_BOX)); }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.object_url!} alt={active.name} style={{ ...thumb, border: boxPhoto?.id === p.id ? "2px solid var(--accent)" : "2px solid transparent" }} />
                <button style={{ position: "absolute", top: 0, right: 0, fontSize: 9, background: "var(--red)", color: "var(--btn-primary-text)", border: "none", borderRadius: 2, cursor: "pointer", padding: "1px 3px" }}
                  onClick={(e) => { e.stopPropagation(); if (window.confirm("刪除這張照片？")) void deletePhotos([p]); }}>✕</button>
              </div>
            ))}
          </div>

          {boxPhoto && draft && (
            <div style={{ marginTop: 10 }}>
              <div
                ref={frame}
                style={{ position: "relative", display: "inline-block", touchAction: "none", cursor: "crosshair", userSelect: "none" }}
                onPointerDown={(e) => {
                  const handle = (e.target as HTMLElement).dataset.corner;
                  drag.current = handle !== undefined ? { kind: "corner", index: Number(handle) } : { kind: "draw", from: pointAt(e) };
                  frame.current?.setPointerCapture?.(e.pointerId);
                }}
                onPointerMove={(e) => {
                  const d = drag.current;
                  if (!d) return;
                  const b = pointAt(e); // already clamped to the photo
                  if (d.kind === "corner") {
                    setDraft((q) => (q ? (q.map((p, i) => (i === d.index ? b : p)) as Quad) : q));
                    return;
                  }
                  const a = d.from;
                  const x = Math.min(0.97, Math.min(a.x, b.x));
                  const y = Math.min(0.97, Math.min(a.y, b.y));
                  const w = Math.min(1 - x, Math.max(0.03, Math.abs(b.x - a.x)));
                  const h = Math.min(1 - y, Math.max(0.03, Math.abs(b.y - a.y)));
                  setDraft(quadOf({ x, y, w, h }));
                }}
                onPointerUp={() => { drag.current = null; }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={boxPhoto.object_url!} alt="框印花位置" draggable={false} style={{ maxHeight: 520, maxWidth: "100%", display: "block", borderRadius: 6 }} />
                <svg viewBox="0 0 1 1" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
                  <polygon points={draft.map((p) => `${p.x},${p.y}`).join(" ")} fill="rgba(255,255,255,0.15)" stroke="var(--accent)" strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
                </svg>
                {draft.map((p, i) => (
                  <div key={i} data-corner={i} title={`拖曳${CORNER_LABEL[i]}角`}
                    style={{ position: "absolute", left: `${p.x * 100}%`, top: `${p.y * 100}%`, width: 16, height: 16, marginLeft: -8, marginTop: -8, borderRadius: "50%", background: "var(--accent)", border: "2px solid #fff", cursor: "move" }} />
                ))}
              </div>
              <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>在照片上拖曳 = 畫新框；拖四個圓點 = 調整角度（身體斜的、轉身的，讓框貼著胸口的斜度）。</div>
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <button className="btn-primary" onClick={() => void saveBox()}>儲存印花框</button>
                <button className="btn-secondary" onClick={() => setBoxPhoto(null)}>取消</button>
              </div>
            </div>
          )}

          <div style={{ marginTop: 12, fontSize: 13 }}>
            <b>加姿勢照</b>（AI 生成，每張約 NT$2.2；用這位模特兒所有照片當長相參考，衣服是素色）
            <div style={{ fontSize: 12, marginTop: 6 }}>姿勢（可複選）</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 2 }}>
              {MODEL_POSES.filter((p) => !p.occludes).map((p) => (
                <button key={p.value} className={chip(poses.has(p.value))} style={{ fontSize: 11, padding: "2px 8px" }}
                  onClick={() => setPoses((prev) => { const n = new Set(prev); if (n.has(p.value)) n.delete(p.value); else n.add(p.value); return n; })}>{p.label}</button>
              ))}
            </div>
            <div style={{ fontSize: 12, marginTop: 6 }}>場景</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 2 }}>
              {MODEL_SCENES.map((s) => <button key={s.value} className={chip(scene === s.value)} style={{ fontSize: 11, padding: "2px 8px" }} onClick={() => setScene(s.value)}>{s.label}</button>)}
            </div>
            <div style={{ fontSize: 12, marginTop: 6 }}>光線</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 2 }}>
              {MODEL_LIGHTING.map((s) => <button key={s.value} className={chip(lighting === s.value)} style={{ fontSize: 11, padding: "2px 8px" }} onClick={() => setLighting(s.value)}>{s.label}</button>)}
            </div>
            <div style={{ fontSize: 12, marginTop: 6 }}>衣服顏色</div>
            <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
              {(["white", "grey", "black"] as const).map((c) => <button key={c} className={chip(poseColor === c)} style={{ fontSize: 11 }} onClick={() => setPoseColor(c)}>{COLOR_LABEL[c]}</button>)}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
              <button className="btn-primary" disabled={busy || poses.size === 0} onClick={() => void makePoses()}>
                生成 {poses.size} 張姿勢照（約 NT${(poses.size * 2.2).toFixed(1)}）
              </button>
              <button className="btn-secondary" onClick={() => uploadRef.current?.click()}>上傳自己的照片（免費）</button>
              <input ref={uploadRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: "none" }}
                onChange={(e) => { void uploadPhoto(e.target.files?.[0]); e.target.value = ""; }} />
              <button className="btn-secondary" style={{ color: "var(--red)" }}
                onClick={() => { if (window.confirm(`刪除模特兒「${active.name}」和他的 ${active.photos.length} 張照片？`)) void deletePhotos(active.photos).then((ok) => { if (ok) setActiveKey(null); }); }}>
                刪除這位模特兒
              </button>
            </div>
            {poseShots.length > 0 && (
              <>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                  {poseShots.map((s, i) => (
                    <label key={i} style={{ position: "relative", cursor: "pointer" }}>
                      {s.shot.status === "done"
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={s.shot.image} alt={s.pose} style={{ ...thumb, width: 120, height: 180, border: s.keep ? "2px solid var(--accent)" : "2px solid transparent" }} />
                        : <div style={{ ...thumb, width: 120, height: 180, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: s.shot.status === "error" ? "var(--red)" : undefined }}>
                            {s.shot.status === "error" ? `✗ ${s.shot.error}` : "生成中…"}
                          </div>}
                      {s.shot.status === "done" && (
                        <input type="checkbox" checked={s.keep} style={{ position: "absolute", top: 4, left: 4 }}
                          onChange={() => setPoseShots((prev) => prev.map((x, k) => (k === i ? { ...x, keep: !x.keep } : x)))} />
                      )}
                      <div style={{ fontSize: 10, textAlign: "center" }}>{MODEL_POSES.find((p) => p.value === s.pose)?.label}</div>
                    </label>
                  ))}
                </div>
                <button className="btn-primary" style={{ marginTop: 6 }} disabled={busy || !poseShots.some((s) => s.keep && s.shot.status === "done")} onClick={() => void savePoses()}>
                  勾選的存進 {active.name}
                </button>
              </>
            )}
          </div>
        </section>
      )}

      {/* ── 3. New model: 4-angle identity sheet ── */}
      <section style={{ borderTop: "1px solid var(--border)", paddingTop: 12, fontSize: 13 }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>建立新模特兒</h3>
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>AI 一次生成 4 個角度（正面、左斜、右斜、側面），素色衣服，約 NT$8.8。之後這 4 張就是他的長相依據。</div>
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="名字，例如 Leo" maxLength={40}
          style={{ padding: "4px 8px", background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6 }} />
        <div style={{ fontSize: 12, marginTop: 6 }}>性別</div>
        <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
          {[["woman", "女"], ["man", "男"], ["androgynous person", "中性"]].map(([v, l]) => <button key={v} className={chip(newGender === v)} style={{ fontSize: 11 }} onClick={() => setNewGender(v)}>{l}</button>)}
        </div>
        <div style={{ fontSize: 12, marginTop: 6 }}>族裔</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 2 }}>
          {MODEL_ETHNICITIES.filter((o) => o.value).map((o) => <button key={o.value} className={chip(newEthnicity === o.value)} style={{ fontSize: 11, padding: "2px 8px" }} onClick={() => setNewEthnicity(o.value)}>{o.label}</button>)}
        </div>
        <div style={{ fontSize: 12, marginTop: 6 }}>年齡</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 2 }}>
          {MODEL_AGES.filter((o) => o.value && o.value !== "teenager").map((o) => <button key={o.value} className={chip(newAge === o.value)} style={{ fontSize: 11, padding: "2px 8px" }} onClick={() => setNewAge(o.value)}>{o.label}</button>)}
        </div>
        <div style={{ fontSize: 12, marginTop: 6 }}>衣服顏色</div>
        <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
          {(["white", "grey", "black"] as const).map((c) => <button key={c} className={chip(sheetColor === c)} style={{ fontSize: 11 }} onClick={() => setSheetColor(c)}>{COLOR_LABEL[c]}</button>)}
        </div>
        <button className="btn-primary" style={{ marginTop: 8 }} disabled={busy} onClick={() => void makeSheet()}>生成 4 個角度</button>
        {sheet.length > 0 && (
          <>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {sheet.map((s, i) => (
                <div key={i}>
                  {s.status === "done"
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={s.image} alt={MODEL_SHEET_ANGLES[i].label} style={{ ...thumb, width: 120, height: 180 }} />
                    : <div style={{ ...thumb, width: 120, height: 180, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: s.status === "error" ? "var(--red)" : undefined }}>
                        {s.status === "error" ? `✗ ${s.error}` : "生成中…"}
                      </div>}
                  <div style={{ fontSize: 10, textAlign: "center" }}>{MODEL_SHEET_ANGLES[i].label}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <button className="btn-primary" disabled={busy || !sheet.some((s) => s.status === "done")} onClick={() => void saveSheet()}>存成模特兒</button>
              <button className="btn-secondary" disabled={busy} onClick={() => void makeSheet()}>不滿意，重新生成</button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
