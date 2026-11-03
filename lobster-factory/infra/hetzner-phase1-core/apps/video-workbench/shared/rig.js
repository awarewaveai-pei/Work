// Card P4 (handoff §4.6): 2D character rig. Pure, deterministic math + Canvas 2D drawing shared by the rig
// workspace, the compositor's "rig" layer (preview and output both call draw()) and the unit tests.
// A rig lives under its character (character.rigs[]), separate from images (parts reference library assets; the
// originals are never modified) and from animation (a composition layer holds the keyframed controls).
// Units: rig space = pixels of rig.canvas; bone.angle = rest direction in degrees (0 = +x, y down = clockwise);
// a bone's rotation control = degrees from its rest pose, relative to its parent; joint limits clamp that value.
// Browser global `Rig`; require() in Node.
(function (root) {
  "use strict";
  const RAD = Math.PI / 180;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const num = (v, d = 0) =>
    typeof v === "number" && Number.isFinite(v) ? v : d;
  const wrap = (a) => {
    let x = ((((a + 180) % 360) + 360) % 360) - 180;
    if (x === -180) x = 180;
    return x;
  };
  const ID = [1, 0, 0, 1, 0, 0];
  const multiply = (m, n) => [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
  const apply = (m, p) => [
    m[0] * p[0] + m[2] * p[1] + m[4],
    m[1] * p[0] + m[3] * p[1] + m[5],
  ];
  function invert(m) {
    const det = m[0] * m[3] - m[1] * m[2];
    if (!det) return ID.slice();
    return [
      m[3] / det,
      -m[1] / det,
      -m[2] / det,
      m[0] / det,
      (m[2] * m[5] - m[3] * m[4]) / det,
      (m[1] * m[4] - m[0] * m[5]) / det,
    ];
  }
  const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const tailOf = (b) => [
    b.x + Math.cos(b.angle * RAD) * b.length,
    b.y + Math.sin(b.angle * RAD) * b.length,
  ];

  // ---- bones / FK -------------------------------------------------------------------------------------------
  // Parents before children; a bone whose parent is missing or on a loop is treated as a root.
  function ordered(rig) {
    const bones = Array.isArray(rig?.bones) ? rig.bones : [],
      ids = new Set(bones.map((b) => b.id)),
      placed = new Set(),
      out = [];
    let left = bones.filter((b) => {
      if (b.parent && ids.has(b.parent)) return true;
      out.push(b.parent ? { ...b, parent: null } : b);
      placed.add(b.id);
      return false;
    });
    while (left.length) {
      const still = [];
      for (const b of left)
        placed.has(b.parent) ? (out.push(b), placed.add(b.id)) : still.push(b);
      if (still.length === left.length) {
        // what remains sits on a loop: the first one becomes a root, the rest follow from it
        const [cut, ...rest] = still;
        out.push({ ...cut, parent: null });
        placed.add(cut.id);
        left = rest;
      } else left = still;
    }
    return out;
  }
  const limit = (b, r) => {
    let v = num(r);
    if (Number.isFinite(b.min)) v = Math.max(v, b.min);
    if (Number.isFinite(b.max)) v = Math.min(v, b.max);
    return v;
  };
  // rot: { boneId: degrees from rest }. Returns Map id -> { x, y, angle (deg, world), tail, m (rest -> posed) }.
  function fk(bones, rot) {
    const posed = new Map(),
      rest = new Map(bones.map((b) => [b.id, b]));
    for (const b of bones) {
      const p = b.parent ? posed.get(b.parent) : null,
        pr = b.parent ? rest.get(b.parent) : null;
      const angle = p
        ? p.angle + (b.angle - pr.angle) + num(rot[b.id])
        : b.angle + num(rot[b.id]);
      const head = p ? apply(p.m, [b.x, b.y]) : [b.x, b.y];
      const phi = (angle - b.angle) * RAD,
        c = Math.cos(phi),
        s = Math.sin(phi);
      const m = [
        c,
        s,
        -s,
        c,
        head[0] - (c * b.x - s * b.y),
        head[1] - (s * b.x + c * b.y),
      ];
      posed.set(b.id, {
        x: head[0],
        y: head[1],
        angle,
        tail: [
          head[0] + Math.cos(angle * RAD) * b.length,
          head[1] + Math.sin(angle * RAD) * b.length,
        ],
        m,
      });
    }
    return posed;
  }

  // ---- IK ---------------------------------------------------------------------------------------------------
  // Two segments from a (lengths l1, l2) toward t. bend 1 / -1 picks the elbow side. Returns segment angles (rad).
  // Out of reach = both segments straight toward t; inside the inner radius = folded as far as the lengths allow.
  function solveTwo(a, l1, l2, t, bend = 1) {
    const phi = Math.atan2(t[1] - a[1], t[0] - a[0]);
    let d = dist(a, t);
    if (d >= l1 + l2 || l1 <= 0 || l2 <= 0)
      return { angles: [phi, phi], reached: d <= l1 + l2 + 1e-9 };
    d = Math.max(d, Math.abs(l1 - l2) + 1e-9);
    const cosA = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1),
      a1 = phi + (bend < 0 ? -1 : 1) * Math.acos(cosA),
      b = [a[0] + Math.cos(a1) * l1, a[1] + Math.sin(a1) * l1],
      tt = [a[0] + Math.cos(phi) * d, a[1] + Math.sin(phi) * d];
    return {
      angles: [a1, Math.atan2(tt[1] - b[1], tt[0] - b[0])],
      reached: true,
    };
  }
  // FABRIK on joint points (n segments = points.length - 1). Deterministic: fixed iteration cap and tolerance.
  function fabrik(
    points,
    lengths,
    t,
    { iterations = 40, tolerance = 0.01 } = {},
  ) {
    const p = points.map((q) => [q[0], q[1]]),
      n = lengths.length,
      root = p[0],
      total = lengths.reduce((a, b) => a + b, 0);
    const toward = (from, to, len) => {
      const dx = to[0] - from[0],
        dy = to[1] - from[1],
        l = Math.hypot(dx, dy);
      return l < 1e-12
        ? [from[0] + len, from[1]]
        : [from[0] + (dx / l) * len, from[1] + (dy / l) * len];
    };
    if (dist(root, t) >= total) {
      for (let i = 0; i < n; i++) p[i + 1] = toward(p[i], t, lengths[i]);
      return { points: p, reached: dist(root, t) <= total + 1e-9 };
    }
    for (let k = 0; k < iterations && dist(p[n], t) > tolerance; k++) {
      p[n] = [t[0], t[1]];
      for (let i = n - 1; i >= 0; i--)
        p[i] = toward(p[i + 1], p[i], lengths[i]);
      p[0] = [root[0], root[1]];
      for (let i = 0; i < n; i++) p[i + 1] = toward(p[i], p[i + 1], lengths[i]);
    }
    return { points: p, reached: true };
  }
  // A chain = consecutive bones (each the parent of the next). Joint points: each bone's head + the last tail.
  function chainBones(rig, chain, byId) {
    const ids = (chain?.bones || []).filter((id) => byId.has(id));
    if (!ids.length || ids.length !== (chain.bones || []).length) return null;
    for (let i = 1; i < ids.length; i++)
      if (byId.get(ids[i]).parent !== ids[i - 1]) return null;
    return ids.map((id) => byId.get(id));
  }

  // ---- pose -------------------------------------------------------------------------------------------------
  // values = { rot: {boneId: deg}, ik: {chainId: [x, y]}, pins: {pinId: [dx, dy]} } -> { posed, rot, m(id) }.
  // Order: FK rotations (clamped) -> each enabled IK chain with a target (2 bones analytic, more FABRIK, 1 aims)
  // -> joint limits applied to the solved rotations -> final FK.
  function solve(rig, values = {}) {
    const bones = ordered(rig),
      byId = new Map(bones.map((b) => [b.id, b])),
      rot = {};
    for (const b of bones) rot[b.id] = limit(b, values.rot?.[b.id]);
    let posed = fk(bones, rot);
    for (const ch of rig.chains || []) {
      if (ch.enabled === false) continue;
      const t = values.ik?.[ch.id];
      if (!Array.isArray(t) || !t.every(Number.isFinite)) continue;
      const list = chainBones(rig, ch, byId);
      if (!list) continue;
      const restPts = [...list.map((b) => [b.x, b.y]), tailOf(list.at(-1))],
        lengths = list.map((_, i) => dist(restPts[i], restPts[i + 1])),
        start = [posed.get(list[0].id).x, posed.get(list[0].id).y];
      let seg;
      if (list.length === 1)
        seg = [Math.atan2(t[1] - start[1], t[0] - start[0])];
      else if (list.length === 2)
        seg = solveTwo(start, lengths[0], lengths[1], t, ch.bend).angles;
      else {
        const pts = [start];
        for (let i = 0; i < list.length; i++)
          pts.push(
            i + 1 < list.length
              ? [posed.get(list[i + 1].id).x, posed.get(list[i + 1].id).y]
              : posed.get(list[i].id).tail,
          );
        const out = fabrik(pts, lengths, t).points;
        seg = lengths.map((_, i) =>
          Math.atan2(out[i + 1][1] - out[i][1], out[i + 1][0] - out[i][0]),
        );
      }
      list.forEach((b, i) => {
        const restSeg =
            Math.atan2(
              restPts[i + 1][1] - restPts[i][1],
              restPts[i + 1][0] - restPts[i][0],
            ) / RAD,
          world = seg[i] / RAD - (restSeg - b.angle),
          p = b.parent ? posed.get(b.parent) : null,
          pr = b.parent ? byId.get(b.parent) : null;
        const r = p ? world - p.angle - b.angle + pr.angle : world - b.angle;
        rot[b.id] = limit(b, wrap(r));
        posed = fk(bones, rot);
      });
    }
    return { posed, rot, bones, m: (id) => posed.get(id)?.m || ID };
  }

  // ---- puppet mesh --------------------------------------------------------------------------------------------
  const DENSITY = { coarse: 4, medium: 8, fine: 14 };
  const DENSITY_LABEL = { coarse: "粗", medium: "中", fine: "細" };
  // Grid over the part, cells without one opaque pixel dropped. opaque(x0, y0, x1, y1) -> bool in part-local px.
  // Vertices (and pins) are stored normalised to the part (0..1, space "unit"), so resizing the part scales the
  // mesh with it instead of cropping the texture (review 2026-11-03 #2).
  function buildMesh(width, height, density, opaque) {
    const cols = DENSITY[density] || DENSITY.medium,
      cell = Math.max(width, height) / cols,
      nx = Math.max(1, Math.ceil(width / cell - 1e-9)),
      ny = Math.max(1, Math.ceil(height / cell - 1e-9));
    const index = new Map(),
      vertices = [],
      triangles = [];
    const vid = (i, j) => {
      const k = i + "," + j;
      if (!index.has(k)) {
        index.set(k, vertices.length);
        vertices.push([Math.min(width, i * cell) / width, Math.min(height, j * cell) / height]);
      }
      return index.get(k);
    };
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const x0 = i * cell,
          y0 = j * cell,
          x1 = Math.min(width, x0 + cell),
          y1 = Math.min(height, y0 + cell);
        if (opaque && !opaque(x0, y0, x1, y1)) continue;
        const a = vid(i, j),
          b = vid(i + 1, j),
          c = vid(i + 1, j + 1),
          d = vid(i, j + 1);
        triangles.push([a, b, c], [a, c, d]);
      }
    return {
      density: DENSITY[density] ? density : "medium",
      space: "unit",
      vertices,
      triangles,
    };
  }
  // Moving least squares, rigid (Schaefer et al. 2006), closed form in 2D: weights 1/|p - v|^2; the rotation is the
  // normalised sum of w q̂ conj(p̂). Unmoved pins = identity; at a pin = that pin's target exactly.
  function mlsRigid(v, P, Q) {
    if (!P.length) return [v[0], v[1]];
    let sw = 0,
      px = 0,
      py = 0,
      qx = 0,
      qy = 0;
    const w = [];
    for (let i = 0; i < P.length; i++) {
      const d2 = (P[i][0] - v[0]) ** 2 + (P[i][1] - v[1]) ** 2;
      if (d2 < 1e-12) return [Q[i][0], Q[i][1]];
      w[i] = 1 / d2;
      sw += w[i];
      px += w[i] * P[i][0];
      py += w[i] * P[i][1];
      qx += w[i] * Q[i][0];
      qy += w[i] * Q[i][1];
    }
    px /= sw;
    py /= sw;
    qx /= sw;
    qy /= sw;
    let re = 0,
      im = 0;
    for (let i = 0; i < P.length; i++) {
      const ax = P[i][0] - px,
        ay = P[i][1] - py,
        bx = Q[i][0] - qx,
        by = Q[i][1] - qy;
      re += w[i] * (bx * ax + by * ay);
      im += w[i] * (by * ax - bx * ay);
    }
    const len = Math.hypot(re, im),
      c = len < 1e-12 ? 1 : re / len,
      s = len < 1e-12 ? 0 : im / len,
      dx = v[0] - px,
      dy = v[1] - py;
    return [c * dx - s * dy + qx, s * dx + c * dy + qy];
  }

  // ---- weights / skinning -------------------------------------------------------------------------------------
  function segDist(p, a, b) {
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      l2 = dx * dx + dy * dy,
      t = l2 ? clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2, 0, 1) : 0;
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  }
  // Rest distance from each vertex (rig space) to each bone segment; the 2 nearest bones, 1/(d+1)^2, normalised.
  function autoWeights(verts, rig) {
    const bones = Array.isArray(rig?.bones) ? rig.bones : [];
    return verts.map((v) => {
      if (!bones.length) return {};
      const near = bones
        .map((b) => ({ id: b.id, d: segDist(v, [b.x, b.y], tailOf(b)) }))
        .sort((a, b) => a.d - b.d || (a.id < b.id ? -1 : 1))
        .slice(0, 2);
      const raw = near.map((n) => 1 / (n.d + 1) ** 2),
        sum = raw.reduce((a, b) => a + b, 0),
        out = {};
      near.forEach((n, i) => (out[n.id] = raw[i] / sum));
      return out;
    });
  }
  // Linear blend skinning of a rest-space point.
  function lbs(v, weights, solved) {
    let x = 0,
      y = 0,
      sum = 0;
    for (const [id, w] of Object.entries(weights || {})) {
      if (!(w > 0) || !solved.posed.has(id)) continue;
      const q = apply(solved.m(id), v);
      x += w * q[0];
      y += w * q[1];
      sum += w;
    }
    return sum > 0 ? [x / sum, y / sum] : [v[0], v[1]];
  }
  // Sets bone `id` to `value` in a vertex's weights and rescales the others so the total stays 1. No other bone
  // carrying weight: the remainder goes to the nearest other bone (fallback), or the vertex stays fully on `id`.
  function setWeight(wt, id, value, fallback) {
    const others = Object.entries(wt).filter(([k, w]) => k !== id && w > 0),
      rest = others.reduce((a, [, w]) => a + w, 0),
      v = clamp(value, 0, 1),
      out = {};
    if (rest > 1e-12)
      for (const [k, w] of others) out[k] = (w / rest) * (1 - v);
    else if (v < 1 && fallback) out[fallback] = 1 - v;
    else return { [id]: 1 };
    if (v > 0) out[id] = v;
    return out;
  }
  function neighbours(mesh) {
    const n = mesh.vertices.map(() => new Set());
    for (const [a, b, c] of mesh.triangles) {
      n[a].add(b).add(c);
      n[b].add(a).add(c);
      n[c].add(a).add(b);
    }
    return n.map((s) => [...s]);
  }
  // Weight brush on a mesh (rest rig-space vertices `verts`). mode add | subtract | smooth; linear falloff.
  // mesh.weights is started from the auto weights the first time. Returns the number of vertices touched.
  function paintWeights(
    mesh,
    verts,
    rig,
    { x, y, radius, bone, strength, mode },
  ) {
    const auto = autoWeights(verts, rig);
    if (!Array.isArray(mesh.weights) || mesh.weights.length !== verts.length)
      mesh.weights = auto.map((w) => ({ ...w }));
    const nb = mode === "smooth" ? neighbours(mesh) : null,
      before = mesh.weights.map((w) => w[bone] || 0),
      r = Math.max(1e-6, num(radius, 30)),
      s = clamp(num(strength, 0.5), 0, 1);
    let touched = 0;
    verts.forEach((v, i) => {
      const d = Math.hypot(v[0] - x, v[1] - y);
      if (d > r) return;
      const f = s * (1 - d / r);
      let target;
      if (mode === "add") target = before[i] + f;
      else if (mode === "subtract") target = before[i] - f;
      else {
        const list = nb[i];
        if (!list.length) return;
        const avg = list.reduce((a, j) => a + before[j], 0) / list.length;
        target = before[i] + (avg - before[i]) * f;
      }
      const fallback =
        Object.keys(auto[i]).find((k) => k !== bone) ||
        (rig.bones || []).find((b) => b.id !== bone)?.id;
      mesh.weights[i] = setWeight(mesh.weights[i], bone, target, fallback);
      touched++;
    });
    mesh.weightsEdited = true;
    return touched;
  }

  // ---- deformation + drawing -----------------------------------------------------------------------------------
  // A mesh saved before meshes were normalised (part-local px at the part's size then) -> unit space. Copies.
  function unitMesh(mesh, part) {
    if (mesh.space === "unit") return mesh;
    const w = part.width || 1, h = part.height || 1;
    return { ...mesh, space: "unit", vertices: (mesh.vertices || []).map(([x, y]) => [x / w, y / h]), pins: (mesh.pins || []).map((p) => ({ ...p, x: p.x / w, y: p.y / h })) };
  }
  const toRig = (part, u, v) => [part.x + u * part.width, part.y + v * part.height];
  const restVerts = (mesh, part) => unitMesh(mesh, part).vertices.map(([u, v]) => toRig(part, u, v));
  const restPins = (mesh, part) => (unitMesh(mesh, part).pins || []).map((p) => toRig(part, p.x, p.y));
  // Posed mesh vertices (rig space).
  // Rigid part: pins (MLS rigid) in the part's rest frame, a pin may follow another bone, then the part's bone.
  // Skinned part: LBS first (edited weights or the auto ones), then the pins in that same posed space: each pin sits
  // on the skinned surface (its nearest vertex's weights) and its target is that point, or -- when it follows a
  // bone -- the bone's motion of it, plus the pin offset (review 2026-11-03 #3).
  function deformMesh(rig, mesh, part, solved, values = {}, { weights } = {}) {
    const verts = restVerts(mesh, part),
      mPart = part.bone ? solved.m(part.bone) : ID,
      inv = invert(mPart),
      pins = Array.isArray(mesh.pins) ? mesh.pins : [],
      P = restPins(mesh, part);
    if (mesh.skin) {
      const W =
        weights ||
        (Array.isArray(mesh.weights) && mesh.weights.length === verts.length
          ? mesh.weights
          : autoWeights(verts, rig));
      const S = verts.map((v, i) => lbs(v, W[i], solved));
      if (!pins.length) return S;
      const nearest = (p) => {
        let best = 0, d = Infinity;
        verts.forEach((v, i) => {
          const e = (v[0] - p[0]) ** 2 + (v[1] - p[1]) ** 2;
          if (e < d) (d = e), (best = i);
        });
        return best;
      };
      const Sp = P.map((p) => lbs(p, W[nearest(p)] || {}, solved)),
        Q = pins.map((p, i) => {
          const d = values.pins?.[p.id] || [0, 0],
            q = p.bone && solved.posed.has(p.bone) ? apply(solved.m(p.bone), P[i]) : Sp[i];
          return [q[0] + num(d[0]), q[1] + num(d[1])];
        });
      return S.map((v) => mlsRigid(v, Sp, Q));
    }
    let out = verts;
    if (pins.length) {
      const Q = pins.map((p, i) => {
          const d = values.pins?.[p.id] || [0, 0];
          let q = P[i];
          if (
            p.bone &&
            p.bone !== part.bone &&
            solved.posed.has(p.bone)
          )
            q = apply(inv, apply(solved.m(p.bone), q));
          return [q[0] + num(d[0]), q[1] + num(d[1])];
        });
      out = out.map((v) => mlsRigid(v, P, Q));
    }
    return out.map((v) => apply(mPart, v));
  }
  const sizeOf = (img) => [
    img.naturalWidth || img.videoWidth || img.width || 0,
    img.naturalHeight || img.videoHeight || img.height || 0,
  ];
  // Per-triangle affine texture mapping: clip to the (0.5 device-px expanded) destination triangle, map the source
  // triangle onto it, draw the image. Expansion hides the hairline seams antialiased clip edges would leave.
  function drawMesh(ctx, img, mesh, part, posedVerts) {
    const [iw, ih] = sizeOf(img);
    if (!iw || !ih || !part.width || !part.height) return;
    // Source = unit vertex × image size: the whole texture always spans the whole mesh.
    const uv = unitMesh(mesh, part).vertices,
      sx = iw,
      sy = ih,
      t = ctx.getTransform ? ctx.getTransform() : { a: 1, b: 0, c: 0, d: 1 },
      scale = Math.sqrt(Math.abs(t.a * t.d - t.b * t.c)) || 1,
      grow = 0.5 / scale;
    for (const [i, j, k] of mesh.triangles) {
      const s0 = [uv[i][0] * sx, uv[i][1] * sy],
        s1 = [uv[j][0] * sx, uv[j][1] * sy],
        s2 = [uv[k][0] * sx, uv[k][1] * sy],
        d0 = posedVerts[i],
        d1 = posedVerts[j],
        d2 = posedVerts[k];
      const ux = s1[0] - s0[0],
        uy = s1[1] - s0[1],
        wx = s2[0] - s0[0],
        wy = s2[1] - s0[1],
        den = ux * wy - wx * uy;
      if (Math.abs(den) < 1e-9) continue;
      const D1x = d1[0] - d0[0],
        D1y = d1[1] - d0[1],
        D2x = d2[0] - d0[0],
        D2y = d2[1] - d0[1];
      const a = (D1x * wy - D2x * uy) / den,
        c = (D2x * ux - D1x * wx) / den,
        b = (D1y * wy - D2y * uy) / den,
        d = (D2y * ux - D1y * wx) / den;
      const e = d0[0] - a * s0[0] - c * s0[1],
        f = d0[1] - b * s0[0] - d * s0[1];
      const cx = (d0[0] + d1[0] + d2[0]) / 3,
        cy = (d0[1] + d1[1] + d2[1]) / 3;
      const out = [d0, d1, d2].map((p) => {
        const l = Math.hypot(p[0] - cx, p[1] - cy) || 1;
        return [
          p[0] + ((p[0] - cx) / l) * grow,
          p[1] + ((p[1] - cy) / l) * grow,
        ];
      });
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(out[0][0], out[0][1]);
      ctx.lineTo(out[1][0], out[1][1]);
      ctx.lineTo(out[2][0], out[2][1]);
      ctx.closePath();
      ctx.clip();
      ctx.transform(a, b, c, d, e, f);
      // Only the source triangle's box (plus a pixel) is drawn: same pixels, far less work than the whole image.
      const x0 = Math.max(0, Math.floor(Math.min(s0[0], s1[0], s2[0]) - 1)),
        y0 = Math.max(0, Math.floor(Math.min(s0[1], s1[1], s2[1]) - 1)),
        x1 = Math.min(iw, Math.ceil(Math.max(s0[0], s1[0], s2[0]) + 1)),
        y1 = Math.min(ih, Math.ceil(Math.max(s0[1], s1[1], s2[1]) + 1));
      if (x1 > x0 && y1 > y0)
        ctx.drawImage(img, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
      ctx.restore();
    }
  }
  // Draws the rig at `values` into ctx (whose transform = the layer's). image(part) -> drawable | null.
  // Parts: list order = stacking order, index 0 on top (as the compositor's layer list). opts.weights(mesh) may
  // override a skinned mesh's weights (the workspace's 自動 vs 編輯後 comparison).
  function draw(ctx, rig, values, image, opts = {}) {
    const solved = solve(rig, values),
      missing = [],
      parts = Array.isArray(rig.parts) ? rig.parts : [];
    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i];
      if (part.hidden) continue;
      const img = image(part);
      if (!img) {
        missing.push(part.name || "部件");
        continue;
      }
      const mesh = (rig.meshes || []).find((m) => m.partId === part.id);
      if (mesh && mesh.triangles?.length)
        drawMesh(
          ctx,
          img,
          mesh,
          part,
          deformMesh(rig, mesh, part, solved, values, {
            weights: opts.weights?.(mesh),
          }),
        );
      else {
        ctx.save();
        const m = part.bone ? solved.m(part.bone) : ID;
        ctx.transform(...m);
        ctx.drawImage(img, part.x, part.y, part.width, part.height);
        ctx.restore();
      }
    }
    return { missing, solved };
  }

  // ---- controls (the keyframable props of a composition "rig" layer) --------------------------------------------
  const boneProp = (id) => "b_" + id;
  const ikProp = (id, axis) => "ik_" + id + "_" + axis;
  const pinProp = (id, axis) => "pin_" + id + "_" + axis;
  function ikRest(rig, chain) {
    const byId = new Map((rig.bones || []).map((b) => [b.id, b])),
      last = byId.get(chain.bones?.at(-1));
    return last ? tailOf(last) : [0, 0];
  }
  // [{ name, label, def, group }] in a stable order: bones, IK targets, pins.
  function controls(rig) {
    const out = [];
    for (const b of rig.bones || [])
      out.push({
        name: boneProp(b.id),
        label: `${b.name}・旋轉（度）`,
        def: 0,
        group: "bone",
        id: b.id,
      });
    for (const ch of rig.chains || []) {
      const [x, y] = ikRest(rig, ch);
      out.push({
        name: ikProp(ch.id, "x"),
        label: `${ch.name}・IK 目標 X`,
        def: Math.round(x * 1000) / 1000,
        group: "ik",
        id: ch.id,
      });
      out.push({
        name: ikProp(ch.id, "y"),
        label: `${ch.name}・IK 目標 Y`,
        def: Math.round(y * 1000) / 1000,
        group: "ik",
        id: ch.id,
      });
    }
    for (const m of rig.meshes || []) {
      const part = (rig.parts || []).find((p) => p.id === m.partId);
      (m.pins || []).forEach((p, i) => {
        out.push({
          name: pinProp(p.id, "x"),
          label: `${part?.name || "網格"}・控制釘 ${i + 1} 位移 X`,
          def: 0,
          group: "pin",
          id: p.id,
        });
        out.push({
          name: pinProp(p.id, "y"),
          label: `${part?.name || "網格"}・控制釘 ${i + 1} 位移 Y`,
          def: 0,
          group: "pin",
          id: p.id,
        });
      });
    }
    return out;
  }
  // Pose values from a control reader get(name) -> number | undefined (undefined = the control's default).
  function valuesFrom(rig, get) {
    const v = { rot: {}, ik: {}, pins: {} },
      g = (name, d) => num(Number(get(name)), d);
    for (const b of rig.bones || []) v.rot[b.id] = g(boneProp(b.id), 0);
    for (const ch of rig.chains || []) {
      const [x, y] = ikRest(rig, ch);
      v.ik[ch.id] = [g(ikProp(ch.id, "x"), x), g(ikProp(ch.id, "y"), y)];
    }
    for (const m of rig.meshes || [])
      for (const p of m.pins || [])
        v.pins[p.id] = [g(pinProp(p.id, "x"), 0), g(pinProp(p.id, "y"), 0)];
    return v;
  }
  // The rig as stored at a version: the current one, or a copy kept in history (last 20).
  function atVersion(rig, version) {
    if (!rig) return null;
    if (rig.version === version) return rig;
    return (rig.history || []).find((h) => h.version === version) || null;
  }

  // ---- pose image -> character references ---------------------------------------------------------------------
  // Generation sends only the first `sent` references (the backend's MAX_SENT_REFERENCES, read from /capabilities),
  // so a pose image goes right after the main reference (index 1), never to the end where it would be dropped
  // (review 2026-11-03 #1). Full (max 8): `replace` = the index the user chose to give up; null = not added.
  function poseReferences(refs, url, { max = 8, replace = null } = {}) {
    const list = (Array.isArray(refs) ? refs : []).filter((u) => u !== url);
    if (list.length >= max) {
      if (!Number.isInteger(replace) || replace < 0 || replace >= list.length) return null;
      list.splice(replace, 1);
    }
    list.splice(Math.min(1, list.length), 0, url);
    return list;
  }

  // ---- capability table (handoff §4.6) -------------------------------------------------------------------------
  // Status = what tests/p4-rig-unit.cjs and tests/p4-rig-ui.cjs prove; nothing listed beyond that.
  const CAPABILITIES = [
    {
      group: "A 圖層／肢體綁定",
      item: "分層部件組成角色（素材庫圖片，原圖不改）",
      done: true,
      test: "p4-rig-ui：建立示範角色（7 個部件）",
    },
    {
      group: "A 圖層／肢體綁定",
      item: "樞紐、父子階層、轉上臂帶動前臂與手掌（FK）",
      done: true,
      test: "p4-rig-unit：FK 鏈位置",
    },
    {
      group: "A 圖層／肢體綁定",
      item: "骨架與原素材分開保存、版本化（保留最近 20 版）",
      done: true,
      test: "p4-rig-ui：綁定改版後角色圖層出現「更新」",
    },
    {
      group: "B 網格與 Puppet",
      item: "建立網格（依透明範圍裁掉空格，粗／中／細）",
      done: true,
      test: "p4-rig-ui：網格保存重開仍在",
    },
    {
      group: "B 網格與 Puppet",
      item: "控制釘新增／移動／刪除、可做關鍵影格、可跟隨骨骼（頭髮／衣物）",
      done: true,
      test: "p4-rig-unit：MLS 不動＝原樣、釘點準確；p4-rig-ui：移動控制釘後頭髮像素移動",
    },
    {
      group: "B 網格與 Puppet",
      item: "控制釘本身的旋轉／縮放",
      done: false,
      test: "未實作：控制釘只有位移",
    },
    {
      group: "C 骨骼鏈與進階控制",
      item: "骨骼鏈、骨長、關節限制",
      done: true,
      test: "p4-rig-unit：關節限制夾住",
    },
    {
      group: "C 骨骼鏈與進階控制",
      item: "IK：兩節解析解（手肘向內／向外）",
      done: true,
      test: "p4-rig-unit：0.5 px 內到達、彎向切換；p4-rig-ui：拖 IK 目標，畫面手肘位置＝解算值",
    },
    {
      group: "C 骨骼鏈與進階控制",
      item: "IK：三節以上 FABRIK、碰不到時伸直指向目標",
      done: true,
      test: "p4-rig-unit：FABRIK 4 節、碰不到目標",
    },
    {
      group: "C 骨骼鏈與進階控制",
      item: "權重：自動權重、筆刷（加／減／平滑）、熱度圖、改前改後比較",
      done: true,
      test: "p4-rig-unit：權重總和＝1、單骨 LBS＝剛體；p4-rig-ui：改權重後畫面不同",
    },
    {
      group: "C 骨骼鏈與進階控制",
      item: "控制器關鍵影格、曲線、姿勢存在角色下、套用姿勢、匯出姿勢圖當生成參考",
      done: true,
      test: "p4-rig-ui：改控制器關鍵影格與緩動後預覽＝輸出；姿勢圖進角色參考圖",
    },
    {
      group: "不在本卡",
      item: "單張圖自動拆部件、自動補遮住的肢體、自動建骨、動作捕捉",
      done: false,
      test: "未實作（§4.6 不要求）",
    },
    {
      group: "不在本卡",
      item: "3D 骨架（計畫卡 P5）",
      done: false,
      test: "未實作",
    },
  ];

  const api = {
    RAD,
    DENSITY,
    DENSITY_LABEL,
    CAPABILITIES,
    ID,
    multiply,
    apply,
    invert,
    wrap,
    tailOf,
    ordered,
    fk,
    solve,
    solveTwo,
    fabrik,
    limit,
    buildMesh,
    mlsRigid,
    autoWeights,
    lbs,
    setWeight,
    paintWeights,
    neighbours,
    restVerts,
    deformMesh,
    drawMesh,
    draw,
    boneProp,
    ikProp,
    pinProp,
    ikRest,
    controls,
    valuesFrom,
    atVersion,
    segDist,
    unitMesh,
    restPins,
    poseReferences,
  };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Rig = api;
})(typeof globalThis === "object" ? globalThis : this);
