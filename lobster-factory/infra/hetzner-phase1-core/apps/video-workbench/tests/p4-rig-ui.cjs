// Card P4 acceptance in the browser (isolated server, Edge headless): 建立示範角色 -> wave animation exists -> save
// -> reload -> change a controller keyframe and an ease curve -> preview frame N == output frame N (PSNR >= 40 dB on
// RGB and alpha) and the hand moved; drag an IK target -> the elbow from the solver = the law-of-cosines value and the
// arm is drawn there; move a puppet pin -> hair pixels move, mesh saved/reloaded; a weight edit changes the render
// (auto vs edited differ); output MOV -> editor overlay track with alpha; pose saved -> 匯出姿勢圖 -> PNG asset with
// origin in the character's references; rig version bump -> rig layer shows 更新; no <select>.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  { spawnSync } = require("node:child_process"),
  ffmpeg = require("ffmpeg-static"),
  { chromium } = require("playwright");
const { isolatedServer } = require("./isolated-server.cjs");

let passed = 0;
const pass = (label) => {
  passed++;
  console.log("PASS " + label);
};
const W = 1280, H = 720;
function decode(file, frame) {
  const r = spawnSync(ffmpeg, ["-v", "error", "-i", file, "-vf", `select=eq(n\\,${frame})`, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "-"], { maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  assert.equal(r.status, 0, String(r.stderr));
  assert.equal(r.stdout.length, W * H * 4);
  return r.stdout;
}
function psnr(a, b) {
  let rgb = 0, alpha = 0;
  for (let i = 0; i < a.length; i += 4) {
    for (let c = 0; c < 3; c++) rgb += (a[i + c] - b[i + c]) ** 2;
    alpha += (a[i + 3] - b[i + 3]) ** 2;
  }
  const db = (sum, n) => (sum === 0 ? Infinity : 10 * Math.log10((255 * 255) / (sum / n)));
  return { rgb: db(rgb, (a.length / 4) * 3), alpha: db(alpha, a.length / 4) };
}
const yellow = (d, i) => d[i + 3] > 200 && d[i] > 200 && d[i + 1] > 160 && d[i + 2] < 80;
const purple = (d, i) => d[i + 3] > 200 && d[i] > 90 && d[i] < 160 && d[i + 1] > 40 && d[i + 1] < 110 && d[i + 2] > 160;
const armColour = (d, i) => d[i + 3] > 200 && ((d[i] > 170 && d[i + 1] < 90 && d[i + 2] < 70) || (d[i] < 80 && d[i + 1] > 140 && d[i + 2] > 60 && d[i + 2] < 130));
function centroid(buf, pred) {
  let n = 0, x = 0, y = 0;
  for (let i = 0; i < buf.length; i += 4)
    if (pred(buf, i)) {
      const p = i / 4;
      n++;
      x += p % W;
      y += Math.floor(p / W);
    }
  return n ? { n, x: x / n, y: y / n } : { n: 0, x: NaN, y: NaN };
}
function around(buf, [cx, cy], r, pred) {
  for (let y = Math.round(cy) - r; y <= Math.round(cy) + r; y++)
    for (let x = Math.round(cx) - r; x <= Math.round(cx) + r; x++) if (x >= 0 && y >= 0 && x < W && y < H && pred(buf, (y * W + x) * 4)) return true;
  return false;
}
async function setFrame(page, frame) {
  const input = page.locator('input[type="number"][aria-label="目前影格"]');
  await input.fill(String(frame));
  await input.press("Enter");
  await page.waitForFunction((f) => document.querySelector("[data-cp-canvas]")?.dataset.cpFrame === String(f) && !cp.dirty, frame);
}
async function preview(page, frame) {
  await setFrame(page, frame);
  const b64 = await page.evaluate(() => {
    const c = document.querySelector("[data-cp-canvas]"),
      d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let s = "";
    for (let i = 0; i < d.length; i += 32768) s += String.fromCharCode(...d.subarray(i, i + 32768));
    return btoa(s);
  });
  return Buffer.from(b64, "base64");
}
async function tab(page, name) {
  await page.locator('[role="group"][aria-label="屬性分頁"]').getByRole("button", { name, exact: true }).click();
}
async function rigLayer(page) {
  await page.locator('[data-cp-action^="layer:"]', { hasText: "示範角色" }).first().click();
  await tab(page, "屬性");
}
async function fillField(page, label, value) {
  const field = page.getByLabel(label, { exact: true });
  await field.fill(String(value));
  await field.press("Tab");
}
async function save(page, revision) {
  await page.getByRole("button", { name: /^儲存/ }).first().click();
  await page.waitForFunction((r) => !cp.dirty && cp.doc.revision === r, revision);
}
async function waitStatus(page, sel, re) {
  await page.waitForFunction(([s, src]) => new RegExp(src).test(document.querySelector(s)?.textContent || ""), [sel, re.source], { timeout: 240000 });
  assert.match(await page.locator(sel).textContent(), re);
}
const noSelect = async (page, flow) => assert.equal(await page.locator(`[data-tool-flow="${flow}"] select`).count(), 0, flow);

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--disable-features=WebGPU"] });
  try {
    const { base, dataDir } = await isolatedServer("vw-p4-ui-");
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/*", (r) => (r.request().url().startsWith(base + "/") ? r.continue() : r.abort()));
    page.on("dialog", (d) => d.accept());

    // An editor project for the round trip.
    await page.goto(base + "/pages/tools.html#edit");
    await page.getByRole("button", { name: "新建剪輯專案", exact: true }).click();
    await page.getByLabel("專案名稱").fill("P4 角色");
    await page.getByRole("radio", { name: /^16:9 / }).check();
    await page.getByRole("button", { name: "建立專案", exact: true }).click();
    await page.waitForFunction(() => ed.projects.some((p) => p.title === "P4 角色"));

    // 1. Demo starter.
    await page.goto(base + "/pages/tools.html?r=1#rig");
    await page.getByRole("button", { name: "建立示範角色", exact: true }).click();
    await waitStatus(page, "[data-rg-status]", /已建立示範角色/);
    const demo = await page.evaluate(async () => {
      const c = rg.chars.find((x) => x.name === "示範角色（揮手）"),
        comp = (await VideoWorkbench.compositions.list()).find((x) => x.title === "示範角色揮手");
      return { c, comp };
    });
    const rig = demo.c.rigs[0], layer0 = demo.comp.layers[0];
    assert.equal(rig.version, 1);
    assert.deepEqual(rig.parts.map((p) => p.name), ["手掌", "前臂", "上臂", "頭髮", "頭", "身體", "披風"]);
    assert.deepEqual(rig.bones.map((b) => b.name), ["身體", "上臂", "前臂", "手掌"]);
    assert.equal(rig.chains.length, 1);
    assert.equal(rig.meshes.length, 2);
    assert.ok(rig.meshes.every((m) => m.triangles.length > 10), "meshes have triangles");
    assert.ok(rig.parts.every((p) => /^\/generated\//.test(p.url) && p.assetId), "parts are library images");
    assert.equal(layer0.kind, "rig");
    assert.equal(layer0.rigVersion, 1);
    const handKeys = layer0.props["b_" + rig.bones[3].id].keys;
    assert.deepEqual(handKeys.map((k) => k.frame), [25, 40, 55, 70, 85]);
    assert.equal(layer0.props["ik_" + rig.chains[0].id + "_y"].keys.length, 2);
    assert.ok(rig.parts.every((p) => p.url), "parts reference originals");
    pass("建立示範角色：7 個部件（素材庫圖片）、4 根骨骼、手臂 IK 鏈、頭髮與披風網格；揮手動畫是角色圖層上的關鍵影格（非固定動畫）");

    // 2. Open -> save -> reload -> reopen.
    await page.getByRole("button", { name: "開啟示範動畫", exact: true }).click();
    await page.waitForSelector("[data-cp-canvas]");
    await save(page, 2);
    await page.reload();
    await page.getByRole("button", { name: "示範角色揮手 · 第 2 版", exact: true }).click();
    await page.waitForSelector("[data-cp-canvas]");
    const reopened = await page.evaluate(() => structuredClone(cp.doc.layers[0]));
    assert.deepEqual(reopened.props, Object.fromEntries(Object.entries(layer0.props).map(([k, v]) => [k, v])));
    pass("保存→重新整理→重開：角色圖層所有控制器與關鍵影格都在");

    // 3. Change a controller keyframe and an ease; the hand moves.
    await rigLayer(page);
    const before40 = centroid(await preview(page, 40), yellow);
    assert.ok(before40.n > 300, "hand visible at frame 40");
    await page.locator(".cp-prop", { hasText: "手掌・旋轉（度）" }).getByRole("button", { name: "動畫與表達式" }).click();
    await fillField(page, "關鍵影格 2 值", 75);
    await page.locator(".cp-key-row").first().getByRole("button", { name: "選取" }).click();
    await page.locator('[role="group"][aria-label="緩動"]').getByRole("button", { name: "緩出", exact: true }).click();
    await save(page, 3);
    const doc3 = await page.evaluate(() => structuredClone(cp.doc.layers[0].props));
    const hk = doc3["b_" + rig.bones[3].id].keys;
    assert.equal(hk[1].value, 75);
    assert.equal(hk[0].ease, "ease-out");
    const after40 = centroid(await preview(page, 40), yellow);
    assert.ok(Math.hypot(after40.x - before40.x, after40.y - before40.y) > 4, `hand moved: ${JSON.stringify(before40)} -> ${JSON.stringify(after40)}`);
    pass("改控制器關鍵影格（手掌 35°→75°）與緩動（緩入緩出→緩出），儲存後第 40 格手掌位置改變");

    // 4. Output: decoded frames = preview frames.
    await page.getByRole("button", { name: "輸出透明影片" }).click();
    await waitStatus(page, "[data-cp-status]", /已輸出|缺少|失敗|錯誤/);
    assert.match(await page.locator("[data-cp-status]").textContent(), /已輸出/);
    const asset = await page.evaluate(async () => (await VideoWorkbench.assets.list()).filter((a) => a.origin?.engine === "workbench-compositor").at(-1));
    assert.equal(asset.verification.ok, true);
    assert.equal(asset.origin.compositionRevision, 3);
    assert.ok(rig.parts.every((p) => asset.origin.sourceAssetIds.includes(p.assetId)), "output lists the part images as sources");
    const file = path.join(dataDir, asset.url.slice(1));
    for (const f of [0, 32, 40, 89]) {
      const s = psnr(decode(file, f), await preview(page, f));
      assert.ok(s.rgb >= 40 && s.alpha >= 40, `frame ${f}: PSNR rgb ${s.rgb} alpha ${s.alpha}`);
    }
    const f0 = decode(file, 0);
    assert.equal(f0[3], 0, "corner transparent");
    assert.equal(f0[(H * W - 1) * 4 + 3], 0);
    pass("輸出：透明 MOV 驗證通過，第 0、32、40、89 格解碼後與預覽 PSNR（RGB、透明度）≥ 40 dB，背景 alpha 0");

    // 5. Drag the IK target (programmatic, same function as the overlay handle) -> elbow = law of cosines.
    await setFrame(page, 10);
    await rigLayer(page);
    const target = [600, 230];
    await page.evaluate(([x, y]) => {
      rgDragIk(rgRigForLayer(cpLayer()).rig.chains[0].id, x, y);
      render();
    }, target);
    await save(page, 4);
    const ik = await page.evaluate(() => {
      const l = cpLayer(),
        { rig, m, solved, comp } = rgPosedAt(l, 10),
        fore = rig.bones[2];
      return { m, elbow: comp([solved.posed.get(fore.id).x, solved.posed.get(fore.id).y]), hand: comp(solved.posed.get(fore.id).tail) };
    });
    const sh = [460, 380], L1 = 140, L2 = 120, d = Math.hypot(target[0] - sh[0], target[1] - sh[1]),
      phi = Math.atan2(target[1] - sh[1], target[0] - sh[0]), alpha = Math.acos((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d));
    const toComp = ([x, y]) => [ik.m[0] * x + ik.m[2] * y + ik.m[4], ik.m[1] * x + ik.m[3] * y + ik.m[5]];
    const expect = toComp([sh[0] + L1 * Math.cos(phi + alpha), sh[1] + L1 * Math.sin(phi + alpha)]),
      mirror = toComp([sh[0] + L1 * Math.cos(phi - alpha), sh[1] + L1 * Math.sin(phi - alpha)]);
    assert.ok(Math.hypot(ik.elbow[0] - expect[0], ik.elbow[1] - expect[1]) <= 0.5, `elbow ${ik.elbow} vs ${expect}`);
    assert.ok(Math.hypot(ik.hand[0] - toComp(target)[0], ik.hand[1] - toComp(target)[1]) <= 0.5, "wrist on the target");
    const f10 = await preview(page, 10);
    assert.ok(around(f10, expect, 3, armColour), "the arm is drawn at the solved elbow");
    assert.ok(!around(f10, mirror, 6, armColour), "nothing at the other bend's elbow");
    pass("拖 IK 目標：手肘位置＝餘弦定理（0.5 px 內），手腕在目標上；畫面上手臂畫在解出的手肘，另一側彎向的位置沒有手臂");

    // 6. Puppet pin: move the hair's free pin -> hair pixels move.
    await setFrame(page, 45);
    const hairBefore = centroid(await preview(page, 45), purple);
    await rigLayer(page);
    await fillField(page, "頭髮・控制釘 3 位移 X", 90);
    await save(page, 5);
    const hairAfter = centroid(await preview(page, 45), purple);
    assert.ok(hairBefore.n > 500 && hairAfter.x - hairBefore.x > 3, `hair moved right: ${JSON.stringify(hairBefore)} -> ${JSON.stringify(hairAfter)}`);
    pass("Puppet：頭髮第 3 個控制釘位移 X 改成 90，頭髮像素向右移動（網格變形）");

    // 7. Output -> editor overlay track, alpha kept.
    await page.getByRole("button", { name: "放到剪輯時間軸" }).click();
    await page.locator("dialog [data-cp-project]").first().click();
    await waitStatus(page, "[data-cp-status]", /已放到「P4 角色」的 V2 軌/);
    const placed = await page.evaluate(async () => {
      await cpEditorReady();
      return structuredClone(ed.projects.find((p) => p.title === "P4 角色").clips.find((c) => c.track === "V2"));
    });
    assert.equal(placed.asset.origin.engine, "workbench-compositor");
    assert.equal(placed.asset.origin.compositionRevision, 5);
    assert.equal(placed.durationFrames, 90);
    const movFile = path.join(dataDir, placed.asset.url.slice(1)), mid = decode(movFile, 45);
    assert.equal(mid[3], 0, "MOV keeps alpha (transparent corner)");
    assert.ok(centroid(mid, purple).n > 500, "character drawn");
    pass("放到剪輯時間軸：角色動畫成 V2 疊加軌片段（90 格），MOV 保留透明");

    // 8. Pose under the character -> 匯出姿勢圖 -> PNG asset in the character's references; 套用姿勢 keys the playhead.
    await setFrame(page, 40);
    await rigLayer(page);
    await page.getByLabel("姿勢名稱", { exact: true }).fill("揮手高點");
    await page.getByRole("button", { name: "把目前影格存成姿勢", exact: true }).click();
    await page.waitForFunction(() => rg.chars.find((c) => c.name === "示範角色（揮手）")?.poses?.length === 1);
    await page.locator("[data-rg-pose]", { hasText: "揮手高點" }).getByRole("button", { name: "匯出姿勢圖" }).click();
    await waitStatus(page, "[data-cp-status]", /已匯出姿勢圖|錯誤|缺少/);
    const exported = await page.evaluate(async () => {
      const c = (await VideoWorkbench.characters.list()).find((x) => x.name === "示範角色（揮手）"),
        a = (await VideoWorkbench.assets.list()).filter((x) => x.origin?.engine === "workbench-rig").at(-1);
      return { c, a };
    });
    const pose = exported.c.poses[0];
    assert.equal(pose.rigVersion, 1);
    assert.equal(pose.values["b_" + rig.bones[3].id], 75);
    assert.deepEqual(exported.a.origin, { kind: "render", engine: "workbench-rig", characterId: exported.c.id, rigId: rig.id, rigVersion: 1, poseId: pose.id });
    assert.ok(exported.c.references.includes(exported.a.url), "pose image is a character reference");
    const png = fs.readFileSync(path.join(dataDir, exported.a.url.slice(1)));
    assert.equal(png.readUInt32BE(16), 800);
    assert.equal(png.readUInt32BE(20), 900);
    assert.equal(png[25], 6, "RGBA PNG");
    await setFrame(page, 70);
    await rigLayer(page);
    await page.locator("[data-rg-pose]", { hasText: "揮手高點" }).getByRole("button", { name: "套用姿勢" }).click();
    const applied = await page.evaluate(() => cp.doc.layers[0].props["b_" + rgRigForLayer(cp.doc.layers[0]).rig.bones[3].id].keys.find((k) => k.frame === 70).value);
    assert.equal(applied, 75);
    await save(page, 6);
    pass("姿勢：第 40 格存成「揮手高點」（存在角色下）→ 匯出姿勢圖＝800×900 RGBA PNG，origin 記角色／綁定／版本／姿勢，已加入角色參考圖；套用姿勢在播放頭加關鍵影格");

    // 9. Weights: brush on the skinned cape -> auto vs edited differ; save = version 2; meshes survive reload.
    await page.goto(base + "/pages/tools.html?r=2#rig");
    await page.getByRole("button", { name: "示範角色（揮手）（綁定 1 個）", exact: true }).click();
    await page.getByRole("button", { name: "揮手綁定・第 1 版", exact: true }).click();
    await page.locator('[data-rg-action^="part:"]', { hasText: "披風" }).click();
    await page.locator('[role="group"][aria-label="筆刷骨骼"]').getByRole("button", { name: "上臂", exact: true }).click();
    await fillField(page, "筆刷強度（0–1）", 1);
    await fillField(page, "筆刷半徑（px）", 120);
    const diff = async () =>
      page.evaluate(() => {
        const [a, b] = [...document.querySelectorAll("[data-rg-compare]")].map((c) => c.getContext("2d").getImageData(0, 0, c.width, c.height).data);
        let n = 0;
        for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 3] - b[i + 3]) > 30) n++;
        return n;
      });
    await page.waitForFunction(() => document.querySelector('[data-rg-compare="edited"]'));
    await page.evaluate(() => rgPaint());
    assert.equal(await diff(), 0, "before editing, auto = edited");
    const touched = await page.evaluate(() => {
      const n = rgPaintAt(330, 640) + rgPaintAt(420, 620);
      render();
      return n;
    });
    assert.ok(touched > 5);
    await page.waitForFunction(() => document.querySelector("[data-rg-canvas]")?.dataset.rgVersion === "1*");
    await page.evaluate(() => rgPaint());
    const changed = await diff();
    assert.ok(changed > 200, "edited weights change the render: " + changed + " px");
    await page.getByRole("button", { name: "顯示熱度圖", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: "隱藏熱度圖", exact: true }).count(), 1);
    await page.getByRole("button", { name: /^儲存綁定/ }).click();
    await page.waitForFunction(() => rg.rig.version === 2 && !rg.dirty);
    const meshBefore = await page.evaluate(() => structuredClone(rg.rig.meshes));
    await page.reload();
    await page.getByRole("button", { name: "示範角色（揮手）（綁定 1 個）", exact: true }).click();
    await page.getByRole("button", { name: "揮手綁定・第 2 版", exact: true }).click();
    const meshAfter = await page.evaluate(() => structuredClone(rg.rig.meshes));
    assert.deepEqual(meshAfter, meshBefore);
    assert.ok(meshAfter[1].weightsEdited && meshAfter[0].pins.length === 3);
    pass(`權重：披風刷「上臂」後自動與編輯後權重畫面不同（${changed} px）；熱度圖可切換；儲存成綁定第 2 版，重新整理後網格、控制釘、權重都在`);

    await noSelect(page, "rig");
    const caps = await page.locator("[data-rg-caps] tbody tr").allTextContents();
    assert.ok(caps.some((t) => /已完成/.test(t)) && caps.some((t) => /未完成/.test(t)), "capability table lists done and not-done items");

    // 10. Rig version bump -> the composition's rig layer offers 更新.
    await page.goto(base + "/pages/tools.html?r=3#compose");
    await page.getByRole("button", { name: "示範角色揮手 · 第 6 版", exact: true }).click();
    await page.waitForSelector("[data-cp-canvas]");
    await rigLayer(page);
    await page.getByRole("button", { name: "綁定有新版本：更新", exact: true }).click();
    assert.equal(await page.evaluate(() => cp.doc.layers[0].rigVersion), 2);
    assert.equal(await page.getByRole("button", { name: "綁定有新版本：更新", exact: true }).count(), 0);
    pass("綁定改版：角色圖層釘在第 1 版時顯示「綁定有新版本：更新」，按下改用第 2 版");

    await page.getByRole("button", { name: "顯示骨架", exact: true }).click();
    assert.equal(await page.locator("[data-cp-overlay].on").count(), 1, "skeleton overlay on its own canvas");
    for (const t of ["屬性", "動畫", "表達式"]) {
      await tab(page, t);
      await noSelect(page, "compose");
    }
    pass("工作區沒有 <select>（角色綁定、動畫合成）；能力表列出已完成與未完成；骨架顯示在獨立圖層");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
  console.log(passed + " passed");
})().catch((error) => {
  console.error("FAIL", error);
  process.exit(1);
});
