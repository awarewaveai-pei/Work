"use client";
// 【模特兒印製】: generates 模特兒圖 -- a person, pose and scene in a PLAIN garment -- into the model library, and manages
// it. The design is put on later, on the 主頁 模特 tab (ModelMockupPanel). Every setting is a visible button (no
// dropdowns). A new person's batch stays one person: its first photo is generated from the description and becomes the
// identity reference for the rest; an existing model's photos are the reference. Plan:
// agency-os/docs/operations/MOCKUP_FIXED_MODEL_PLAN.md.
import { useMemo, useRef, useState } from "react";
import {
  MODEL_ACCESSORIES,
  MODEL_AGES,
  MODEL_BODY_TYPES,
  MODEL_EMOTIONS,
  MODEL_ETHNICITIES,
  MODEL_FRAMING,
  MODEL_GENDERS,
  MODEL_LIGHTING,
  MODEL_MAKEUP,
  MODEL_POSES,
  MODEL_PROPS,
  MODEL_SCENES,
  buildModelPhotoPrompt,
  isChestOccludingPose,
  type GarmentColor,
} from "@/lib/studio/mockup-prompt";
import { STUDIO_MODEL_OPTIONS, type AspectRatio } from "@/lib/studio/model-options";
import { isPrintBox, type Point, type PrintBox } from "@/lib/studio/fabric-print";
import { COLOR_LABEL, GENDER_LABEL, failureText, groupModels, inPairs, readJson, type LibraryPhoto, type Shot } from "./modelLibrary";
import ImageLightbox from "./ImageLightbox";

// nano-banana-2 takes up to 14 reference images (lib/studio/model-options.ts), enough for a model's whole library.
const GEN_MODEL = "nano-banana-2";
const GEN_COST_NT = STUDIO_MODEL_OPTIONS.find((m) => m.value === GEN_MODEL)?.costNt ?? 2.2;
const MAX_IDENTITY_REFS = 14;
const ASPECTS: AspectRatio[] = ["2:3", "3:4", "4:5", "9:16", "1:1"];
const DEFAULT_BOX: PrintBox = { x: 0.32, y: 0.3, w: 0.36, h: 0.32 };
const CORNER_LABEL = ["左上", "右上", "右下", "左下"];
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

async function generatePhoto(prompt: string, referenceImages: string[], aspectRatio: AspectRatio): Promise<Shot> {
  try {
    const res = await fetch("/api/tools/studio/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: GEN_MODEL, prompt, referenceImages, aspectRatio }),
    });
    const json = await readJson<{ ok: boolean; image?: string; error?: string; code?: string }>(res);
    return json.ok && json.image ? { status: "done", image: json.image } : { status: "error", error: failureText(res, json) };
  } catch (err) {
    return { status: "error", error: err instanceof Error ? err.message : String(err) };
  }
}

/** A labelled row of single-choice buttons. */
function Choice({ label, options, value, onPick }: {
  label: string; options: readonly { value: string; label: string }[]; value: string; onPick: (v: string) => void;
}) {
  return (
    <div style={{ fontSize: 12 }}>
      <div style={{ marginBottom: 2 }}>{label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {options.map((o) => (
          <button key={o.value} className={value === o.value ? "btn-primary" : "btn-secondary"} style={{ fontSize: 11, padding: "2px 8px" }}
            onClick={() => onPick(o.value)}>{o.label}</button>
        ))}
      </div>
    </div>
  );
}

/** A labelled row of multi-choice buttons. */
function Multi({ label, options, values, onToggle }: {
  label: string; options: readonly { value: string; label: string }[]; values: Set<string>; onToggle: (v: string) => void;
}) {
  return (
    <div style={{ fontSize: 12 }}>
      <div style={{ marginBottom: 2 }}>{label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {options.map((o) => (
          <button key={o.value} className={values.has(o.value) ? "btn-primary" : "btn-secondary"} style={{ fontSize: 11, padding: "2px 8px" }}
            onClick={() => onToggle(o.value)}>{o.label}</button>
        ))}
      </div>
    </div>
  );
}

const toggled = (set: Set<string>, v: string) => { const n = new Set(set); if (n.has(v)) n.delete(v); else n.add(v); return n; };

export default function ModelLibraryStudio({ photos, setPhotos }: {
  photos: LibraryPhoto[];
  setPhotos: (update: (prev: LibraryPhoto[]) => LibraryPhoto[]) => void;
}) {
  const models = useMemo(() => groupModels(photos), [photos]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);

  // ── Who: a new person from the description, or an existing model (its photos are the face) ──
  const [pickedSubject, setSubject] = useState<"new" | string>("new");
  // A model whose last photo was deleted is gone: fall back to describing a new person.
  const subjectModel = pickedSubject === "new" ? null : models.find((m) => m.key === pickedSubject) ?? null;
  const subject = subjectModel ? subjectModel.key : "new";
  const [ageGroup, setAgeGroup] = useState<"adult" | "youth">("adult");
  const [ethnicity, setEthnicity] = useState("");
  const [gender, setGender] = useState("");
  const [age, setAge] = useState("");
  const [body, setBody] = useState("");
  const [makeup, setMakeup] = useState("");
  const [accessories, setAccessories] = useState("");
  const [manualDesc, setManualDesc] = useState("");
  const description = manualDesc.trim() || [ethnicity, gender, age, body, makeup, accessories].filter(Boolean).join(", ");

  // ── The photo: pose(s), scene, light, framing, mood, props, garment, ratio ──
  const [poses, setPoses] = useState<Set<string>>(new Set(["standing"]));
  const [scene, setScene] = useState(MODEL_SCENES[0].value);
  const [lighting, setLighting] = useState(MODEL_LIGHTING[0].value);
  const [framing, setFraming] = useState("three-quarter");
  const [emotion, setEmotion] = useState("");
  const [props, setProps] = useState<Set<string>>(new Set());
  const [color, setColor] = useState<GarmentColor>("white");
  const [aspect, setAspect] = useState<AspectRatio>("2:3");

  const [shots, setShots] = useState<{ pose: string; shot: Shot; keep: boolean }[]>([]);
  const [newName, setNewName] = useState("");
  // What the batch was generated with, saved with its photos whatever the buttons show by then: a black-shirt photo
  // saved as white would skip the dark-fabric colour lock when a design is printed on it.
  const [batch, setBatch] = useState<{ for: "new" | string; color: GarmentColor; scene: string; settings: Record<string, string> } | null>(null);
  const batchTarget = batch && batch.for !== "new" ? models.find((m) => m.key === batch.for) ?? null : null;

  async function generate() {
    if (busy || poses.size === 0) return;
    setBusy(true); setMsg(null);
    const list = [...poses];
    const propLabels = [...props].map((v) => MODEL_PROPS.find((p) => p.value === v)?.label ?? v);
    const prompt = (pose: string, same: boolean) => buildModelPhotoPrompt({
      pose, scene, lighting, framing, emotion, props: propLabels, color, ageGroup,
      modelDescription: subjectModel ? "" : description, sameAsReferences: same,
    });
    setBatch({
      for: subject, color, scene,
      settings: subjectModel ? { mGender: subjectModel.gender } : { mGender: gender, mEthnicity: ethnicity, mAge: age, mBody: body, ageGroup },
    });
    setShots(list.map((pose) => ({ pose, shot: { status: "generating" }, keep: true })));
    const land = (i: number, shot: Shot) => setShots((prev) => prev.map((s, k) => (k === i ? { ...s, shot } : s)));
    if (subjectModel) {
      // Identity-sheet angles (older models) first: the cleanest faces survive the reference limit.
      const refs = [...subjectModel.photos]
        .sort((a, b) => Number(!(a.metadata?.photo_role ?? "").startsWith("face-")) - Number(!(b.metadata?.photo_role ?? "").startsWith("face-")))
        .map((p) => p.object_url!).slice(0, MAX_IDENTITY_REFS);
      await inPairs(list, async (pose, i) => land(i, await generatePhoto(prompt(pose, true), refs, aspect)));
    } else {
      // The first photo defines the new person; the rest copy its face so the batch is one model.
      const first = await generatePhoto(prompt(list[0], false), [], aspect);
      land(0, first);
      const rest = list.slice(1);
      if (first.status !== "done") {
        rest.forEach((_, j) => land(j + 1, { status: "error", error: "第一張沒有生成成功，沒有長相依據" }));
      } else {
        await inPairs(rest, async (pose, j) => land(j + 1, await generatePhoto(prompt(pose, true), [first.image], aspect)));
      }
    }
    setBusy(false);
  }

  async function savePhoto(image: string, fields: Record<string, unknown>): Promise<LibraryPhoto | null> {
    const res = await fetch("/api/tools/presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image, presetType: "model", ...fields }),
    }).catch(() => null);
    const json = res ? ((await res.json().catch(() => ({}))) as { ok?: boolean; preset?: LibraryPhoto; error?: string; code?: string }) : {};
    if (!json.ok || !json.preset) { setMsg(`儲存失敗：${res ? failureText(res, json) : "網路錯誤"}`); return null; }
    return json.preset;
  }

  async function saveShots() {
    if (!batch) return;
    const target = batchTarget; // null also when the batch's model was deleted meanwhile: saved as a new one
    const name = target ? target.name : newName.trim();
    if (!name) { setMsg("請先幫新模特兒取名字"); return; }
    setBusy(true);
    const modelKey = target ? target.key : crypto.randomUUID();
    const saved: LibraryPhoto[] = [];
    const savedIdx = new Set<number>();
    for (const [i, s] of shots.entries()) {
      if (!s.keep || s.shot.status !== "done") continue;
      const p = await savePhoto(s.shot.image, {
        presetName: name, modelKey, photoRole: "pose", garmentColor: batch.color,
        presetSettings: { ...(target ? { mGender: target.gender } : batch.settings), pose: s.pose, scene: batch.scene },
      });
      if (p) { saved.push(p); savedIdx.add(i); }
    }
    setPhotos((prev) => [...saved, ...prev]);
    // Keep what failed to save on screen: those images were paid for.
    setShots((prev) => prev.filter((_, i) => !savedIdx.has(i)));
    if (saved.length) { setSubject(modelKey); setBatch({ ...batch, for: modelKey }); setNewName(""); } // more photos of this person next
    setBusy(false);
  }

  // ── Library management ──
  const uploadRef = useRef<HTMLInputElement>(null);
  const [uploadFor, setUploadFor] = useState<string | null>(null);
  async function uploadPhoto(file: File | undefined) {
    const target = models.find((m) => m.key === uploadFor);
    if (!target || !file) return;
    const image = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(new Error("read_failed"));
      r.readAsDataURL(file);
    }).catch(() => null);
    if (!image) { setMsg("讀不到這張照片"); return; }
    const p = await savePhoto(image, { presetName: target.name, modelKey: target.key, photoRole: "upload", presetSettings: { mGender: target.gender } });
    if (p) setPhotos((prev) => [p, ...prev]);
  }

  // Deletes are permanent (the R2 file and its row). Each goes through the server's WordPress reference check; its
  // refusal reason is shown as is -- "刪除失敗，請重試" hid that a site could not be checked (2026-11-02).
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  async function deletePhotos(list: LibraryPhoto[]): Promise<boolean> {
    setDeleting(true); setMsg(null);
    let failed = 0;
    let reason = "";
    for (const p of list) {
      const res = await fetch(`/api/tools/presets?id=${p.id}`, { method: "DELETE" }).catch(() => null);
      if (!res?.ok) {
        failed++;
        if (!reason) reason = res ? failureText(res, await readJson<{ error?: string }>(res)) : "網路錯誤";
        continue;
      }
      setPhotos((prev) => prev.filter((x) => x.id !== p.id));
      setSelected((prev) => { const n = new Set(prev); n.delete(p.id); return n; });
    }
    setDeleting(false);
    if (failed) setMsg(`有 ${failed} 張沒有刪除：${reason}`);
    return failed === 0;
  }
  const selectedPhotos = photos.filter((p) => selected.has(p.id));

  // Print outline for the 主頁's free preview (the AI composite places the design itself).
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
    const json = res ? ((await res.json().catch(() => ({}))) as { ok?: boolean; preset?: LibraryPhoto; error?: string; code?: string }) : {};
    if (!json.ok || !json.preset) { setMsg(`印花框儲存失敗：${res ? failureText(res, json) : "網路錯誤"}`); return; }
    setPhotos((prev) => prev.map((p) => (p.id === json.preset!.id ? json.preset! : p)));
    setBoxPhoto(null);
  }

  const thumb = { width: 84, height: 126, objectFit: "cover" as const, borderRadius: 4, background: "#111", display: "block" };
  const section = { borderTop: "1px solid var(--border)", paddingTop: 12, display: "flex", flexDirection: "column" as const, gap: 8 };
  const savable = shots.some((s) => s.keep && s.shot.status === "done");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {msg && <div style={{ color: "var(--red)", fontSize: 13 }}>{msg}</div>}
      <ImageLightbox src={zoom} onClose={() => setZoom(null)} />

      {/* ── 1. Generate 模特兒圖 ── */}
      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div>
          <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>生成模特兒圖</h3>
          <div style={{ fontSize: 12, opacity: 0.7 }}>素色衣服、含背景的模特兒照片。存進圖庫後，到主頁「模特」勾選＋設計圖就能合成商品 Mockup。每張約 NT${GEN_COST_NT}。</div>
        </div>

        <div style={{ fontSize: 12 }}>
          <div style={{ marginBottom: 2 }}>人物</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            <button className={subject === "new" ? "btn-primary" : "btn-secondary"} style={{ fontSize: 11, padding: "2px 8px" }} onClick={() => setSubject("new")}>新的人（照下面描述）</button>
            {models.map((m) => (
              <button key={m.key} className={subject === m.key ? "btn-primary" : "btn-secondary"} style={{ fontSize: 11, padding: "2px 8px" }}
                onClick={() => setSubject(m.key)} title="用他已有的照片當長相依據，臉會一樣">
                {m.name}{GENDER_LABEL[m.gender] ? `（${GENDER_LABEL[m.gender]}）` : ""}
              </button>
            ))}
          </div>
        </div>

        {subject === "new" && (
          <>
            <Choice label="年齡層" options={[{ value: "adult", label: "Adult" }, { value: "youth", label: "Youth" }]} value={ageGroup} onPick={(v) => setAgeGroup(v as "adult" | "youth")} />
            <Choice label="族裔／膚色" options={MODEL_ETHNICITIES} value={ethnicity} onPick={setEthnicity} />
            <Choice label="性別" options={MODEL_GENDERS} value={gender} onPick={setGender} />
            <Choice label="年齡" options={MODEL_AGES} value={age} onPick={setAge} />
            <Choice label="體型" options={MODEL_BODY_TYPES} value={body} onPick={setBody} />
            <Choice label="妝造" options={MODEL_MAKEUP} value={makeup} onPick={setMakeup} />
            <Choice label="飾品" options={MODEL_ACCESSORIES} value={accessories} onPick={setAccessories} />
            <input value={manualDesc} onChange={(e) => setManualDesc(e.target.value)} placeholder="手動描述（覆蓋上方，例：blonde Asian woman, 20s）"
              style={{ padding: "4px 8px", fontSize: 12, background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6 }} />
            {description && <div style={{ fontSize: 11, opacity: 0.55 }}>→ {description}</div>}
          </>
        )}

        <Multi label="姿勢（可複選，一個姿勢一張）" options={MODEL_POSES}
          values={poses} onToggle={(v) => setPoses((s) => toggled(s, v))} />
        {[...poses].some((v) => isChestOccludingPose(v)) && <div style={{ fontSize: 11, color: "var(--yellow)" }}>⚠ 有選到會遮住胸口的姿勢，之後印胸前設計會被手擋住</div>}
        <Choice label="場景" options={MODEL_SCENES} value={scene} onPick={setScene} />
        <Choice label="光線" options={MODEL_LIGHTING} value={lighting} onPick={setLighting} />
        <Choice label="取景" options={MODEL_FRAMING} value={framing} onPick={setFraming} />
        <Choice label="情緒" options={MODEL_EMOTIONS} value={emotion} onPick={setEmotion} />
        <Multi label="場景道具（可複選）" options={MODEL_PROPS} values={props} onToggle={(v) => setProps((s) => toggled(s, v))} />
        <Choice label="衣服顏色（素色，設計之後再印）" options={(["white", "grey", "black"] as const).map((c) => ({ value: c, label: COLOR_LABEL[c] }))} value={color} onPick={(v) => setColor(v as GarmentColor)} />
        <Choice label="比例" options={ASPECTS.map((a) => ({ value: a, label: a }))} value={aspect} onPick={(v) => setAspect(v as AspectRatio)} />

        <div>
          <button className="btn-primary" disabled={busy || poses.size === 0} onClick={() => void generate()}>
            {busy ? "生成中…" : `生成 ${poses.size} 張模特兒圖（約 NT$${(poses.size * GEN_COST_NT).toFixed(1)}）`}
          </button>
        </div>

        {shots.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {shots.map((s, i) => (
                <div key={i} style={{ position: "relative", width: 160 }}>
                  {s.shot.status === "done"
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={s.shot.image} alt={s.pose} title="點一下放大" onClick={() => setZoom(s.shot.status === "done" ? s.shot.image : null)}
                        style={{ width: 160, borderRadius: 6, display: "block", cursor: "zoom-in", border: s.keep ? "2px solid var(--accent)" : "2px solid transparent" }} />
                    : <div style={{ ...thumb, width: 160, height: 240, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, padding: 6, textAlign: "center", color: s.shot.status === "error" ? "var(--red)" : undefined }}>
                        {s.shot.status === "error" ? `✗ ${s.shot.error}` : "生成中…"}
                      </div>}
                  {s.shot.status === "done" && (
                    <input type="checkbox" checked={s.keep} aria-label={`保留 ${MODEL_POSES.find((p) => p.value === s.pose)?.label ?? ""}`}
                      style={{ position: "absolute", top: 4, left: 4, width: 18, height: 18, cursor: "pointer" }}
                      onChange={() => setShots((prev) => prev.map((x, k) => (k === i ? { ...x, keep: !x.keep } : x)))} />
                  )}
                  <div style={{ fontSize: 10, textAlign: "center" }}>{MODEL_POSES.find((p) => p.value === s.pose)?.label}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {!batchTarget && (
                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="新模特兒名字，例如 Leo" maxLength={40}
                  style={{ padding: "4px 8px", fontSize: 12, background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6 }} />
              )}
              <button className="btn-primary" disabled={busy || !savable} onClick={() => void saveShots()}>
                {batchTarget ? `勾選的存進 ${batchTarget.name}` : "勾選的存成新模特兒"}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ── 2. The library ── */}
      <section style={section}>
        <div>
          <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>模特兒圖庫</h3>
          <div style={{ fontSize: 12, opacity: 0.7 }}>勾選照片可一次刪除；點照片可框印花位置（只有主頁的「免費預覽」需要；AI 合成會自己找位置）。</div>
        </div>
        {selected.size > 0 && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className="btn-secondary" style={{ color: "var(--red)" }} disabled={deleting}
              onClick={() => { if (window.confirm(`永久刪除勾選的 ${selectedPhotos.length} 張照片？刪除後無法復原。`)) void deletePhotos(selectedPhotos); }}>
              {deleting ? "刪除中…" : `永久刪除勾選的 ${selectedPhotos.length} 張`}
            </button>
            <button className="btn-secondary" disabled={deleting} onClick={() => setSelected(new Set())}>取消勾選</button>
          </div>
        )}
        {models.length === 0 && <p style={{ fontSize: 13, opacity: 0.6 }}>還沒有模特兒圖，先在上面生成。</p>}
        {models.map((m) => (
          <div key={m.key}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 4 }}>
              <b>{m.name}</b>
              {GENDER_LABEL[m.gender] && <span style={{ fontSize: 11, opacity: 0.7 }}>{GENDER_LABEL[m.gender]}</span>}
              <span style={{ fontSize: 11, opacity: 0.5 }}>{m.photos.length} 張</span>
              <button className="btn-secondary" style={{ fontSize: 11, padding: "1px 8px" }} onClick={() => { setUploadFor(m.key); uploadRef.current?.click(); }}>上傳照片</button>
              <button className="btn-secondary" style={{ fontSize: 11, padding: "1px 8px" }} disabled={deleting}
                onClick={() => setSelected((prev) => {
                  const n = new Set(prev);
                  const all = m.photos.every((p) => n.has(p.id));
                  for (const p of m.photos) { if (all) n.delete(p.id); else n.add(p.id); }
                  return n;
                })}>
                {m.photos.every((p) => selected.has(p.id)) ? "取消全選" : "全選"}
              </button>
              <button className="btn-secondary" style={{ fontSize: 11, padding: "1px 8px", color: "var(--red)" }} disabled={deleting}
                onClick={() => { if (window.confirm(`永久刪除模特兒「${m.name}」和他的 ${m.photos.length} 張照片？刪除後無法復原。`)) void deletePhotos(m.photos); }}>
                刪除整位
              </button>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {m.photos.map((p) => (
                <div key={p.id} style={{ position: "relative", cursor: "pointer" }} onClick={() => { setBoxPhoto(p); setDraft(quadOf(p.metadata?.print_box ?? DEFAULT_BOX)); }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.object_url!} alt={m.name} style={{ ...thumb, border: boxPhoto?.id === p.id ? "2px solid var(--accent)" : "2px solid transparent" }} />
                  <input type="checkbox" aria-label="勾選刪除" checked={selected.has(p.id)} disabled={deleting}
                    style={{ position: "absolute", top: 4, left: 4, width: 18, height: 18, cursor: "pointer" }}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => setSelected((prev) => { const n = new Set(prev); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })} />
                  <button style={{ position: "absolute", top: 0, right: 0, fontSize: 9, background: "var(--red)", color: "var(--btn-primary-text)", border: "none", borderRadius: 2, cursor: "pointer", padding: "1px 3px" }}
                    disabled={deleting} onClick={(e) => { e.stopPropagation(); if (window.confirm("永久刪除這張照片？刪除後無法復原。")) void deletePhotos([p]); }}>✕</button>
                  <div style={{ fontSize: 10, textAlign: "center" }}>
                    {p.metadata?.garment_color ? `${COLOR_LABEL[p.metadata.garment_color]}衣` : "照片"}{p.metadata?.print_box ? "・已框" : ""}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        <input ref={uploadRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: "none" }}
          onChange={(e) => { void uploadPhoto(e.target.files?.[0]); e.target.value = ""; }} />

        {boxPhoto && draft && (
          <div>
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
      </section>
    </div>
  );
}
