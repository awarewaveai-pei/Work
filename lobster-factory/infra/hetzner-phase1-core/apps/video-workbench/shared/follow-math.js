// Smoothing/crop bounds adapted from FilmCraft auto_reframe, MIT.
// https://github.com/storytold/filmcraft/blob/main/crates/render/src/vfx/temporal.rs
// Copyright (c) 2026 ArtCraft Team and the FilmCraft contributors.
// See LICENSE-FilmCraft-MIT. Person selection/tracking is implemented separately.
(function (root) {
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  function sample(points, time) {
    if (!points.length) return { x: 0.5, y: 0.5 };
    let lo = 0,
      hi = points.length - 1;
    while (lo < hi) {
      const mid = Math.floor((lo + hi + 1) / 2);
      if (points[mid].time <= time) lo = mid;
      else hi = mid - 1;
    }
    const a = points[lo],
      b = points[Math.min(lo + 1, points.length - 1)],
      t =
        b.time > a.time ? clamp((time - a.time) / (b.time - a.time), 0, 1) : 0;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }
  function smooth(points, half = 0.5) {
    return points.map((p) => {
      if (p.lost) return { ...p };
      let x = 0,
        y = 0,
        total = 0;
      for (const q of points) {
        if (q.lost) continue;
        const distance = Math.abs(q.time - p.time);
        if (distance > half) continue;
        const weight = 1 - distance / (half + 0.125);
        x += q.x * weight;
        y += q.y * weight;
        total += weight;
      }
      return { ...p, x: total ? x / total : p.x, y: total ? y / total : p.y };
    });
  }
  function crop(width, height, point, outWidth = 720, outHeight = 1280) {
    const scale = Math.max(outWidth / width, outHeight / height),
      w = Math.ceil((width * scale) / 2) * 2,
      h = Math.ceil((height * scale) / 2) * 2;
    return {
      width: w,
      height: h,
      x: Math.round(clamp(point.x * w - outWidth / 2, 0, w - outWidth) / 2) * 2,
      y:
        Math.round(clamp(point.y * h - outHeight / 2, 0, h - outHeight) / 2) *
        2,
    };
  }
  function correlation(a, b) {
    if (!a?.length || a.length !== b?.length) return null;
    return a.reduce((sum, n, i) => sum + n * b[i], 0);
  }
  function overlap(a, b) {
    const area = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
      Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    return area / Math.max(0.000001, a.w * a.h + b.w * b.h - area);
  }
  function reviews(points) {
    const result = [];
    let active = null;
    for (const point of points) {
      if (!point.lost) { active = null; continue; }
      if (active && point.time - active.end <= 0.26) active.end = point.time;
      else { active = { time: point.time, end: point.time, key: point.time.toFixed(3) }; result.push(active); }
    }
    return result;
  }
  function match(boxes, previous, appearance) {
    const candidates = boxes
      .map((box) => {
        const distance = Math.hypot(box.cx - previous.cx, box.cy - previous.cy),
          size = Math.abs(
            Math.log((box.w * box.h) / (previous.w * previous.h)),
          ),
          similarity = correlation(box.patch, previous.patch),
          reference = correlation(box.patch, previous.referencePatch || previous.patch),
          distractor = Math.max(-1, ...(previous.negativePatches || []).map((patch) => correlation(box.patch, patch) ?? -1)),
          color =
            box.hist.reduce(
              (sum, n, i) => sum + Math.abs(n - (appearance[i] || 0)),
              0,
            ) / 2;
        return {
          box,
          distance,
          size,
          color,
          similarity,
          reference,
          distractor,
          cost: distance * 3 + size * 0.2 + color * 1.4 +
            (similarity === null ? 0 : (1 - similarity) * 0.65),
        };
      })
      .filter(
        (c) =>
          c.distance <= Math.max(0.12, Math.min(0.24, previous.w * 0.8)) &&
          c.size < 1.05 &&
          c.color < 0.6 &&
          (c.similarity === null || c.similarity >= 0.15) &&
          (c.reference === null || c.reference >= 0.12) &&
          (c.box.score == null || c.box.score >= 0.4) &&
          !(c.distractor > 0.55 && c.distractor > c.reference + 0.08),
      )
      .sort((a, b) => a.cost - b.cost);
    if (
      !candidates.length ||
      (candidates.length > 1 && candidates[1].cost - candidates[0].cost < 0.1)
    )
      return null;
    return candidates[0].box;
  }
  const api = { sample, smooth, crop, match, correlation, overlap, reviews };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.FollowMath = api;
})(typeof self === "undefined" ? globalThis : self);
