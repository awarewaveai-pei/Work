// Card ED.10: word-level transcript helpers shared by the page (browser global `TranscriptWords`) and the server
// (require() in Node). ED.11 (剪贅字) reads fillers and pauses from here; nothing in this file cuts media.
// A word = { start, end, text } in seconds (timeline seconds for a whole-project transcript); `source` (optional)
// = which recording it came from, so pauses are only measured inside one recording.
(function (root) {
  // Hesitation sounds only: words that carry meaning in some sentences (「那個」「就是」「like」) are never listed.
  const FILLERS = ["嗯", "呃", "額", "唔", "欸", "誒", "um", "umm", "uh", "uhh", "uhm", "erm", "er", "hmm", "mm", "mhm", "ah",
    "えー", "えーと", "えっと", "あのー", "음", "어", "으음", "เอ่อ", "อืม"];
  const REVIEW_THRESHOLD = 0.8; // spec §1.3: score < 0.8 = 需校對
  // Repeats of one sound count too (嗯嗯, ummm, えーー): punctuation is ignored, repeated letters fold to one.
  const clean = (text) => String(text ?? "").trim().toLowerCase().replace(/[\s.,!?;:，。！？、…~～「」"'()（）-]+/g, "");
  const squeeze = (s) => s.replace(/(.)\1+/gu, "$1");
  const FILLER_SET = new Set(FILLERS.map((f) => squeeze(clean(f))));
  function isFiller(text) {
    const word = clean(text);
    return !!word && (FILLER_SET.has(word) || FILLER_SET.has(squeeze(word)));
  }
  // Copies words in time order with filler (bool) and pauseAfter (seconds of silence before the next word of the same
  // recording; null after the last word of a recording).
  function annotate(words) {
    const list = (Array.isArray(words) ? words : [])
      .filter((w) => w && Number.isFinite(w.start) && Number.isFinite(w.end) && w.end >= w.start)
      .map((w) => ({ ...w }))
      .sort((a, b) => a.start - b.start || a.end - b.end);
    list.forEach((w, i) => {
      const next = list.slice(i + 1).find((n) => (n.source ?? null) === (w.source ?? null));
      w.filler = isFiller(w.text);
      w.pauseAfter = next ? Math.max(0, Math.round((next.start - w.end) * 1000) / 1000) : null;
    });
    return list;
  }
  // Ranges [start, end] (seconds) that 剪贅字 would remove: every filler word (when fillers is on) and the part of each
  // pause beyond maxPause, the kept silence split evenly around the cut. Overlapping ranges merge; sorted.
  function cutRanges(words, { maxPause = 0.5, fillers = true } = {}) {
    if (!(maxPause >= 0)) throw Error("停頓秒數無效");
    const list = annotate(words), ranges = [];
    list.forEach((w, i) => {
      if (fillers && w.filler) ranges.push([w.start, w.end]);
      if (w.pauseAfter != null && w.pauseAfter > maxPause) {
        const next = list.slice(i + 1).find((n) => (n.source ?? null) === (w.source ?? null)),
          keep = maxPause / 2;
        ranges.push([w.end + keep, next.start - keep]);
      }
    });
    const merged = [];
    for (const [a, b] of ranges.filter(([a, b]) => b > a).sort((p, q) => p[0] - q[0])) {
      const last = merged.at(-1);
      if (last && a <= last[1]) last[1] = Math.max(last[1], b);
      else merged.push([a, b]);
    }
    return merged.map(([a, b]) => [Math.round(a * 1000) / 1000, Math.round(b * 1000) / 1000]);
  }
  // A line from its words: a space between two words unless either side is CJK / kana / hangul / Thai (written without
  // spaces) or the next word starts with closing punctuation.
  const TIGHT = /[\u0e00-\u0e7f\u3000-\u9fff\uac00-\ud7af\uf900-\ufaff\uff00-\uffef]/u;
  const joinWords = (texts) =>
    texts.map((t) => String(t ?? "").trim()).filter(Boolean).reduce((line, t) =>
      !line || TIGHT.test(line.at(-1)) || TIGHT.test(t[0]) || /^[,.!?;:%)\]]/.test(t) ? line + t : line + " " + t, "");
  // Card ED.10: word times still describe a line only while they spell it (whitespace ignored). The exporter burns
  // 逐字高亮／卡拉 OK only then; the editor rewrites the line from its words only then.
  const spells = (words, text) =>
    Array.isArray(words) && words.length > 0 &&
    joinWords(words.map((w) => w.text)).replace(/\s+/g, "") === String(text ?? "").replace(/\s+/g, "");
  const api = { FILLERS, REVIEW_THRESHOLD, isFiller, annotate, cutRanges, joinWords, spells };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TranscriptWords = api;
})(typeof globalThis === "object" ? globalThis : this);
