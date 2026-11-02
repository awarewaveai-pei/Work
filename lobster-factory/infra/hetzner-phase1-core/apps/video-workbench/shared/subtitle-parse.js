// Card P2: the one SRT / WebVTT parser (editor import and the subtitle tool). Pure: text in, cues out
// [{startMs, endMs, text}] in file order; overlapping cues are kept as they are. Errors are 繁中 and name the cue.
// Browser global `SubtitleParse`; require() in Node.
(function (root) {
  const MAX_CUES = 2000;
  // hh:mm:ss.mmm or mm:ss.mmm (hours optional); SRT writes ',' before the milliseconds, VTT '.'; a missing
  // millisecond part reads as .000 (hand-typed files in the subtitle tool).
  const STAMP = /^(?:(\d{1,3}):)?([0-5]?\d):([0-5]\d)(?:[.,](\d{1,3}))?$/;
  function stamp(value, n) {
    const m = STAMP.exec(String(value || "").trim());
    if (!m)
      throw Error(
        `第 ${n} 段字幕時間格式錯誤：「${String(value || "")
          .trim()
          .slice(0, 40)}」`,
      );
    return (
      ((Number(m[1] || 0) * 60 + Number(m[2])) * 60 + Number(m[3])) * 1000 +
      Number((m[4] || "").padEnd(3, "0"))
    );
  }
  // Inline markup (<i>, <b>, <font ...>, VTT <v Speaker>, <c.class>, timestamps <00:01.000>) is not text.
  const plain = (line) =>
    line
      .replace(/<[^>\n]*>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&nbsp;/g, " ");
  function parse(input) {
    if (typeof input !== "string") throw Error("字幕內容必須是文字");
    const text = input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n"),
      vtt = /^WEBVTT(?:[ \t][^\n]*)?(?:\n|$)/.test(text);
    if (!vtt && /^WEBVTT/.test(text)) throw Error("WebVTT 檔頭格式錯誤");
    const blocks = text.split(/\n[ \t]*\n+/),
      cues = [];
    blocks.forEach((block, i) => {
      if (vtt && i === 0) return; // the WEBVTT header block (header line + optional metadata lines)
      const lines = block.replace(/^\n+/, "").split("\n");
      if (!lines[0]?.trim()) return;
      if (vtt && /^(NOTE|STYLE|REGION)(?:[ \t]|$)/.test(lines[0])) return;
      const at = lines.findIndex((line) => line.includes("-->"));
      const n = cues.length + 1;
      if (at < 0) {
        // A bare SRT index with nothing after it, or stray text: refuse rather than drop a cue silently.
        throw Error(`第 ${n} 段字幕缺少時間（找不到「-->」）`);
      }
      if (at > 1) throw Error(`第 ${n} 段字幕格式錯誤：時間行之前有多餘文字`);
      const [from, rest = ""] = lines[at].split("-->"),
        startMs = stamp(from, n),
        endMs = stamp(rest.trim().split(/[ \t]+/)[0], n); // VTT cue settings follow the end time
      if (endMs <= startMs) throw Error(`第 ${n} 段字幕結束時間需晚於開始時間`);
      const body = lines
        .slice(at + 1)
        .map(plain)
        .join("\n")
        .replace(/^\n+|\n+$/g, "");
      if (!body.trim()) throw Error(`第 ${n} 段字幕沒有文字`);
      cues.push({ startMs, endMs, text: body });
    });
    if (!cues.length) throw Error("字幕檔沒有有效的 SRT／VTT 時間碼");
    if (cues.length > MAX_CUES) throw Error(`單次字幕檔最多 ${MAX_CUES} 段`);
    return cues;
  }
  const api = { parse, MAX_CUES };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SubtitleParse = api;
})(typeof globalThis === "object" ? globalThis : this);
