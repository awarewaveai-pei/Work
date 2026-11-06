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
    visual: ["filter", "mask", "grain", ...Object.keys(COLOR), "lut"],
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
  const api = {
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
