// Card P3 unit checks on shared/compositor.js (Node, no browser): keyframe interpolation (hold, bezier vs linear),
// parent transform with pivot, the expression language (valid cases, error column, step limit, forbidden names,
// link cycles) and the word-timing fallback modes of dynamic text.
const assert = require("node:assert/strict");
const C = require("../shared/compositor.js");

let passed = 0;
const pass = (label) => {
  passed++;
  console.log("PASS " + label);
};
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

// --- keyframes ---
{
  const linear = { value: 0, keys: [{ frame: 0, value: 0, ease: "linear" }, { frame: 10, value: 100, ease: "linear" }] };
  near(C.valueAt(linear, -5), 0);
  near(C.valueAt(linear, 5), 50);
  near(C.valueAt(linear, 10), 100);
  near(C.valueAt(linear, 99), 100);
  const hold = { value: 0, keys: [{ frame: 0, value: 0, ease: "hold" }, { frame: 10, value: 100, ease: "linear" }] };
  near(C.valueAt(hold, 9), 0);
  near(C.valueAt(hold, 10), 100);
  const eio = { value: 0, keys: [{ frame: 0, value: 0, ease: "ease-in-out" }, { frame: 10, value: 100, ease: "linear" }] };
  assert.ok(C.valueAt(eio, 2) < 20, "ease-in-out is slower than linear at the start");
  near(C.valueAt(eio, 5), 50, 1e-3);
  assert.ok(C.valueAt(eio, 8) > 80, "and faster in the middle, so ahead of linear near the end");
  const bez = { value: 0, keys: [{ frame: 0, value: 0, ease: "bezier", bezier: [0.2, 0.8, 0.2, 1] }, { frame: 10, value: 100, ease: "linear" }] };
  assert.ok(C.valueAt(bez, 3) > C.valueAt(linear, 3) + 20, "custom bezier (fast start) is ahead of linear");
  near(C.cubicBezier(0.42, 0, 0.58, 1)(0.5), 0.5, 1e-4);
  near(C.cubicBezier(0, 0, 1, 1)(0.3), 0.3, 1e-4);
  const colour = { value: "#000000", keys: [{ frame: 0, value: "#000000", ease: "linear" }, { frame: 2, value: "#ffffff", ease: "linear" }] };
  assert.equal(C.valueAt(colour, 1), "#808080");
  const moved = { value: 0, keys: [{ frame: 0, value: 1 }, { frame: 5, value: 2 }, { frame: 9, value: 3 }] };
  C.moveKey(moved, 0, 9);
  assert.deepEqual(moved.keys.map((k) => [k.frame, k.value]), [[5, 2], [9, 1]], "moving onto an occupied frame replaces that key");
  pass("關鍵影格：線性、停格、緩入緩出、自訂 Bezier（快於線性）、顏色插值、移動到已有影格會取代");
}

// --- transforms ---
{
  const comp = C.normalize({ layers: [] });
  const parent = C.newLayer("null", { id: "P" }),
    child = C.newLayer("shape", { id: "K", parent: "P" });
  Object.assign(child.props, { x: { value: 100 }, y: { value: 100 }, anchorX: { value: 50 }, anchorY: { value: 0 }, rotation: { value: 90 } });
  comp.layers = [child, parent];
  const env = C.makeEnv(comp);
  // Rotating 90° about the anchor (50, 0): the anchor stays at (100, 100); local (100, 0) swings down to (100, 150).
  const m = C.worldMatrix(child, 0, env);
  C.apply(m, 50, 0).forEach((v, i) => near(v, [100, 100][i]));
  C.apply(m, 100, 0).forEach((v, i) => near(v, [100, 150][i]));
  C.apply(m, 50, 20).forEach((v, i) => near(v, [80, 100][i]));
  // The parent controller moves and rotates; the child follows (child world = parent × child).
  Object.assign(parent.props, { x: { value: 500 }, y: { value: 300 }, rotation: { value: 90 } });
  const env2 = C.makeEnv(comp), m2 = C.worldMatrix(child, 0, env2);
  C.apply(m2, 50, 0).forEach((v, i) => near(v, [400, 400][i])); // parent rotates (100,100) about its origin -> (-100,100)
  assert.equal(C.parentCycle(comp, "P", "K"), true, "P under K while K is under P = cycle");
  assert.equal(C.parentCycle(comp, "K", "P"), false);
  const looped = C.normalize({ layers: [{ ...C.newLayer("null", { id: "A", parent: "B" }) }, { ...C.newLayer("null", { id: "B", parent: "A" }) }] });
  assert.ok(looped.layers.some((l) => l.parent === null), "stored data with a parent loop loads with the loop cut");
  pass("2D 變形：繞錨點旋轉 90° 落在預期像素；父控制器帶動子物件；父層循環被拒");
}

// --- expressions ---
{
  const comp = C.normalize({ layers: [] });
  const title = C.newLayer("text", { id: "T", name: "標題" }),
    deco = C.newLayer("shape", { id: "D", name: "裝飾" });
  title.props.opacity = { value: 0.5 };
  comp.layers = [deco, title];
  const run = (expr, prop = "x", frame = 30, base = 10) => {
    deco.props[prop] = { value: base, expr };
    const env = C.makeEnv(comp);
    return { value: C.propValue(deco, prop, frame, env), error: env.errors.get("D:" + prop) };
  };
  near(run("value + 5").value, 15);
  near(run("time * 2").value, 2);
  near(run("frame").value, 30);
  near(run("fps").value, 30);
  near(run("index").value, 0);
  near(run("(1 + 2) * 3 % 4").value, 1);
  near(run("frame > 10 ? 7 : 8").value, 7);
  near(run("clamp(500, 0, 100)").value, 100);
  near(run("linear(time, 0, 2, 0, 100)").value, 50);
  near(run("min(3, 1, 2) + max(1, 9) + abs(-1) + round(1.6) + floor(1.6) + ceil(1.2)").value, 1 + 9 + 1 + 2 + 1 + 2);
  near(run('layer("標題").opacity * 2').value, 1);
  // wiggle is deterministic: same frame -> same value, and it moves within ±amp around value.
  const w1 = run("wiggle(2, 15)", "rotation").value, w2 = run("wiggle(2, 15)", "rotation").value;
  near(w1, w2);
  assert.ok(Math.abs(w1 - 10) <= 15);
  assert.notEqual(run("wiggle(2, 15)", "rotation", 7).value, w1);
  // loop(period) replays the property's own keyframes.
  deco.props.y = { value: 0, keys: [{ frame: 0, value: 0, ease: "linear" }, { frame: 30, value: 30, ease: "linear" }], expr: "loop(1)" };
  near(C.propValue(deco, "y", 45, C.makeEnv(comp)), 15);
  pass("表達式：運算、比較、條件、函式、linear、loop、wiggle（固定擬隨機）、layer(\"名稱\").屬性 連結");

  const bad = (src) => C.compile(src).error;
  assert.deepEqual(bad("1 + * 2"), { message: "這裡不能出現「*」", column: 5 });
  assert.equal(bad("sin(1, 2)").column, 1);
  assert.equal(bad("foo + 1").message, "不支援的名稱「foo」");
  assert.equal(bad("1 + (2").column, 7);
  for (const name of ["process", "require", "constructor", "__proto__", "globalThis"]) {
    const e = bad(name + " + 1");
    assert.ok(e && e.column === 1 && e.message.includes(name), name + " must be rejected at column 1");
  }
  assert.equal(bad('layer("標題").constructor').column, 13);
  assert.equal(bad('layer("標題").__proto__').column, 13);
  assert.ok(bad("x".repeat(501)).message.includes("500"));
  assert.ok(bad("(".repeat(40) + "1" + ")".repeat(40)).message.includes("巢狀"));
  // A runtime error falls back to the keyframed value and is reported with its column.
  const err = run("1 / 0");
  near(err.value, 10);
  assert.ok(err.error.message.includes("有限"));
  pass("表達式錯誤：顯示第幾個字；禁用名稱（process、require、constructor、__proto__、globalThis）一律拒絕；超長、過深被擋；執行錯誤退回關鍵影格值");

  // Step limit: the language has no loops and each property is evaluated once per frame, so only a long chain of
  // links can pile up work: five layers each adding ~480 steps on top of the next one's value exceed 2000.
  const ones = Array.from({ length: 235 }, () => "1").join("+");
  const chain = Array.from({ length: 5 }, (_, i) => {
    const l = C.newLayer("null", { id: "S" + i, name: "鏈" + i });
    l.props.x = { value: 7, expr: (i < 4 ? 'layer("鏈' + (i + 1) + '").x+' : "") + ones };
    return l;
  });
  assert.ok(chain.every((l) => l.props.x.expr.length <= 500));
  const steps = C.makeEnv(C.normalize({ layers: [] }));
  steps.comp.layers = chain;
  near(C.propValue(chain[0], "x", 0, steps), 7);
  assert.ok(steps.errors.get("S0:x").message.includes("2000"), JSON.stringify([...steps.errors]));
  pass("表達式步數上限：超過 2000 步停止，退回關鍵影格值");

  const chainA = C.newLayer("null", { id: "A", name: "甲" }), chainB = C.newLayer("null", { id: "B", name: "乙" });
  // Link cycle: 甲.x -> 乙.x -> 甲.x is detected; both fall back, the frame still renders.
  chainA.props.x = { value: 3, expr: 'layer("乙").x + 1' };
  chainB.props.x = { value: 4, expr: 'layer("甲").x + 1' };
  const env = C.makeEnv(C.normalize({ layers: [] }));
  env.comp.layers = [chainA, chainB];
  near(C.propValue(chainA, "x", 0, env), 3);
  assert.ok(env.errors.get("A:x").message.includes("循環"));
  assert.ok(env.errors.get("B:x").message.includes("循環"));
  pass("連結循環：偵測並報錯，兩邊都退回關鍵影格值");
}

// --- word timing ---
{
  const layer = C.newLayer("text", { text: "歡迎光臨", animator: { type: "highlight", by: "word", start: 0, end: 40 } });
  let t = C.textUnits(layer);
  assert.equal(t.mode, "sentence");
  assert.deepEqual(t.units, [{ text: "歡迎光臨", start: 0, end: 40 }], "no word times = 整句 over the animator range");
  layer.words = C.estimateWords(layer.text, 0, 40, "word");
  t = C.textUnits(layer);
  assert.equal(t.mode, "estimate");
  assert.deepEqual(t.units.map((u) => [u.text, u.start, u.end]), [["歡", 0, 10], ["迎", 10, 20], ["光", 20, 30], ["臨", 30, 40]]);
  assert.ok(layer.words.every((w) => w.estimated));
  const latin = C.estimateWords("hi there world", 0, 24, "word");
  assert.deepEqual(latin.map((w) => [w.text, w.startFrame, w.endFrame]), [["hi ", 0, 4], ["there ", 4, 14], ["world", 14, 24]], "by character count");
  layer.words = [{ text: "歡迎", startFrame: 5, endFrame: 15 }, { text: "光臨", startFrame: 15, endFrame: 25 }];
  t = C.textUnits(layer);
  assert.equal(t.mode, "words", "transcript times are used as given");
  layer.animator.by = "char";
  t = C.textUnits(layer);
  assert.deepEqual(t.units.map((u) => [u.text, u.start, u.end]), [["歡", 5, 10], ["迎", 10, 15], ["光", 15, 20], ["臨", 20, 25]], "by char subdivides each word");
  assert.equal(C.unitState("highlight", t.units[1], 12).highlight, true);
  assert.equal(C.unitState("highlight", t.units[1], 15).highlight, false);
  assert.equal(C.unitState("typewriter", t.units[2], 14).visible, false);
  assert.equal(C.unitState("pop", t.units[0], 4).visible, false);
  pass("字詞時間：無時間＝整句；依字數平均分配（標示估計）；逐字稿時間照用；逐字細分；高亮／逐字出現／放大進場狀態");
}

console.log(passed + " passed");
