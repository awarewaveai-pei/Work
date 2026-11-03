// Card P3 (handoff §4.5): the 2D compositor. One pure renderer for preview and output -- renderFrame(ctx, comp,
// frame, resources) draws frame N the same way whether the canvas is on screen or feeding the PNG sequence the
// server turns into a MOV, so preview frame N == output frame N. No eval/Function anywhere: expressions run on
// the small tokenizer/parser/evaluator below. Browser global `Compositor`; require() in Node (math only).
(function (root) {
  "use strict";
  const BLENDS = { normal: "source-over", multiply: "multiply", screen: "screen", overlay: "overlay", darken: "darken", lighten: "lighten", add: "lighter" };
  const BLEND_LABEL = { normal: "一般", multiply: "色彩增值", screen: "濾色", overlay: "覆蓋", darken: "變暗", lighten: "變亮", add: "相加" };
  // "rig" (card P4): a character rig from shared/rig.js; its bone/IK/pin controls are ordinary keyframed props.
  const KINDS = ["video", "image", "text", "shape", "null", "rig"];
  const EASES = ["linear", "hold", "ease-in", "ease-out", "ease-in-out", "bezier"];
  const EASE_LABEL = { linear: "線性", hold: "停格", "ease-in": "緩入", "ease-out": "緩出", "ease-in-out": "緩入緩出", bezier: "自訂曲線" };
  const PRESET = { linear: [0, 0, 1, 1], "ease-in": [0.42, 0, 1, 1], "ease-out": [0, 0, 0.58, 1], "ease-in-out": [0.42, 0, 0.58, 1] };
  const MATTES = ["alpha", "alpha-inverted", "luma", "luma-inverted"];
  const MATTE_LABEL = { alpha: "Alpha", "alpha-inverted": "Alpha 反轉", luma: "亮度", "luma-inverted": "亮度反轉" };
  const ANIMATORS = { none: "無", typewriter: "逐字出現", highlight: "逐字高亮", pop: "放大進場" };
  // What the effects list offers = what applyEffect implements (handoff §4.5: list only what works).
  const EFFECTS = {
    blur: { label: "模糊", props: { radius: 8 } },
    glow: { label: "發光", props: { radius: 20, strength: 0.8, color: "#ffffff" } },
    color: { label: "亮度／對比／飽和", props: { brightness: 1, contrast: 1, saturation: 1 } },
    shadow: { label: "陰影", props: { distance: 12, angle: 135, blur: 10, color: "#000000", opacity: 0.6 } },
  };
  // Every transform/layer property and its default; the inspector lists exactly these.
  const LAYER_PROPS = { x: 0, y: 0, scale: 1, rotation: 0, anchorX: 0, anchorY: 0, opacity: 1 };
  const KIND_PROPS = {
    text: { fontSize: 72, color: "#ffffff", highlightColor: "#ffd166" },
    shape: { width: 400, height: 200, fill: "#4f7cff", strokeWidth: 0, strokeColor: "#ffffff" },
    image: { width: 640, height: 360 },
    video: { width: 640, height: 360 },
    null: {},
    rig: {},
  };
  const MASK_PROPS = { maskX: 0, maskY: 0, maskWidth: 400, maskHeight: 200, feather: 0, expansion: 0 };
  // Props an expression may read from another layer: layer("名稱").opacity (allow-list; nothing else is reachable).
  const LINKABLE = Object.keys({ ...LAYER_PROPS, fontSize: 0, width: 0, height: 0, strokeWidth: 0 });

  const isColor = (v) => typeof v === "string" && /^#[\da-f]{6}([\da-f]{2})?$/i.test(v);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // ---- easing -------------------------------------------------------------------------------------------
  // CSS-style cubic-bezier: x handles clamp to [0,1] (so x(t) is monotonic), y is free (overshoot allowed).
  function cubicBezier(x1, y1, x2, y2) {
    x1 = clamp(Number(x1) || 0, 0, 1);
    x2 = clamp(Number(x2) || 0, 0, 1);
    y1 = Number(y1) || 0;
    y2 = Number(y2) || 0;
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const sx = (t) => ((ax * t + bx) * t + cx) * t, sy = (t) => ((ay * t + by) * t + cy) * t;
    const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
    return (x) => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let t = x;
      for (let i = 0; i < 8; i++) {
        const e = sx(t) - x, d = dx(t);
        if (Math.abs(e) < 1e-7) return sy(t);
        if (Math.abs(d) < 1e-6) break;
        t -= e / d;
      }
      let lo = 0, hi = 1;
      t = x;
      for (let i = 0; i < 40; i++) {
        const v = sx(t);
        if (Math.abs(v - x) < 1e-7) break;
        v < x ? (lo = t) : (hi = t);
        t = (lo + hi) / 2;
      }
      return sy(t);
    };
  }
  const bezierOf = (key) => (key.ease === "bezier" && Array.isArray(key.bezier) && key.bezier.length === 4 ? key.bezier : PRESET[key.ease] || PRESET.linear);
  function hex(v) {
    const m = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})([\da-f]{2})?$/i.exec(v);
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16), m[4] ? parseInt(m[4], 16) : 255] : [0, 0, 0, 255];
  }
  const toHex = (c) => "#" + c.map((n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0")).join("").replace(/ff$/i, (s, i) => (i === 6 ? "" : s));
  function mix(a, b, t) {
    if (typeof a === "number" && typeof b === "number") return a + (b - a) * t;
    if (isColor(a) && isColor(b)) {
      const x = hex(a), y = hex(b);
      return toHex(x.map((v, i) => v + (y[i] - v) * t));
    }
    return t < 1 ? a : b;
  }
  // ---- keyframes ----------------------------------------------------------------------------------------
  // A property = { value, keys?: [{ frame, value, ease, bezier? }], expr? }. A key's ease shapes the segment that
  // starts at it. Before the first key = first value, after the last = last value.
  function valueAt(p, frame) {
    if (p === undefined || p === null || typeof p !== "object") return p;
    const keys = Array.isArray(p.keys) ? p.keys : [];
    if (!keys.length) return p.value;
    if (frame <= keys[0].frame) return keys[0].value;
    const last = keys[keys.length - 1];
    if (frame >= last.frame) return last.value;
    let i = 0;
    while (i < keys.length - 2 && frame >= keys[i + 1].frame) i++;
    const a = keys[i], b = keys[i + 1];
    if (a.ease === "hold") return a.value;
    const t = (frame - a.frame) / (b.frame - a.frame);
    return mix(a.value, b.value, cubicBezier(...bezierOf(a))(t));
  }
  const sortKeys = (p) => (p.keys || []).sort((a, b) => a.frame - b.frame);
  function setKey(p, frame, value, ease) {
    p.keys ||= [];
    const found = p.keys.find((k) => k.frame === frame);
    if (found) found.value = value;
    else p.keys.push({ frame, value, ease: ease || "linear" });
    sortKeys(p);
    return p;
  }
  // Moves the key at index i; a key already on the target frame is replaced (no two keys share a frame).
  function moveKey(p, i, frame) {
    const key = p.keys[i];
    if (!key) return p;
    p.keys = p.keys.filter((k, j) => j === i || k.frame !== frame);
    key.frame = Math.round(frame);
    sortKeys(p);
    return p;
  }

  // ---- expressions ----------------------------------------------------------------------------------------
  const EXPR = { maxLength: 500, maxSteps: 2000, maxDepth: 32 };
  const VARS = ["time", "frame", "value", "fps", "index", "PI"];
  const FUNCS = { sin: 1, cos: 1, abs: 1, min: -2, max: -2, clamp: 3, round: 1, floor: 1, ceil: 1, linear: 5, loop: 1, wiggle: -2, layer: 1 };
  const FORBIDDEN = ["process", "require", "constructor", "__proto__", "prototype", "globalThis", "window", "self", "document", "eval", "Function", "import", "this", "fetch"];
  class ExprError extends Error {
    constructor(message, column, extra = {}) {
      super(message);
      this.column = column;
      Object.assign(this, extra);
    }
  }
  function tokenize(src) {
    const out = [];
    let i = 0;
    while (i < src.length) {
      const ch = src[i], col = i + 1;
      if (/\s/.test(ch)) {
        i++;
        continue;
      }
      if (/\d/.test(ch) || (ch === "." && /\d/.test(src[i + 1] || ""))) {
        const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i));
        if (!m) throw new ExprError("無法辨識的數字", col);
        out.push({ t: "num", v: Number(m[0]), col });
        i += m[0].length;
        continue;
      }
      if (/[A-Za-z_$]/.test(ch)) {
        const m = /^[A-Za-z_$][\w$]*/.exec(src.slice(i));
        out.push({ t: "id", v: m[0], col });
        i += m[0].length;
        continue;
      }
      if (ch === '"' || ch === "'") {
        const end = src.indexOf(ch, i + 1);
        if (end < 0) throw new ExprError("字串缺少結尾引號", col);
        out.push({ t: "str", v: src.slice(i + 1, end), col });
        i = end + 1;
        continue;
      }
      const two = src.slice(i, i + 2);
      if (["<=", ">=", "==", "!=", "&&", "||"].includes(two)) {
        out.push({ t: "op", v: two, col });
        i += 2;
        continue;
      }
      if ("+-*/%()?:,.<>!".includes(ch)) {
        out.push({ t: "op", v: ch, col });
        i++;
        continue;
      }
      throw new ExprError("無法辨識的符號「" + ch + "」", col);
    }
    out.push({ t: "end", col: src.length + 1 });
    return out;
  }
  function parse(src) {
    const tokens = tokenize(src);
    let pos = 0, depth = 0;
    const peek = () => tokens[pos], next = () => tokens[pos++];
    const isOp = (v) => peek().t === "op" && peek().v === v;
    const expect = (v) => {
      if (!isOp(v)) throw new ExprError("這裡應該是「" + v + "」", peek().col);
      return next();
    };
    const enter = (col) => {
      if (++depth > EXPR.maxDepth) throw new ExprError("巢狀層數超過 " + EXPR.maxDepth + " 層", col);
    };
    function ternary() {
      enter(peek().col);
      const c = binary(0);
      let node = c;
      if (isOp("?")) {
        const col = next().col, a = ternary();
        expect(":");
        node = { t: "tern", c, a, b: ternary(), col };
      }
      depth--;
      return node;
    }
    const LEVELS = [["||"], ["&&"], ["==", "!=", "<", ">", "<=", ">="], ["+", "-"], ["*", "/", "%"]];
    function binary(level) {
      if (level === LEVELS.length) return unary();
      let node = binary(level + 1);
      while (peek().t === "op" && LEVELS[level].includes(peek().v)) {
        const op = next();
        node = { t: "bin", op: op.v, a: node, b: binary(level + 1), col: op.col };
      }
      return node;
    }
    function unary() {
      if (peek().t === "op" && ["-", "+", "!"].includes(peek().v)) {
        const op = next();
        enter(op.col);
        const node = { t: "un", op: op.v, a: unary(), col: op.col };
        depth--;
        return node;
      }
      return postfix();
    }
    function postfix() {
      let node = primary();
      while (isOp(".")) {
        next();
        const name = next();
        if (name.t !== "id") throw new ExprError("「.」後面應該是屬性名稱", name.col);
        if (FORBIDDEN.includes(name.v)) throw new ExprError("不允許使用「" + name.v + "」", name.col);
        if (node.t !== "call" || node.name !== "layer") throw new ExprError("只有 layer(\"名稱\") 可以接「.屬性」", name.col);
        if (!LINKABLE.includes(name.v)) throw new ExprError("不支援的連結屬性「" + name.v + "」", name.col);
        node = { t: "mem", obj: node, name: name.v, col: name.col };
      }
      return node;
    }
    function primary() {
      const tok = next();
      if (tok.t === "num") return { t: "num", v: tok.v, col: tok.col };
      if (tok.t === "str") throw new ExprError("字串只能用在 layer(\"名稱\")", tok.col);
      if (tok.t === "op" && tok.v === "(") {
        const node = ternary();
        expect(")");
        return node;
      }
      if (tok.t === "id") {
        if (FORBIDDEN.includes(tok.v)) throw new ExprError("不允許使用「" + tok.v + "」", tok.col);
        if (isOp("(")) {
          if (!Object.hasOwn(FUNCS, tok.v)) throw new ExprError("不支援的函式「" + tok.v + "」", tok.col);
          next();
          const args = [];
          if (!isOp(")"))
            do {
              if (tok.v === "layer" && peek().t === "str") {
                const s = next();
                args.push({ t: "str", v: s.v, col: s.col });
              } else args.push(ternary());
            } while (isOp(",") && next());
          expect(")");
          const arity = FUNCS[tok.v];
          const ok = tok.v === "wiggle" ? args.length === 2 || args.length === 3 : arity < 0 ? args.length >= -arity : args.length === arity;
          if (!ok) throw new ExprError(tok.v + "() 的參數數量不正確", tok.col);
          if (tok.v === "layer" && args[0].t !== "str") throw new ExprError("layer() 需要圖層名稱字串", args[0].col);
          return { t: "call", name: tok.v, args, col: tok.col };
        }
        if (!VARS.includes(tok.v)) throw new ExprError("不支援的名稱「" + tok.v + "」", tok.col);
        return { t: "var", name: tok.v, col: tok.col };
      }
      throw new ExprError(tok.t === "end" ? "運算式不完整" : "這裡不能出現「" + tok.v + "」", tok.col);
    }
    const tree = ternary();
    if (peek().t !== "end") throw new ExprError("多出的內容「" + peek().v + "」", peek().col);
    return tree;
  }
  const compiled = new Map();
  // { ast } or { error: { message, column } }. Syntax errors never reach the renderer.
  function compile(src) {
    src = String(src ?? "");
    if (compiled.has(src)) return compiled.get(src);
    let result;
    if (src.length > EXPR.maxLength) result = { error: { message: "運算式超過 " + EXPR.maxLength + " 字", column: EXPR.maxLength + 1 } };
    else
      try {
        result = { ast: parse(src) };
      } catch (e) {
        if (!(e instanceof ExprError)) throw e;
        result = { error: { message: e.message, column: e.column } };
      }
    if (compiled.size > 500) compiled.clear();
    compiled.set(src, result);
    return result;
  }
  // Deterministic value noise in [-1, 1]: same (x, seed) -> same value on every machine and every render.
  function hash(i, seed) {
    let h = (Math.imul(i | 0, 374761393) + Math.imul(seed | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return ((h >>> 0) / 4294967295) * 2 - 1;
  }
  function noise(x, seed) {
    const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
    return hash(i, seed) * (1 - u) + hash(i + 1, seed) * u;
  }
  // ctx: { time, frame, value, fps, index, sample(t) = keyframed value at time t, link(name, prop) }.
  function evaluate(ast, ctx, budget = { steps: 0 }) {
    const num = (v, col) => {
      if (typeof v !== "number") throw new ExprError("這裡需要數字", col);
      return v;
    };
    function ev(n) {
      if (++budget.steps > EXPR.maxSteps) throw new ExprError("運算超過 " + EXPR.maxSteps + " 步上限", n.col, { limit: true });
      switch (n.t) {
        case "num":
          return n.v;
        case "var":
          return n.name === "PI" ? Math.PI : ctx[n.name];
        case "un": {
          const v = num(ev(n.a), n.col);
          return n.op === "-" ? -v : n.op === "+" ? v : v ? 0 : 1;
        }
        case "tern":
          return num(ev(n.c), n.col) ? ev(n.a) : ev(n.b);
        case "bin": {
          if (n.op === "&&") return num(ev(n.a), n.col) ? num(ev(n.b), n.col) : 0;
          if (n.op === "||") {
            const a = num(ev(n.a), n.col);
            return a || num(ev(n.b), n.col);
          }
          const a = num(ev(n.a), n.col), b = num(ev(n.b), n.col);
          switch (n.op) {
            case "+": return a + b;
            case "-": return a - b;
            case "*": return a * b;
            case "/": return a / b;
            case "%": return a % b;
            case "<": return a < b ? 1 : 0;
            case ">": return a > b ? 1 : 0;
            case "<=": return a <= b ? 1 : 0;
            case ">=": return a >= b ? 1 : 0;
            case "==": return a === b ? 1 : 0;
            case "!=": return a !== b ? 1 : 0;
          }
          throw new ExprError("未知運算子", n.col);
        }
        case "mem":
          return num(ctx.link(n.obj.args[0].v, n.name, n.col, budget), n.col);
        case "call": {
          if (n.name === "layer") throw new ExprError("layer(\"名稱\") 後面需要「.屬性」", n.col);
          const a = n.args.map((x) => num(ev(x), x.col));
          switch (n.name) {
            case "sin": return Math.sin(a[0]);
            case "cos": return Math.cos(a[0]);
            case "abs": return Math.abs(a[0]);
            case "min": return Math.min(...a);
            case "max": return Math.max(...a);
            case "clamp": return Math.min(Math.max(a[0], Math.min(a[1], a[2])), Math.max(a[1], a[2]));
            case "round": return Math.round(a[0]);
            case "floor": return Math.floor(a[0]);
            case "ceil": return Math.ceil(a[0]);
            case "linear": {
              const [t, t1, t2, v1, v2] = a;
              if (t2 === t1) return t < t1 ? v1 : v2;
              return v1 + (v2 - v1) * clamp((t - t1) / (t2 - t1), 0, 1);
            }
            case "loop": {
              if (!(a[0] > 0)) throw new ExprError("loop() 的週期必須大於 0", n.col);
              return num(ctx.sample(ctx.time % a[0]), n.col);
            }
            case "wiggle":
              return ctx.value + a[1] * noise(ctx.time * a[0], (a[2] || 0) + ctx.index * 101);
          }
          throw new ExprError("未知函式", n.col);
        }
      }
      throw new ExprError("無法計算", n.col);
    }
    const v = ev(ast);
    if (typeof v !== "number" || !Number.isFinite(v)) throw new ExprError("結果不是有限數字", 1);
    return v;
  }

  // ---- property resolution --------------------------------------------------------------------------------
  // env = { comp, fps, errors: Map("layerId:prop" -> {message, column}), stack: Set, cache: Map }.
  function makeEnv(comp, extra = {}) {
    const tb = comp.timebase || { num: 30, den: 1 };
    return { comp, fps: tb.num / tb.den, errors: new Map(), stack: new Set(), cache: new Map(), ...extra };
  }
  const indexOf = (env, layer) => env.comp.layers.indexOf(layer);
  // p = property object; key = "layerId:path" (error/cycle bookkeeping); budget shared along one link chain.
  function resolve(p, layer, key, frame, env, budget) {
    if (p === undefined || p === null || typeof p !== "object") return p;
    const base = valueAt(p, frame);
    if (!p.expr || typeof base !== "number") return base;
    const cacheKey = key + "@" + frame;
    if (env.cache.has(cacheKey)) return env.cache.get(cacheKey);
    const c = compile(p.expr);
    if (c.error) {
      env.errors.set(key, c.error);
      return base;
    }
    const top = !budget;
    budget ||= { steps: 0 };
    env.stack.add(key);
    try {
      const value = evaluate(
        c.ast,
        {
          time: frame / env.fps,
          frame,
          value: base,
          fps: env.fps,
          index: indexOf(env, layer),
          sample: (t) => valueAt(p, Math.round(t * env.fps)),
          link: (name, prop, col, b) => {
            const target = env.comp.layers.find((l) => l.name === name);
            if (!target) throw new ExprError("找不到圖層「" + name + "」", col);
            const targetKey = target.id + ":" + prop;
            if (env.stack.has(targetKey)) throw new ExprError("連結形成循環：" + name + "." + prop, col, { cycle: true });
            return propValue(target, prop, frame, env, b);
          },
        },
        budget,
      );
      env.cache.set(cacheKey, value);
      return value;
    } catch (e) {
      if (!(e instanceof ExprError)) throw e;
      env.errors.set(key, { message: e.message, column: e.column });
      // A cycle or step overflow belongs to every expression on the chain; plain errors stop at this property.
      if (!top && (e.cycle || e.limit)) throw e;
      return base;
    } finally {
      env.stack.delete(key);
    }
  }
  function defaultOf(layer, name) {
    if (Object.hasOwn(LAYER_PROPS, name)) return LAYER_PROPS[name];
    return KIND_PROPS[layer.kind]?.[name];
  }
  function propValue(layer, name, frame, env, budget) {
    const p = layer.props?.[name];
    return p === undefined ? defaultOf(layer, name) : resolve(p, layer, layer.id + ":" + name, frame, env, budget);
  }
  const maskValue = (layer, name, frame, env) => {
    const p = layer.mask?.props?.[name];
    return p === undefined ? MASK_PROPS[name] : resolve(p, layer, layer.id + ":mask." + name, frame, env);
  };
  const effectValue = (layer, fx, name, frame, env) => {
    const p = fx.props?.[name];
    return p === undefined ? EFFECTS[fx.type]?.props[name] : resolve(p, layer, layer.id + ":fx." + fx.id + "." + name, frame, env);
  };

  // ---- transforms -----------------------------------------------------------------------------------------
  // Canvas matrix [a, b, c, d, e, f]: (x, y) -> (a x + c y + e, b x + d y + f). Local = T(x,y) R(rot) S(scale) T(-anchor).
  const multiply = (m, n) => [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
  const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  function localMatrix(layer, frame, env) {
    const v = (n) => Number(propValue(layer, n, frame, env)) || 0;
    const s = Number(propValue(layer, "scale", frame, env)),
      scale = Number.isFinite(s) ? s : 1,
      r = (v("rotation") * Math.PI) / 180,
      c = Math.cos(r) * scale,
      sn = Math.sin(r) * scale,
      ax = v("anchorX"),
      ay = v("anchorY");
    return [c, sn, -sn, c, v("x") - (c * ax - sn * ay), v("y") - (sn * ax + c * ay)];
  }
  // Parent chain: child world = parent world × child local. A chain that loops back is cut where it repeats
  // (setParent refuses to create one; this only guards hand-edited data).
  function worldMatrix(layer, frame, env, seen = new Set()) {
    const local = localMatrix(layer, frame, env);
    if (!layer.parent || seen.has(layer.id)) return local;
    seen.add(layer.id);
    const parent = env.comp.layers.find((l) => l.id === layer.parent);
    if (!parent || seen.has(parent.id)) return local;
    return multiply(worldMatrix(parent, frame, env, seen), local);
  }
  function parentCycle(comp, layerId, parentId) {
    if (!parentId) return false;
    const seen = new Set([layerId]);
    let id = parentId;
    while (id) {
      if (seen.has(id)) return true;
      seen.add(id);
      id = comp.layers.find((l) => l.id === id)?.parent || null;
    }
    return false;
  }

  // ---- text timing ----------------------------------------------------------------------------------------
  const cjk = (s) => /[\u3000-\u9fff\uff00-\uffef]/.test(s);
  // Splits text into words (Latin: on spaces, the space stays with the word before it) or characters.
  function splitUnits(text, by) {
    const chars = Array.from(String(text || ""));
    if (by === "char" || cjk(text)) return chars.length ? chars : [];
    const out = [];
    for (const m of String(text).matchAll(/\S+\s*|\s+/g)) out.push(m[0]);
    return out;
  }
  // 「依字數平均分配（估計）」: frames shared out by character count over [start, end). Marked estimated.
  function estimateWords(text, start, end, by = "word") {
    const units = splitUnits(text, by).filter((u) => u.length);
    const weights = units.map((u) => Math.max(1, Array.from(u.trim()).length)),
      total = weights.reduce((a, b) => a + b, 0) || 1,
      span = Math.max(units.length, end - start);
    let acc = 0;
    return units.map((u, i) => {
      const s = start + Math.round((acc / total) * span);
      acc += weights[i];
      return { text: u, startFrame: s, endFrame: start + Math.round((acc / total) * span), estimated: true };
    });
  }
  // The timed units a text animator plays. words[] (from a transcript or the estimate) win; none = 整句: the
  // whole text is one unit over the animator range. by "char" subdivides each unit evenly by character.
  function textUnits(layer) {
    const a = layer.animator || {},
      start = Number.isFinite(a.start) ? a.start : layer.inFrame || 0,
      end = Number.isFinite(a.end) ? a.end : start + 30;
    const words = Array.isArray(layer.words) && layer.words.length ? layer.words : null;
    const base = words
      ? { mode: words.some((w) => w.estimated) ? "estimate" : "words", units: words.map((w) => ({ text: String(w.text), start: w.startFrame, end: w.endFrame })) }
      : { mode: "sentence", units: [{ text: String(layer.text || ""), start, end }] };
    if (a.by !== "char") return base;
    return {
      mode: base.mode,
      units: base.units.flatMap((u) => {
        const chars = Array.from(u.text), n = chars.filter((c) => c.trim()).length || 1;
        let k = 0;
        return chars.map((c) => {
          const s = u.start + Math.floor(((u.end - u.start) * k) / n), e = u.start + Math.floor(((u.end - u.start) * (k + (c.trim() ? 1 : 0))) / n);
          if (c.trim()) k++;
          return { text: c, start: s, end: Math.max(e, s + (c.trim() ? 1 : 0)) };
        });
      }),
    };
  }
  // Per-unit look at a frame: visible, highlighted, scale.
  function unitState(type, unit, frame) {
    if (type === "typewriter") return { visible: frame >= unit.start, highlight: false, scale: 1 };
    if (type === "highlight") return { visible: true, highlight: frame >= unit.start && frame < unit.end, scale: 1 };
    if (type === "pop") {
      if (frame < unit.start) return { visible: false, highlight: false, scale: 0 };
      const t = clamp((frame - unit.start + 1) / 6, 0, 1);
      return { visible: true, highlight: false, scale: cubicBezier(...PRESET["ease-out"])(t) };
    }
    return { visible: true, highlight: false, scale: 1 };
  }

  // ---- fonts --------------------------------------------------------------------------------------------
  const fontFamilies = (comp) => [...new Set(comp.layers.filter((l) => l.kind === "text").map((l) => l.font || "sans-serif"))];
  const fontString = (layer, size) => `${layer.bold ? "bold " : ""}${Math.max(1, size)}px "${String(layer.font || "sans-serif").replace(/["\\]/g, "")}"`;

  // ---- composition model --------------------------------------------------------------------------------
  const P = (value) => ({ value });
  function newLayer(kind, extra = {}) {
    if (!KINDS.includes(kind)) throw Error("不支援的圖層類型");
    const props = {};
    for (const [k, v] of Object.entries({ ...LAYER_PROPS, ...KIND_PROPS[kind] })) props[k] = P(v);
    return {
      id: extra.id || "L" + Math.random().toString(36).slice(2, 10),
      name: { video: "影片", image: "圖片", text: "文字", shape: "形狀", null: "控制器", rig: "角色" }[kind],
      kind,
      visible: true,
      parent: null,
      blend: "normal",
      inFrame: 0,
      outFrame: 90,
      props,
      mask: null,
      matte: null,
      effects: [],
      ...(kind === "text" ? { text: "文字", font: "Microsoft JhengHei", bold: true, align: "center", animator: { type: "none", by: "word" }, words: [] } : {}),
      ...(kind === "shape" ? { shape: "rect", points: [] } : {}),
      ...extra,
    };
  }
  // Loads stored data into a renderable composition; unknown values fall back, never throw mid-render.
  function normalize(raw) {
    const c = raw && typeof raw === "object" ? structuredClone(raw) : {};
    c.id = String(c.id || "C" + Math.random().toString(36).slice(2, 10));
    c.title = String(c.title || "未命名合成").slice(0, 100);
    c.width = clamp(Math.round(Number(c.width) || 1920), 16, 3840);
    c.height = clamp(Math.round(Number(c.height) || 1080), 16, 3840);
    c.timebase = c.timebase && Number.isInteger(c.timebase.num) && Number.isInteger(c.timebase.den) && c.timebase.den > 0 ? { num: c.timebase.num, den: c.timebase.den } : { num: 30, den: 1 };
    c.durationFrames = clamp(Math.round(Number(c.durationFrames) || 90), 1, 36000);
    c.background = c.background === "transparent" || isColor(c.background) ? c.background : "transparent";
    c.revision = Number.isInteger(c.revision) ? c.revision : 0;
    c.history = Array.isArray(c.history) ? c.history.slice(0, 20) : [];
    c.layers = (Array.isArray(c.layers) ? c.layers : []).filter((l) => l && KINDS.includes(l.kind)).map((l) => {
      const base = newLayer(l.kind, { id: String(l.id) });
      const layer = { ...base, ...l, props: { ...base.props, ...(l.props || {}) } };
      layer.blend = Object.hasOwn(BLENDS, layer.blend) ? layer.blend : "normal";
      layer.effects = Array.isArray(layer.effects) ? layer.effects.filter((fx) => fx && Object.hasOwn(EFFECTS, fx.type)) : [];
      layer.matte = layer.matte && MATTES.includes(layer.matte.mode) ? { mode: layer.matte.mode } : null;
      for (const p of Object.values(layer.props)) if (p && Array.isArray(p.keys)) sortKeys(p);
      return layer;
    });
    for (const l of c.layers) if (l.parent && (!c.layers.some((o) => o.id === l.parent) || parentCycle(c, l.id, l.parent))) l.parent = null;
    return c;
  }

  const rigApi = () => root.Rig || (typeof require === "function" ? require("./rig.js") : null);
  // ---- rendering ----------------------------------------------------------------------------------------
  // resources = { createCanvas(w, h), media(layer) -> drawable | null, report: {} }. Returns the report:
  // { errors: Map, missingMedia: [names] }. Pure for the same inputs; nothing reads the clock or Math.random.
  function renderFrame(ctx, comp, frame, resources = {}) {
    const W = comp.width, H = comp.height,
      env = makeEnv(comp),
      pool = [],
      free = [],
      make = resources.createCanvas || ((w, h) => new OffscreenCanvas(w, h)),
      missing = [];
    const acquire = () => {
      const cv = free.pop() || (pool.push(make(W, H)), pool[pool.length - 1]);
      const c = cv.getContext("2d");
      reset(c);
      c.clearRect(0, 0, W, H);
      return cv;
    };
    const release = (cv) => free.push(cv);
    function reset(c) {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalAlpha = 1;
      c.globalCompositeOperation = "source-over";
      c.filter = "none";
      c.shadowColor = "rgba(0,0,0,0)";
      c.shadowBlur = 0;
      c.shadowOffsetX = 0;
      c.shadowOffsetY = 0;
    }
    function content(c, layer) {
      const v = (n) => propValue(layer, n, frame, env);
      if (layer.kind === "shape") {
        const w = Number(v("width")) || 0, h = Number(v("height")) || 0, path = shapePath(layer.shape, w, h, layer.points);
        c.fillStyle = v("fill");
        c.fill(path);
        const sw = Number(v("strokeWidth")) || 0;
        if (sw > 0) {
          c.lineWidth = sw;
          c.lineJoin = "round";
          c.strokeStyle = v("strokeColor");
          c.stroke(path);
        }
      } else if (layer.kind === "image" || layer.kind === "video") {
        const src = resources.media?.(layer, frame);
        if (!src) missing.push(layer.name);
        else c.drawImage(src, 0, 0, Number(v("width")) || 0, Number(v("height")) || 0);
      } else if (layer.kind === "text") drawText(c, layer, v);
      else if (layer.kind === "rig") {
        // resources.rig(layer) -> { rig (at the layer's pinned rigVersion), image(part) -> drawable | null } | null
        const r = resources.rig?.(layer), R = rigApi();
        if (!r || !R) missing.push(layer.name);
        else for (const n of R.draw(c, r.rig, R.valuesFrom(r.rig, v), r.image).missing) missing.push(layer.name + "・" + n);
      }
    }
    function drawText(c, layer, v) {
      const size = Number(v("fontSize")) || 1,
        base = v("color"),
        hi = v("highlightColor"),
        type = layer.animator?.type || "none",
        { units } = textUnits(layer),
        lineHeight = size * 1.25;
      c.font = fontString(layer, size);
      c.textBaseline = "top";
      c.textAlign = "left";
      // Lines first (so centre alignment knows each line's width), then each unit at its measured offset.
      const lines = [[]];
      for (const u of units) {
        const parts = u.text.split("\n");
        parts.forEach((part, i) => {
          if (i) lines.push([]);
          if (part) lines[lines.length - 1].push({ ...u, text: part });
        });
      }
      lines.forEach((line, li) => {
        const full = line.map((u) => u.text).join(""),
          width = c.measureText(full).width;
        let x = layer.align === "center" ? -width / 2 : 0;
        const y = li * lineHeight;
        for (const u of line) {
          const w = c.measureText(u.text).width, s = unitState(type, u, frame);
          if (s.visible && s.scale > 0) {
            c.fillStyle = s.highlight ? hi : base;
            if (s.scale !== 1) {
              c.save();
              c.translate(x + w / 2, y + size / 2);
              c.scale(s.scale, s.scale);
              c.fillText(u.text, -w / 2, -size / 2);
              c.restore();
            } else c.fillText(u.text, x, y);
          }
          x += w;
        }
      });
    }
    function applyMask(cv, layer, m) {
      const mk = layer.mask, val = (n) => Number(maskValue(layer, n, frame, env)) || 0;
      const shape = shapePath(mk.shape, val("maskWidth"), val("maskHeight"), mk.points, val("maskX"), val("maskY"));
      const mc = acquire(), c = mc.getContext("2d");
      c.setTransform(...m);
      c.fillStyle = "#ffffff";
      c.fill(shape);
      const exp = val("expansion"), scale = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
      if (exp) {
        c.lineJoin = "round";
        c.lineWidth = (2 * Math.abs(exp)) / scale;
        c.strokeStyle = "#ffffff";
        if (exp < 0) c.globalCompositeOperation = "destination-out";
        c.stroke(shape);
        c.globalCompositeOperation = "source-over";
      }
      let mask = mc;
      const feather = Math.max(0, val("feather"));
      if (feather > 0) {
        const fc = acquire(), f = fc.getContext("2d");
        f.filter = `blur(${feather / 2}px)`;
        f.drawImage(mc, 0, 0);
        release(mc);
        mask = fc;
      }
      if (mk.inverted) {
        const ic = acquire(), i = ic.getContext("2d");
        i.fillStyle = "#ffffff";
        i.fillRect(0, 0, W, H);
        i.globalCompositeOperation = "destination-out";
        i.drawImage(mask, 0, 0);
        release(mask);
        mask = ic;
      }
      const c2 = cv.getContext("2d");
      reset(c2);
      c2.globalCompositeOperation = "destination-in";
      c2.drawImage(mask, 0, 0);
      reset(c2);
      release(mask);
    }
    function applyEffect(cv, layer, fx) {
      const v = (n) => effectValue(layer, fx, n, frame, env), c = cv.getContext("2d");
      reset(c);
      if (fx.type === "blur" || fx.type === "color") {
        const tmp = acquire(), t = tmp.getContext("2d");
        t.filter =
          fx.type === "blur"
            ? `blur(${Math.max(0, Number(v("radius")) || 0)}px)`
            : `brightness(${Math.max(0, Number(v("brightness")))}) contrast(${Math.max(0, Number(v("contrast")))}) saturate(${Math.max(0, Number(v("saturation")))})`;
        t.drawImage(cv, 0, 0);
        c.clearRect(0, 0, W, H);
        c.drawImage(tmp, 0, 0);
        release(tmp);
      } else if (fx.type === "glow") {
        const tmp = acquire(), t = tmp.getContext("2d");
        t.filter = `blur(${Math.max(0, Number(v("radius")) || 0)}px)`;
        t.drawImage(cv, 0, 0);
        t.filter = "none";
        t.globalCompositeOperation = "source-in";
        t.fillStyle = v("color");
        t.fillRect(0, 0, W, H);
        c.globalCompositeOperation = "lighter";
        c.globalAlpha = clamp(Number(v("strength")) || 0, 0, 1);
        c.drawImage(tmp, 0, 0);
        release(tmp);
      } else if (fx.type === "shadow") {
        const tmp = acquire(), t = tmp.getContext("2d");
        t.drawImage(cv, 0, 0);
        const a = ((Number(v("angle")) || 0) * Math.PI) / 180, d = Number(v("distance")) || 0, col = hex(v("color"));
        c.clearRect(0, 0, W, H);
        c.shadowColor = `rgba(${col[0]},${col[1]},${col[2]},${clamp(Number(v("opacity")), 0, 1)})`;
        c.shadowBlur = Math.max(0, Number(v("blur")) || 0);
        c.shadowOffsetX = Math.cos(a) * d;
        c.shadowOffsetY = Math.sin(a) * d;
        c.drawImage(tmp, 0, 0);
        release(tmp);
      }
      reset(c);
    }
    // The layer drawn alone into a comp-sized buffer: transform, content, mask, effects (in order, bypass skips).
    function layerBuffer(layer) {
      const cv = acquire(), c = cv.getContext("2d"), m = worldMatrix(layer, frame, env);
      c.setTransform(...m);
      content(c, layer);
      reset(c);
      if (layer.mask?.enabled) applyMask(cv, layer, m);
      for (const fx of layer.effects || []) if (!fx.bypass) applyEffect(cv, layer, fx);
      return cv;
    }
    function applyMatte(cv, matteLayer, mode) {
      const inRange = frame >= (matteLayer.inFrame || 0) && frame < (matteLayer.outFrame ?? Infinity);
      const mb = inRange ? layerBuffer(matteLayer) : acquire();
      if (inRange) {
        const o = clamp(Number(propValue(matteLayer, "opacity", frame, env)), 0, 1);
        if (o < 1) {
          const t = acquire(), tc = t.getContext("2d");
          tc.globalAlpha = o;
          tc.drawImage(mb, 0, 0);
          release(mb);
          return finish(t);
        }
      }
      return finish(mb);
      function finish(buf) {
        if (mode.startsWith("luma")) {
          const bc = buf.getContext("2d"), img = bc.getImageData(0, 0, W, H), d = img.data;
          for (let i = 0; i < d.length; i += 4) {
            const lum = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
            d[i + 3] = Math.round(lum * d[i + 3]);
            d[i] = d[i + 1] = d[i + 2] = 255;
          }
          bc.putImageData(img, 0, 0);
        }
        const c = cv.getContext("2d");
        reset(c);
        c.globalCompositeOperation = mode.endsWith("inverted") ? "destination-out" : "destination-in";
        c.drawImage(buf, 0, 0);
        reset(c);
        release(buf);
      }
    }
    ctx.save();
    reset(ctx);
    ctx.clearRect(0, 0, W, H);
    if (comp.background !== "transparent") {
      ctx.fillStyle = comp.background;
      ctx.fillRect(0, 0, W, H);
    }
    const layers = comp.layers;
    // List order = stacking order: index 0 is the top layer, drawn last. A layer whose next-lower neighbour uses
    // it as track matte is not drawn itself.
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
      if (!layer.visible || layer.kind === "null") continue;
      if (layers[i + 1]?.matte && layers[i + 1].visible) continue;
      if (frame < (layer.inFrame || 0) || frame >= (layer.outFrame ?? Infinity)) continue;
      const buf = layerBuffer(layer);
      if (layer.matte && i > 0) applyMatte(buf, layers[i - 1], layer.matte.mode);
      ctx.globalAlpha = clamp(Number(propValue(layer, "opacity", frame, env)), 0, 1);
      ctx.globalCompositeOperation = BLENDS[layer.blend] || "source-over";
      ctx.drawImage(buf, 0, 0);
      reset(ctx);
      release(buf);
    }
    ctx.restore();
    return { errors: env.errors, missingMedia: [...new Set(missing)] };
  }
  // Path2D in local coordinates. rect/ellipse span (x, y)-(x+w, y+h); path = points [[x, y], ...], closed.
  function shapePath(kind, w, h, points, x = 0, y = 0) {
    const p = new Path2D();
    if (kind === "ellipse") p.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
    else if (kind === "path" && Array.isArray(points) && points.length > 2) {
      p.moveTo(x + points[0][0], y + points[0][1]);
      for (const [px, py] of points.slice(1)) p.lineTo(x + px, y + py);
      p.closePath();
    } else p.rect(x, y, w, h);
    return p;
  }
  // Every keyframe frame of a layer (all its properties, mask, effects): the transport's prev/next jumps.
  function keyFrames(layer) {
    const all = [layer.props, layer.mask?.props, ...(layer.effects || []).map((fx) => fx.props)]
      .filter(Boolean)
      .flatMap((g) => Object.values(g).flatMap((p) => (p?.keys || []).map((k) => k.frame)));
    return [...new Set(all)].sort((a, b) => a - b);
  }

  const api = {
    BLENDS, BLEND_LABEL, KINDS, EASES, EASE_LABEL, PRESET, MATTES, MATTE_LABEL, ANIMATORS, EFFECTS, LAYER_PROPS, KIND_PROPS, MASK_PROPS, LINKABLE, EXPR, FORBIDDEN, FUNCS, VARS,
    cubicBezier, valueAt, setKey, moveKey, sortKeys, mix, compile, evaluate, noise, makeEnv, resolve, propValue, maskValue, effectValue,
    localMatrix, worldMatrix, multiply, apply, parentCycle, splitUnits, estimateWords, textUnits, unitState, fontFamilies, fontString,
    newLayer, normalize, renderFrame, shapePath, keyFrames, isColor,
  };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Compositor = api;
})(typeof globalThis === "object" ? globalThis : this);
