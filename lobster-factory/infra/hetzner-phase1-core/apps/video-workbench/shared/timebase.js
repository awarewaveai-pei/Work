// Card M3 (docs/creative-suite-plan-20261102.md §3 invariant 5): project time = rational fps + integer frames.
// Seconds exist only at the UI and FFmpeg boundaries. Browser global `Timebase`; require() in Node.
(function (root) {
  const allowed = [
    { num: 24, den: 1 },
    { num: 25, den: 1 },
    { num: 30, den: 1 },
    { num: 60, den: 1 },
    { num: 24000, den: 1001 },
    { num: 30000, den: 1001 },
    { num: 60000, den: 1001 },
  ];
  const DEFAULT = { num: 30, den: 1 };
  const find = (tb) =>
    allowed.find((a) => a.num === tb?.num && a.den === tb?.den) || null;
  function check(tb) {
    const found = find(tb);
    if (!found) throw Error("不支援的影格率");
    return { num: found.num, den: found.den };
  }
  const fps = (tb) => tb.num / tb.den;
  const label = (tb) =>
    (tb.den === 1
      ? String(tb.num)
      : (tb.num / tb.den).toFixed(2).replace(/0$/, "")) + " fps";
  const fromLabel = (text) => allowed.find((tb) => label(tb) === text) || null;
  const toFrames = (seconds, tb) =>
    Math.round((Number(seconds) * tb.num) / tb.den);
  const toSeconds = (frames, tb) => (frames * tb.den) / tb.num;
  // FFmpeg parses at most 6 fractional digits and truncates the rest (av_parse_time), so the string is the exact
  // quotient truncated to microseconds: never later than the frame's true time, so trim keeps that frame.
  function ffTime(frames, tb) {
    if (!Number.isSafeInteger(frames) || frames < 0) throw Error("影格數無效");
    const micro = (BigInt(frames) * BigInt(tb.den) * 1000000n) / BigInt(tb.num),
      whole = micro / 1000000n,
      fraction = String(micro % 1000000n)
        .padStart(6, "0")
        .replace(/0+$/, "");
    return fraction ? `${whole}.${fraction}` : String(whole);
  }
  const ffRate = (tb) => `${tb.num}/${tb.den}`;
  const api = {
    allowed,
    DEFAULT,
    find,
    check,
    fps,
    label,
    fromLabel,
    toFrames,
    toSeconds,
    ffTime,
    ffRate,
  };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Timebase = api;
})(typeof globalThis === "object" ? globalThis : this);
