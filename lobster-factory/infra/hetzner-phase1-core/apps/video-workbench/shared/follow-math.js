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
      let x = 0,
        y = 0,
        total = 0;
      for (const q of points) {
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
  function match(boxes, previous, appearance) {
    const candidates = boxes
      .map((box) => {
        const distance = Math.hypot(box.cx - previous.cx, box.cy - previous.cy),
          size = Math.abs(
            Math.log((box.w * box.h) / (previous.w * previous.h)),
          ),
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
          cost: distance * 3 + size * 0.2 + color * 1.2,
        };
      })
      .filter(
        (c) =>
          c.distance <= Math.max(0.18, previous.w * 1.25) &&
          c.size < 1.4 &&
          c.color < 0.75,
      )
      .sort((a, b) => a.cost - b.cost);
    if (
      !candidates.length ||
      (candidates.length > 1 && candidates[1].cost - candidates[0].cost < 0.025)
    )
      return null;
    return candidates[0].box;
  }
  const api = { sample, smooth, crop, match };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.FollowMath = api;
})(typeof self === "undefined" ? globalThis : self);
