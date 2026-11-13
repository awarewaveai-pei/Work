// Card P2: the editor's track, transition, colour, quality and loudness rules in one place, shared by the page
// (browser global `EditorModel`) and the export (require() in Node), so the two cannot disagree.
(function (root) {
  const LIMITS = { video: 8, audio: 8, text: 4 };
  // All tracks together: = MEDIA_TIMELINE_V1_MAX_TRACKS (next-admin timeline-v1.ts:3), so every project exports to V1.
  // tests/p2-review-fixes.cjs checks the two stay equal.
  const TOTAL = 16;
  const PREFIX = { video: "V", audio: "A", text: "T" };
  const KIND = { V: "video", A: "audio", T: "text" };
  const NAME = { video: "影片", audio: "音訊", text: "文字" };
  // Pre-P2 projects stored five fixed tracks as an object; this is their order (first video track = bottom layer).
  const LEGACY = ["V1", "V2", "T", "A1", "A2"];
  // "T" is the pre-P2 text track id; every other id is a kind letter + 1-2 digits.
  const ID = /^(?:[VAT]\d{1,2}|T)$/;
  const clamp = (n, min, max, fallback) => {
    const v = Number(n);
    return n === null || n === undefined || n === "" || !Number.isFinite(v)
      ? fallback
      : Math.max(min, Math.min(max, v));
  };
  function track(raw, id) {
    const kind = KIND[id[0]];
    return {
      ...(raw && typeof raw === "object" ? raw : {}),
      id,
      kind,
      name:
        typeof raw?.name === "string" && raw.name.trim()
          ? raw.name.trim().slice(0, 40)
          : id,
      hidden: !!raw?.hidden,
      muted: !!raw?.muted,
      volume: clamp(raw?.volume, 0, 4, 1),
      normalize: !!raw?.normalize,
    };
  }
  // Array = P2 form, used as given (strict: any bad entry throws; lenient: bad entries are dropped).
  // Object or missing = pre-P2 form: the five legacy tracks in their old order, keeping their settings.
  function normalizeTracks(raw, { strict = false } = {}) {
    if (!Array.isArray(raw) || !raw.length)
      return LEGACY.map((id) =>
        track(raw && !Array.isArray(raw) ? raw[id] : null, id),
      );
    const seen = new Set(),
      out = [];
    for (const row of raw) {
      const ok =
        row &&
        typeof row.id === "string" &&
        ID.test(row.id) &&
        !seen.has(row.id) &&
        (row.kind === undefined || row.kind === KIND[row.id[0]]);
      if (!ok) {
        if (strict) throw Error("軌道識別碼或類型無效");
        continue;
      }
      seen.add(row.id);
      out.push(track(row, row.id));
    }
    for (const kind of Object.keys(LIMITS))
      if (strict && out.filter((t) => t.kind === kind).length > LIMITS[kind])
        throw Error(`${NAME[kind]}軌最多 ${LIMITS[kind]} 條`);
    if (strict && out.length > TOTAL) throw Error(`軌道合計最多 ${TOTAL} 條`);
    const count = { video: 0, audio: 0, text: 0 };
    let total = 0;
    out.splice(
      0,
      out.length,
      ...out.filter((t) => ++count[t.kind] <= LIMITS[t.kind] && ++total <= TOTAL),
    );
    if (!out.some((t) => t.kind === "video")) {
      if (strict) throw Error("至少需要一條影片軌");
      out.unshift(track(null, out.some((t) => t.id === "V1") ? "V9" : "V1"));
    }
    return out;
  }
  // The bottom video track is the full-frame main track (old V1); every other video track is an overlay (old V2).
  const mainTrack = (tracks) => tracks.find((t) => t.kind === "video")?.id;
  const canAdd = (tracks, kind) =>
    tracks.length < TOTAL && tracks.filter((t) => t.kind === kind).length < LIMITS[kind];
  function nextId(tracks, kind) {
    const used = new Set(tracks.map((t) => t.id));
    for (let n = 1; n < 100; n++) {
      const id = PREFIX[kind] + n;
      if (!used.has(id) && !(id === "T1" && used.has("T"))) return id;
    }
    throw Error("軌道數已達上限");
  }
  // UI label -> ffmpeg xfade transition. Pre-P2 names map onto these on load and at export.
  const TRANSITIONS = {
    溶解: "fade",
    黑場: "fadeblack",
    向左擦除: "wipeleft",
    向右擦除: "wiperight",
    向左推移: "slideleft",
    向右推移: "slideright",
    圓形展開: "circleopen",
  };
  const LEGACY_TRANSITIONS = {
    融接: "溶解",
    淡入淡出: "黑場",
    圓形裁切: "圓形展開",
  };
  // null = unknown name (export refuses it); "無" = no transition.
  function transitionName(name) {
    if (name === undefined || name === null || name === "" || name === "無")
      return "無";
    if (Object.hasOwn(TRANSITIONS, name)) return name;
    return Object.hasOwn(LEGACY_TRANSITIONS, name)
      ? LEGACY_TRANSITIONS[name]
      : null;
  }
  const transitionLimits = (tb) => ({
    min: 2,
    max: Math.floor((2 * tb.num) / tb.den),
  });
  // Stored as integer frames; pre-P2 clips carry transitionDuration in seconds (default 0.5 s).
  function transitionFrames(clip, tb) {
    const { min, max } = transitionLimits(tb);
    const raw = Number.isSafeInteger(clip?.transitionFrames)
      ? clip.transitionFrames
      : Math.round(
          ((Number.isFinite(Number(clip?.transitionDuration)) &&
          clip?.transitionDuration !== null
            ? Number(clip.transitionDuration)
            : 0.5) *
            tb.num) /
            tb.den,
        );
    return Math.max(min, Math.min(max, raw));
  }
  const COLOR = {
    exposure: { label: "曝光（EV）", min: -2, max: 2, step: 0.1, neutral: 0 },
    contrast: { label: "對比", min: 0.5, max: 2, step: 0.05, neutral: 1 },
    temperature: {
      label: "色溫（K）",
      min: 2000,
      max: 12000,
      step: 100,
      neutral: 6500,
    },
    saturation: { label: "飽和度", min: 0, max: 2, step: 0.05, neutral: 1 },
  };
  const graded = (clip) =>
    Object.entries(COLOR).some(
      ([k, r]) =>
        clip?.[k] !== undefined &&
        clip[k] !== null &&
        Number(clip[k]) !== r.neutral,
    ) || !!clip?.lut;
  // Export size = the ratio's 1080p frame x scale (4K = 1080p x 2, e.g. 3840x2160).
  const QUALITIES = { "720p": 2 / 3, "1080p": 1, "4K": 2 };
  const LOUDNESS = {
    min: -24,
    max: -9,
    neutral: -16,
    presets: [-23, -16, -14],
  };
  const MAX_KEYS = 32;
  // Card ED.10: a subtitle clip's word times (words[] = { start, end, text }, seconds from the clip start) seen through the
  // window [from, to) of the old clip, rebased to `from`. A word belongs to the window its middle falls in, so a split or a
  // trim never keeps one word on both sides. Every clip time-window change (trim, split, 入點／出點) goes through this.
  const wordsWindow = (words, from, to) =>
    (words || [])
      .filter((w) => (w.start + w.end) / 2 >= from && (w.start + w.end) / 2 < to)
      .map((w) => ({ ...w, start: Math.max(0, w.start - from), end: Math.min(to - from, w.end - from) }));
  // [{frame (from clip start), gain 0..4}], sorted, unique frames, inside the clip. Throws on bad input.
  function volumeKeys(raw, durationFrames) {
    if (raw === undefined || raw === null) return [];
    if (!Array.isArray(raw) || raw.length > MAX_KEYS)
      throw Error("音量關鍵影格無效");
    const keys = raw.map((k) => {
      if (
        !k ||
        !Number.isSafeInteger(k.frame) ||
        k.frame < 0 ||
        (durationFrames !== undefined && k.frame > durationFrames)
      )
        throw Error("音量關鍵影格位置無效");
      const gain = Number(k.gain);
      if (!Number.isFinite(gain) || gain < 0 || gain > 4)
        throw Error("音量關鍵影格音量需介於 0 到 4");
      return { frame: k.frame, gain };
    });
    keys.sort((a, b) => a.frame - b.frame);
    if (keys.some((k, i) => i && k.frame === keys[i - 1].frame))
      throw Error("音量關鍵影格不可重複");
    return keys;
  }
  // Linear between keys, held before the first and after the last.
  function gainAt(keys, frame) {
    if (!keys.length) return null;
    if (frame <= keys[0].frame) return keys[0].gain;
    for (let i = 1; i < keys.length; i++)
      if (frame < keys[i].frame) {
        const a = keys[i - 1],
          b = keys[i];
        return (
          a.gain + ((b.gain - a.gain) * (frame - a.frame)) / (b.frame - a.frame)
        );
      }
    return keys.at(-1).gain;
  }
  // Card ED.2: 複製／貼上樣式 carries these fields between clips of the same group (reference: 濾鏡、特效、遮罩或文字樣式).
  const STYLE = {
    visual: ["filter", "mask", "grain", ...Object.keys(COLOR), "lut", "filterStrength", "lightLeak", "shake"],
    text: ["font", "fontSize", "bold", "italic", "align", "color", "backgroundColor", "animation"],
  };
  const styleGroup = (kind) =>
    kind === "text" ? "text" : kind === "video" || kind === "image" ? "visual" : null;
  // Clip volume is stored as a gain (0..4 = up to +12 dB); the timeline's volume line spans -60 (silent) to +6 dB like
  // the reference. A clip already above +6 dB keeps its gain: the line only clamps to the gain limit (Codex ED.2 F1).
  const DB = { min: -60, max: 6 };
  const volumeToDb = (v) =>
    !(Number(v) > 0) ? DB.min : Math.max(DB.min, 20 * Math.log10(Number(v)));
  const dbToVolume = (db) =>
    Number(db) <= DB.min ? 0 : Math.min(4, Math.pow(10, Number(db) / 20));
  // 磁性主軌: the main track's clips laid end to end from frame 0 in their current order; the tie-break keeps a new
  // copy right after the clip it was made from. rows: [{id, startFrame, durationFrames}]; returns Map id -> startFrame.
  function closeGaps(rows, first = new Set()) {
    const order = [...rows].sort(
      (a, b) =>
        a.startFrame - b.startFrame ||
        Number(first.has(b.id)) - Number(first.has(a.id)),
    );
    const out = new Map();
    let t = 0;
    for (const r of order) {
      out.set(r.id, t);
      t += r.durationFrames;
    }
    return out;
  }
  // 磁吸: the candidate nearest to any of the moving edges, if within `tolerance` frames; returns the frame shift.
  function snapShift(edges, candidates, tolerance) {
    let best = null;
    for (const e of edges)
      for (const c of candidates) {
        const d = c - e;
        if (Math.abs(d) <= tolerance && (best === null || Math.abs(d) < Math.abs(best))) best = d;
      }
    return best ?? 0;
  }
  // First start >= `from` where every range [start+offset, end+offset) of a pasted group misses the clips already on
  // its track. group: [{track, offset, durationFrames}]; occupied: Map track -> [[start, end]].
  function freeStart(group, occupied, from) {
    const fits = (s) =>
      group.every(({ track, offset, durationFrames }) =>
        (occupied.get(track) || []).every(
          ([a, b]) => s + offset + durationFrames <= a || s + offset >= b,
        ),
      );
    const candidates = [from];
    for (const { track, offset } of group)
      for (const [, b] of occupied.get(track) || []) if (b - offset >= from) candidates.push(b - offset);
    candidates.sort((a, b) => a - b);
    return candidates.find(fits) ?? from;
  }
  // Card ED.3: 畫面效果, resolved nearest-first: clip, then its track, then the project (§4 of docs/ed3-properties-spec-20261106.md).
  const EFFECTS = {
    filter: { neutral: "原始" },
    filterStrength: { min: 0, max: 1, neutral: 1, label: "濾鏡強度" },
    grain: { min: 0, max: 1, neutral: 0, label: "顆粒" },
    lightLeak: { min: 0, max: 1, neutral: 0, label: "光漏" },
    shake: { min: 0, max: 1, neutral: 0, label: "震動" },
  };
  const effectValue = (project, track, clip, key) =>
    key === "filter"
      ? clip?.filter || track?.filter || project?.filter || "原始" // same `||` chain as editor-export.cjs validateProject
      : clip?.[key] ?? track?.[key] ?? project?.[key] ?? EFFECTS[key].neutral;
  const LIGHT_LEAK = { rgb: [255, 160, 64], reach: 0.6 }; // effect colour (content, not UI chrome): export + preview
  const SHAKE = { amplitude: 0.03, wx: 31, wy: 23, phase: 1, depth: 0.8 };
  const shakeOffset = (t) => ({ dx: SHAKE.depth * Math.sin(SHAKE.wx * t), dy: SHAKE.depth * Math.sin(SHAKE.wy * t + SHAKE.phase) });
  const TRANSFORM = { scale: [0.1, 5], rotation: [-360, 360], main: [-8000, 8000], overlay: [0, 100] };
  // [{frame (from clip start), scale, x, y, rotation}], sorted, unique frames, inside the clip. Throws on bad input.
  function transformKeys(raw, durationFrames, overlay) {
    if (raw === undefined || raw === null) return [];
    if (!Array.isArray(raw) || raw.length > MAX_KEYS) throw Error("變形關鍵影格無效");
    const range = {
      scale: TRANSFORM.scale,
      rotation: TRANSFORM.rotation,
      x: overlay ? TRANSFORM.overlay : TRANSFORM.main,
      y: overlay ? TRANSFORM.overlay : TRANSFORM.main,
    };
    const keys = raw.map((k) => {
      if (!k || !Number.isSafeInteger(k.frame) || k.frame < 0 || (durationFrames !== undefined && k.frame > durationFrames))
        throw Error("變形關鍵影格位置無效");
      const key = { frame: k.frame };
      for (const [name, [min, max]] of Object.entries(range)) {
        const v = Number(k[name]);
        if (k[name] === null || k[name] === undefined || !Number.isFinite(v) || v < min || v > max)
          throw Error("變形關鍵影格數值超出範圍");
        key[name] = v;
      }
      return key;
    });
    keys.sort((a, b) => a.frame - b.frame);
    if (keys.some((k, i) => i && k.frame === keys[i - 1].frame)) throw Error("變形關鍵影格不可重複");
    return keys;
  }
  // Linear between keys per property, held before the first and after the last; null when there are no keys.
  function transformAt(keys, frame) {
    if (!keys?.length) return null;
    const out = {};
    for (const name of ["scale", "x", "y", "rotation"])
      out[name] = gainAt(keys.map((k) => ({ frame: k.frame, gain: k[name] })), frame);
    return out;
  }
  const NARRATION = "A1"; // 旁白 A1
  const DUCK = { gain: Math.pow(10, -12 / 20), ramp: 0.2, maxRanges: 64 };
  // Narration intervals (timeline seconds) -> ducking ranges in seconds from the clip's start: ranges closer than two
  // ramps merge, only those whose ramps touch the clip stay, and past maxRanges the smallest gaps merge.
  function duckRanges(clipStart, clipDuration, intervals) {
    const merged = [];
    for (const [a, b] of intervals.filter(([a, b]) => b > a).sort((p, q) => p[0] - q[0])) {
      const last = merged.at(-1);
      if (last && a - last[1] < 2 * DUCK.ramp) last[1] = Math.max(last[1], b);
      else merged.push([a, b]);
    }
    const ranges = merged
      .map(([a, b]) => [a - clipStart, b - clipStart])
      .filter(([a, b]) => a < clipDuration + DUCK.ramp && b > -DUCK.ramp);
    while (ranges.length > DUCK.maxRanges) {
      let i = 0;
      for (let j = 1; j < ranges.length - 1; j++) if (ranges[j + 1][0] - ranges[j][1] < ranges[i + 1][0] - ranges[i][1]) i = j;
      ranges.splice(i, 2, [ranges[i][0], ranges[i + 1][1]]);
    }
    return ranges;
  }
  const duckFactor = (ranges, t) =>
    1 - (1 - DUCK.gain) * Math.max(0, ...ranges.map(([a, b]) => Math.min(1, Math.max(0, Math.min((t - (a - DUCK.ramp)) / DUCK.ramp, (b + DUCK.ramp - t) / DUCK.ramp)))));
  // Number fields accept arithmetic (1920/2): digits . + - * / ( ) only, parsed here; never eval / Function.
  function evalNumber(text) {
    const s = String(text ?? "").replace(/\s+/g, ""),
      fail = () => {
        throw Error("請輸入數字或算式");
      };
    if (!s || /[^\d.+\-*/()]/.test(s)) fail();
    let i = 0;
    const atom = () => {
      if (s[i] === "-") return i++, -atom();
      if (s[i] === "+") return i++, atom();
      if (s[i] === "(") {
        i++;
        const v = sum();
        if (s[i++] !== ")") fail();
        return v;
      }
      const m = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(i));
      if (!m) fail();
      i += m[0].length;
      return Number(m[0]);
    };
    const product = () => {
      let v = atom();
      while (s[i] === "*" || s[i] === "/") v = s[i++] === "*" ? v * atom() : v / atom();
      return v;
    };
    const sum = () => {
      let v = product();
      while (s[i] === "+" || s[i] === "-") v = s[i++] === "+" ? v + product() : v - product();
      return v;
    };
    const v = sum();
    if (i !== s.length || !Number.isFinite(v)) fail();
    return v;
  }
  // Card ED.7.3: 轉場曲線 as one formula of the linear progress T (0 -> 1). The export writes it into FFmpeg's xfade
  // expression; the preview evaluates the same text with T replaced by its progress.
  const TRANSITION_CURVES = { 線性: "T", 平滑: "T*T*(3-2*T)", 加速: "T*T" };
  const transitionProgress = (curve, t) =>
    evalNumber((TRANSITION_CURVES[curve] || "T").replaceAll("T", Math.max(0, Math.min(1, t)).toFixed(9)));
  // Card ED.5.3: 文字動畫 timings, burnt by the export as ASS tags and drawn by the preview. 淡入淡出 = \fad(ms, ms);
  // 彈出 = \fscx/\fscy from `from` % to 100 % over `ms`; 逐字顯示 = one \k per character, `typeInterval` centiseconds each.
  const TEXT_ANIMATION = { fadeMs: 200, pop: { from: 50, ms: 180 } };
  const typeInterval = (text, duration) => {
    const n = [...text].length;
    return Math.max(1, Math.round((Math.min(duration * 0.6, Math.max(1, n * 0.06)) * 100) / Math.max(1, n)));
  };
  // Preview of one text clip's animation t seconds into it: opacity factor, scale factor, characters shown (a \k
  // syllable turns visible at its start; line breaks take no time). Subtitle-styled clips do not type out.
  function textAnimationAt(clip, t) {
    const a = TEXT_ANIMATION,
      out = { opacity: 1, scale: 1, shown: Infinity };
    if (clip.animation === "淡入淡出") out.opacity = Math.max(0, Math.min(1, (t * 1000) / a.fadeMs, ((clip.duration - t) * 1000) / a.fadeMs));
    if (clip.animation === "彈出") out.scale = (a.pop.from + (100 - a.pop.from) * Math.max(0, Math.min(1, (t * 1000) / a.pop.ms))) / 100;
    if (clip.animation === "逐字顯示" && !clip.subtitleStyle) out.shown = Math.floor((t * 100) / typeInterval(clip.text, clip.duration)) + 1;
    return out;
  }
  // Card ED.10.4: the eight 字幕樣式 (spec §1.3), burnt by the export and drawn by the preview. text = fill colour;
  // secondary = 卡拉 OK's not-yet-sung colour; box = [colour, ASS transparency hex] behind the line, else a black outline.
  // Outline and box padding are fractions of the font size.
  const SUBTITLE_STYLES = ["白字暗底", "白底黑字", "品牌色", "白字黑邊", "黃字黑邊", "逐字高亮", "卡拉 OK", "色塊標題"];
  const SUBTITLE_HIGHLIGHT = "#facc15";
  const SUBTITLE_EDGE = { outline: 0.06, pad: 0.15 };
  function subtitleLook(clip) {
    const looks = {
      白字暗底: { text: "#ffffff", box: ["#000000", "60"] },
      白底黑字: { text: "#111111", box: ["#ffffff", "00"] },
      品牌色: { text: clip.color },
      白字黑邊: { text: "#ffffff" },
      黃字黑邊: { text: SUBTITLE_HIGHLIGHT },
      逐字高亮: { text: "#ffffff" },
      "卡拉 OK": { text: SUBTITLE_HIGHLIGHT, secondary: "#ffffff" },
      色塊標題: { text: "#ffffff", box: [clip.backgroundColor || clip.color, "00"] },
    };
    const look = looks[clip.subtitleStyle];
    return look && { secondary: look.text, box: null, ...look };
  }
  // A plain (non-subtitle) text clip's 底色: a box this ASS transparency (0x55 = 2/3 opaque), padded `pad` output pixels.
  const TEXT_BOX = { transparency: "55", pad: 5 };
  // 逐字高亮／卡拉 OK: null = a still line (other style, no words, or words that no longer spell the line); else each
  // word with the space before it and its window, seconds from the clip start: 逐字高亮 lights it over [from, to) (to =
  // the next word's start, the last the clip end); 卡拉 OK fills it secondary -> text over [from, to) (from = after
  // every earlier word).
  function subtitleWordPlan(clip) {
    const TW = typeof module === "object" && module.exports ? require("./transcript-words.js") : root.TranscriptWords,
      words = clip.words;
    if (!["逐字高亮", "卡拉 OK"].includes(clip.subtitleStyle) || !TW.spells(words, clip.text)) return null;
    let at = 0;
    return words.map((w, i) => {
      const glue = i && TW.joinWords([words[i - 1].text, w.text]).length > words[i - 1].text.length + w.text.length ? " " : "";
      if (clip.subtitleStyle === "逐字高亮") return { text: w.text, glue, from: w.start, to: i + 1 < words.length ? words[i + 1].start : clip.duration };
      const from = Math.max(w.start, at);
      at = Math.max(at, w.end);
      return { text: w.text, glue, from, to: w.end };
    });
  }
  // The editor's five fonts: menu name -> the family inside the pinned files in vendor/fonts/ (vendor/fonts/sources.json,
  // scripts/vendor-fonts.cjs). The export names `family` in the ASS style with fontsdir = vendor/fonts; the preview loads
  // the same files as @font-face under `css` (an alias no installed font has), so both read one file per face. An unknown
  // name falls back to 思源黑體, as the export always did.
  const FONT_DIR = "vendor/fonts";
  const FONTS = {
    思源黑體: { family: "Noto Sans CJK TC", css: "VW Noto Sans CJK TC", regular: "NotoSansCJKtc-Regular.otf", bold: "NotoSansCJKtc-Bold.otf" },
    思源宋體: { family: "Noto Serif CJK TC", css: "VW Noto Serif CJK TC", regular: "NotoSerifCJKtc-Regular.otf", bold: "NotoSerifCJKtc-Bold.otf" },
    等寬字: { family: "Noto Sans Mono CJK TC", css: "VW Noto Sans Mono CJK TC", regular: "NotoSansMonoCJKtc-Regular.otf", bold: "NotoSansMonoCJKtc-Bold.otf" },
    Arial: { family: "Liberation Sans", css: "VW Liberation Sans", regular: "LiberationSans-Regular.ttf", bold: "LiberationSans-Bold.ttf" },
    Georgia: { family: "Gelasio", css: "VW Gelasio", regular: "Gelasio-Regular.ttf", bold: "Gelasio-Bold.ttf" },
  };
  const fontOf = (name) => FONTS[name] || FONTS.思源黑體;
  // 中文 in a Latin font (Arial / Georgia have no Han glyphs): the preview's CSS falls back to 思源黑體's file, so the
  // export switches these characters to 思源黑體 too (\fn) instead of letting libass ask the machine for a font.
  const CJK_CHAR = /[\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff\ufe30-\ufe4f\uff00-\uffef]|[\u{20000}-\u{3ffff}]/u;
  const api = {
    FONT_DIR,
    FONTS,
    fontOf,
    CJK_CHAR,
    TRANSITION_CURVES,
    transitionProgress,
    TEXT_ANIMATION,
    typeInterval,
    textAnimationAt,
    SUBTITLE_STYLES,
    SUBTITLE_HIGHLIGHT,
    SUBTITLE_EDGE,
    subtitleLook,
    TEXT_BOX,
    subtitleWordPlan,
    EFFECTS,
    effectValue,
    LIGHT_LEAK,
    SHAKE,
    shakeOffset,
    TRANSFORM,
    transformKeys,
    transformAt,
    NARRATION,
    DUCK,
    duckRanges,
    duckFactor,
    evalNumber,
    STYLE,
    styleGroup,
    DB,
    volumeToDb,
    dbToVolume,
    closeGaps,
    snapShift,
    freeStart,
    LIMITS,
    TOTAL,
    NAME,
    LEGACY,
    ID,
    normalizeTracks,
    mainTrack,
    canAdd,
    nextId,
    wordsWindow,
    kindOf: (id) => KIND[id?.[0]],
    TRANSITIONS,
    LEGACY_TRANSITIONS,
    transitionName,
    transitionLimits,
    transitionFrames,
    COLOR,
    graded,
    QUALITIES,
    LOUDNESS,
    MAX_KEYS,
    volumeKeys,
    gainAt,
  };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.EditorModel = api;
})(typeof globalThis === "object" ? globalThis : this);
