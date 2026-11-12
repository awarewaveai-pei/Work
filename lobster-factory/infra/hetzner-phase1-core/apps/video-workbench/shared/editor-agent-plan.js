// Card ED.13 剪輯 Agent: the one list of tools the agent may use and the shape check of a plan (docs/ed13-edit-agent-design-20261110.md
// §3, §6). Shared by the backend (require: checks the model's answer before it is returned) and the page (browser global
// `EditorAgentPlan`: checks again before anything is applied). Only shape and ranges live here; whether an id exists or a
// filter / ratio / timebase name is known is checked by the editor's own tool functions, the same ones the buttons run.
(function (root) {
  const node = typeof module === "object" && module.exports,
    EM = node ? require("./editor-model.js") : root.EditorModel,
    TB = node ? require("./timebase.js") : root.Timebase;
  const MAX_OPS = 50;
  const ID = { type: "string", max: 100 };
  const IDS = { type: "array", items: ID, min: 1, max: 200 };
  const SEC = { type: "number", min: 0, max: 36000 };
  const NAME = { type: "string", max: 40 };
  const TRACK = { type: "string", pattern: EM.ID };
  const opt = (spec) => ({ ...spec, optional: true });
  // tool -> args spec + the line the model reads (the system prompt's tool list is built from this table, so they cannot drift).
  const TOOLS = {
    split_clip: { args: { clipId: ID, atSec: SEC }, doc: "在時間軸秒數 atSec 把片段切成兩段（atSec 要在片段內部）" },
    delete_clips: { args: { clipIds: IDS, ripple: opt({ type: "boolean" }) }, doc: "刪除片段；ripple=true 時同軌後面的片段往前補" },
    duplicate_clips: { args: { clipIds: IDS }, doc: "複製片段，放在原片段後面" },
    move_clip_track: { args: { clipId: ID, trackId: TRACK }, doc: "把片段移到同種類的另一條軌" },
    add_track: { args: { kind: { type: "string", enum: ["video", "audio", "text"] } }, doc: "新增一條軌" },
    set_ratio: { args: { ratio: { type: "string", max: 8 } }, doc: "整片比例：16:9、9:16、1:1、4:5、4:3" },
    set_timebase: { args: { label: NAME }, doc: "整片影格率（用摘要 timebases 裡的名稱）" },
    set_loudness: { args: { lufs: { type: "number", min: EM.LOUDNESS.min, max: EM.LOUDNESS.max } }, doc: `整片響度目標 LUFS（${EM.LOUDNESS.min}～${EM.LOUDNESS.max}）` },
    set_filter: { args: { clipId: opt(ID), name: NAME, scope: { type: "string", enum: ["整片", "此軌", "此片段"] } }, doc: "濾鏡（名稱用摘要 filters 裡的值）；scope 整片時不需 clipId" },
    set_speed: { args: { clipId: ID, rate: { type: "number", enum: [0.5, 1, 1.5, 2] } }, doc: "播放速度" },
    set_mask: { args: { clipId: ID, value: { type: "string", enum: ["無", "圓形", "圓角矩形", "三角形"] } }, doc: "形狀遮罩（影片／圖片片段）" },
    set_background: { args: { clipId: ID, value: { type: "string", enum: ["黑邊", "模糊", "純色"] } }, doc: "主視訊軌背景（clipId 是主軌任一片段；套用到主軌全部片段）" },
    set_volume_db: { args: { clipId: ID, db: { type: "number", min: EM.DB.min, max: 12 } }, doc: `片段音量 dB（${EM.DB.min}～12）` },
    set_fades: { args: { clipId: ID, inSec: opt({ type: "number", min: 0, max: 10 }), outSec: opt({ type: "number", min: 0, max: 10 }) }, doc: "淡入、淡出秒數（不超過片段長度一半）" },
    set_duck: { args: { clipId: ID, on: { type: "boolean" } }, doc: `旁白出現時自動降低這段音量 12 dB（需有旁白軌 ${EM.NARRATION}）` },
    set_transition: { args: { clipId: ID, name: NAME, sec: { type: "number", min: 0.05, max: 2 } }, doc: `片段開頭的轉場：${Object.keys(EM.TRANSITIONS).join("、")} 或 無` },
    add_text: { args: { text: { type: "string", min: 1, max: 200 }, startSec: SEC, durSec: { type: "number", min: 0.1, max: 600 }, trackId: opt(TRACK) }, doc: "新增文字片段" },
    import_cues: { args: { language: NAME, cues: { type: "array", min: 1, max: 2000, items: { type: "object", props: { start: SEC, end: SEC, text: { type: "string", min: 1, max: 500 } } } } }, doc: "把字幕句子放進該語言的字幕軌（取代同語言軌；片尾之後的句子不放）" },
    transform_key: { args: { clipId: ID, op: { type: "string", enum: ["add", "delete", "clear"] }, frame: opt({ type: "integer", min: 0, max: 10000000 }), values: opt({ type: "object", props: { scale: opt({ type: "number", min: EM.TRANSFORM.scale[0], max: EM.TRANSFORM.scale[1] }), x: opt({ type: "number", min: EM.TRANSFORM.main[0], max: EM.TRANSFORM.main[1] }), y: opt({ type: "number", min: EM.TRANSFORM.main[0], max: EM.TRANSFORM.main[1] }), rotation: opt({ type: "number", min: EM.TRANSFORM.rotation[0], max: EM.TRANSFORM.rotation[1] }) } }) }, doc: "變形關鍵影格（frame＝從片段起點算的影格）" },
    detach_audio: { args: { clipId: ID }, doc: "把影片片段的聲音分離到旁白軌並靜音原片" },
    add_marker: { args: { atSec: SEC }, doc: "在時間軸秒數加標記" },
    propose_paid: { args: { kind: { type: "string", enum: ["transcribe", "translate", "fillers"] }, language: opt(NAME), target: opt(NAME) }, doc: "需要付費的工作（transcribe 辨識整片字幕、translate 把字幕翻成 target 語言、fillers 剪贅字與停頓）不要自己做，用這個提案；使用者看過費用並確認後才執行" },
  };

  // One value against its spec; returns the problem or "".
  function check(spec, v, at) {
    if (spec.type === "array") {
      if (!Array.isArray(v) || v.length < (spec.min ?? 0) || v.length > spec.max) return `${at} 需是 ${spec.min ?? 0}～${spec.max} 項的陣列`;
      for (let i = 0; i < v.length; i++) {
        const bad = check(spec.items, v[i], `${at}[${i}]`);
        if (bad) return bad;
      }
      return "";
    }
    if (spec.type === "object") return v && typeof v === "object" && !Array.isArray(v) ? checkProps(spec.props, v, at) : `${at} 需是物件`;
    if (spec.type === "boolean") return typeof v === "boolean" ? "" : `${at} 需是 true／false`;
    if (spec.type === "string") {
      if (typeof v !== "string") return `${at} 需是文字`;
      if (spec.enum && !spec.enum.includes(v)) return `${at} 不在可用選項內`;
      if (v.length < (spec.min ?? 0) || (spec.max !== undefined && v.length > spec.max)) return `${at} 長度超出範圍`;
      return spec.pattern && !spec.pattern.test(v) ? `${at} 格式不符` : "";
    }
    // number / integer
    if (typeof v !== "number" || !Number.isFinite(v) || (spec.type === "integer" && !Number.isSafeInteger(v))) return `${at} 需是數字`;
    if (spec.enum) return spec.enum.includes(v) ? "" : `${at} 不在可用選項內`;
    return v < spec.min || v > spec.max ? `${at} 超出範圍（${spec.min}～${spec.max}）` : "";
  }
  function checkProps(props, v, at) {
    for (const key of Object.keys(v)) if (!Object.hasOwn(props, key)) return `${at} 有不認得的欄位 ${key}`;
    for (const [key, spec] of Object.entries(props)) {
      if (v[key] === undefined) {
        if (!spec.optional) return `${at}.${key} 缺少`;
        continue;
      }
      const bad = check(spec, v[key], `${at}.${key}`);
      if (bad) return bad;
    }
    return "";
  }
  // A plan = [{ tool, args }]. Any problem rejects the whole plan (design §3: an unknown tool voids the list). Returns the
  // plan; throws Error naming the step and the problem.
  function validate(ops) {
    if (!Array.isArray(ops)) throw Error("操作清單格式不符");
    if (ops.length > MAX_OPS) throw Error(`一輪最多 ${MAX_OPS} 個操作`);
    ops.forEach((op, i) => {
      const at = `第 ${i + 1} 步`;
      if (!op || typeof op !== "object" || Array.isArray(op) || Object.keys(op).some((k) => k !== "tool" && k !== "args")) throw Error(at + "格式不符");
      if (typeof op.tool !== "string" || !Object.hasOwn(TOOLS, op.tool)) throw Error(at + "使用了不在清單內的工具，整份不套用");
      const bad = check({ type: "object", props: TOOLS[op.tool].args }, op.args ?? {}, op.tool);
      if (bad) throw Error(`${at}：${bad}`);
    });
    return ops;
  }

  // What the browser sends about a project (design §6: structure only -- ids, kinds, tracks, times, the first 200
  // characters of text, ratio; never a file url, an asset or an account field). Seconds rounded to 0.01.
  const r2 = (n) => Math.round(Number(n) * 100) / 100;
  function summarize(p, { filters = [] } = {}) {
    return {
      ratio: p.ratio,
      timebase: TB.label(p.timebase),
      total: r2(Math.max(0, ...p.clips.map((c) => c.start + c.duration))),
      loudness: p.output?.loudness,
      mainTrack: EM.mainTrack(p.tracks),
      narrationTrack: EM.NARRATION,
      hasWordTimes: p.clips.some((c) => c.words?.length),
      filters,
      timebases: TB.allowed.map(TB.label),
      tracks: p.tracks.map((t) => ({
        id: t.id, kind: t.kind, name: String(t.name || "").slice(0, 40),
        ...(t.language ? { language: String(t.language).slice(0, 40) } : {}), ...(t.hidden ? { hidden: true } : {}), ...(t.muted ? { muted: true } : {}),
      })),
      clips: p.clips.map((c) => ({
        id: c.id, kind: c.kind, track: c.track, start: r2(c.start), duration: r2(c.duration),
        ...(c.kind === "text" ? { text: String(c.text || "").slice(0, 200) } : {}),
        ...(c.speed !== 1 ? { speed: c.speed } : {}),
        ...(c.volume !== 1 ? { volumeDb: r2(EM.volumeToDb(c.volume)) } : {}),
        ...(c.fadeIn ? { fadeIn: r2(c.fadeIn) } : {}),
        ...(c.fadeOut ? { fadeOut: r2(c.fadeOut) } : {}),
        ...(c.duck ? { duck: true } : {}),
        ...(c.muted ? { muted: true } : {}),
        ...(c.transition && c.transition !== "無" ? { transition: c.transition } : {}),
      })),
      markers: (p.markers || []).slice(0, 100),
    };
  }
  // The system prompt's tool list, one line per tool with its args and their types, read off TOOLS.
  const toolLines = () =>
    Object.entries(TOOLS)
      .map(([name, t]) => `- ${name}(${Object.entries(t.args).map(([k, s]) => k + (s.optional ? "?" : "") + ":" + s.type).join(", ")})：${t.doc}`)
      .join("\n");
  // Design §6 破壞性門檻: a round removing more than 3 clips, or clips covering more than 30% of the total, waits for a
  // click. before / after = the clips ([{ id, track, start, duration }]) before and after the plan ran on a copy. count =
  // clips whose id is gone; seconds = timeline time no longer covered, summed per track (a clip split and then half
  // deleted counts only the deleted half; a ripple move does not count).
  const covered = (clips, track) => {
    let sum = 0, end = -Infinity;
    for (const c of clips.filter((x) => x.track === track).sort((a, b) => a.start - b.start)) {
      sum += Math.max(0, c.start + c.duration - Math.max(c.start, end));
      end = Math.max(end, c.start + c.duration);
    }
    return sum;
  };
  function removal(before, after) {
    const kept = new Set(after.map((c) => c.id)),
      count = before.filter((c) => !kept.has(c.id)).length,
      total = Math.max(0, ...before.map((c) => c.start + c.duration)),
      seconds = [...new Set(before.map((c) => c.track))].reduce((s, t) => s + Math.max(0, covered(before, t) - covered(after, t)), 0);
    return { count, seconds, confirm: count > 3 || (total > 0 && seconds > total * 0.3) };
  }
  const api = { MAX_OPS, TOOLS, validate, summarize, toolLines, removal };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.EditorAgentPlan = api;
})(typeof globalThis === "object" ? globalThis : this);
