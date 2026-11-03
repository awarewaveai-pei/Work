// Card P2 (handoff §4.2 多軌／精細裁切, editor page in Edge): tracks are added and deleted with visible buttons up to
// the limits (8 video, 8 audio, 4 text, 16 in all), an empty track goes at once, a non-empty one only after a confirm and the
// deletion undoes; a saved five-track (object) project migrates to the track array, keeps its track settings and
// still exports; the transition, colour, loudness and export-quality controls hold no <select>; the master peak
// meter is on the page; 「設為入點」 puts the clip in at the exact playhead frame, unchanged after a reload.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  { spawnSync } = require("node:child_process"),
  ffmpeg = require("ffmpeg-static"),
  { chromium } = require("playwright");
const { isolatedServer } = require("./isolated-server.cjs");

let passed = 0;
const pass = (label) => {
  passed++;
  console.log("PASS " + label);
};

(async () => {
  const { base, dataDir, server } = await isolatedServer("vw-p2-tracks-");
  const generated = path.join(dataDir, "generated");
  fs.mkdirSync(generated, { recursive: true });
  const name = crypto.randomUUID() + ".mp4";
  const made = spawnSync(ffmpeg, ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=320x180:r=30:d=4", "-f", "lavfi", "-i", "sine=f=440:sample_rate=48000:d=4",
    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", path.join(generated, name)], { windowsHide: true, encoding: "utf8" });
  assert.equal(made.status, 0, made.stderr);
  const asset = { id: "fixture-video", name: "測試影片", url: "/generated/" + name, type: "video/mp4" };
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/*", (r) => (r.request().url().startsWith(base + "/") ? r.continue() : r.abort()));
    await page.goto(base + "/pages/tools.html#edit");
    await page.getByRole("button", { name: "新增專案", exact: true }).click();
    await page.getByLabel("專案標題").fill("軌道測試");
    await page.getByRole("button", { name: "建立專案", exact: true }).click();
    await page.waitForSelector("[data-ed-stage]");
    const lanes = () => page.locator("[data-ed-lane]").evaluateAll((els) => els.map((e) => e.dataset.edLane));
    assert.deepEqual(await lanes(), ["V1", "V2", "T", "A1", "A2"]);

    // Limits: 8 video, 8 audio, 4 text, 16 in all (= MediaTimelineV1); every add button is disabled at 16.
    for (const [label, adds] of [["新增影片軌", 6], ["新增音訊軌", 5]])
      for (let i = 0; i < adds; i++) await page.getByRole("button", { name: label, exact: true }).click();
    for (const label of ["新增影片軌", "新增音訊軌", "新增文字軌"])
      assert.equal(await page.getByRole("button", { name: label, exact: true }).isDisabled(), true, label);
    const full = await lanes();
    assert.equal(full.length, 16);
    assert.deepEqual(full.filter((id) => id[0] === "V"), ["V1", "V2", "V3", "V4", "V5", "V6", "V7", "V8"]);
    assert.deepEqual(full.filter((id) => id[0] === "A"), ["A1", "A2", "A3", "A4", "A5", "A6", "A7"]);
    assert.deepEqual(full.filter((id) => id[0] === "T"), ["T"]);
    assert.equal(await page.locator('[data-ed-track="V1"]').getByRole("button", { name: "刪除軌道" }).count(), 0);
    pass("新增軌道到上限：影片 8、合計 16，達上限三個新增鈕都停用；主影片軌 V1 沒有刪除鈕");

    // Empty track: deleted at once.
    await page.locator('[data-ed-track="V8"]').getByRole("button", { name: "刪除軌道", exact: true }).click();
    assert.equal(await page.locator('[data-ed-lane="V8"]').count(), 0);
    assert.equal(await page.locator("dialog").count(), 0);
    assert.equal(await page.getByRole("button", { name: "新增影片軌", exact: true }).isDisabled(), false);
    // Non-empty track: confirm dialog, then one undo brings track and clip back.
    await page.evaluate((a) => edAdd(a, "A1"), { id: "fixture-audio", name: "測試音訊", url: "/generated/" + name, type: "audio/mp4" });
    await page.waitForSelector('[data-ed-lane="A1"] [data-ed-clip]');
    await page.locator('[data-ed-track="A1"]').getByRole("button", { name: "刪除軌道", exact: true }).click();
    await page.waitForSelector("dialog[open]");
    assert.match(await page.locator("dialog[open]").innerText(), /有 1 個片段/);
    await page.getByRole("button", { name: "確定刪除", exact: true }).click();
    assert.equal(await page.locator('[data-ed-lane="A1"]').count(), 0);
    assert.equal(await page.locator("[data-ed-clip]").count(), 0);
    await page.getByRole("button", { name: "復原", exact: true }).click();
    assert.equal(await page.locator('[data-ed-lane="A1"] [data-ed-clip]').count(), 1);
    pass("刪除空軌立即生效；有片段的軌道先確認，刪除後可一次復原軌道與片段");

    // Panes and the export dialog: buttons and inputs only. Peak meter beside the player.
    await page.evaluate((a) => edAdd(a), asset);
    await page.waitForSelector('[data-ed-lane="V1"] [data-ed-clip]');
    for (const pane of ["轉場", "調色", "音訊"]) {
      await page.locator(`[data-ed-pane="${pane}"]`).click();
      assert.equal(await page.locator(".editor-library select").count(), 0, pane);
    }
    await page.locator('[data-ed-pane="轉場"]').click();
    assert.equal(await page.getByRole("group", { name: "轉場", exact: true }).getByRole("button").count(), 8);
    await page.locator('[data-ed-pane="調色"]').click();
    for (const label of ["曝光（EV）", "對比", "色溫（K）", "飽和度"]) assert.equal(await page.getByLabel(label, { exact: true }).count(), 1, label);
    await page.locator('[data-ed-pane="音訊"]').click();
    assert.equal(await page.getByRole("group", { name: "響度目標", exact: true }).getByRole("button").count(), 3);
    await page.getByRole("button", { name: "匯出影片", exact: true }).click();
    await page.waitForSelector("dialog[open] [data-ed-export]");
    assert.equal(await page.locator("dialog[open] select").count(), 0);
    assert.equal(await page.locator('dialog[open] [data-ed-action^="quality:"]').count(), 3);
    await page.locator('dialog[open] [data-ed-action="quality:4K"]').click();
    assert.match(await page.locator("dialog[open]").innerText(), /來源低於 4K，會放大/);
    await page.waitForFunction(() => /適合投遞：.*youtube/.test(document.querySelector("dialog[open] [data-ed-delivery]")?.textContent || ""));
    await page.locator("dialog[open] [data-ed-close]").click();
    assert.equal(await page.locator("[data-ed-peak]").count(), 1);
    assert.match(await page.locator("[data-ed-peak]").innerText(), /超過 −1 dB 會在輸出時自動壓低/);
    pass("轉場（8 鈕）、調色、響度（3 鈕）分頁與匯出對話框（3 個畫質鈕、4K 放大提示、適合投遞）沒有下拉選單；播放器旁有峰值表");

    // 設為入點 at an exact frame (16 then 下一格 = 17), kept after a reload.
    await page.locator('[data-ed-lane="V1"] [data-ed-clip]').click();
    await page.evaluate(() => {
      ed.time = Timebase.toSeconds(16, edProject().timebase);
      edPaint();
    });
    await page.getByRole("button", { name: "下一格", exact: true }).click();
    await page.getByRole("button", { name: "設為入點", exact: true }).click();
    const set = await page.evaluate(async () => {
      await edSave();
      const c = edProject().clips.find((x) => x.track === "V1");
      return { startFrame: c.startFrame, durationFrames: c.durationFrames, sourceStartFrame: c.sourceStartFrame };
    });
    assert.deepEqual(set, { startFrame: 17, durationFrames: 120 - 17, sourceStartFrame: 17 });
    await page.reload();
    await page.waitForFunction(() => typeof ed !== "undefined" && ed.ready);
    await page.getByRole("button", { name: "軌道測試 · 16:9", exact: true }).click();
    const reopened = await page.evaluate(() => edProject().clips.find((x) => x.track === "V1"));
    assert.deepEqual({ startFrame: reopened.startFrame, durationFrames: reopened.durationFrames, sourceStartFrame: reopened.sourceStartFrame }, set);
    pass("「下一格」到第 17 格後「設為入點」：起點 17 格、長度 103 格、素材起點 17 格，重新整理後不變");

    // A saved project with the pre-P2 five-track object migrates to the array (kept first) and still exports.
    await page.evaluate(async (url) => {
      const legacy = ProjectEnvelope.wrap(
        { id: "legacy-tracks", title: "舊五軌", ratio: "16:9", timebase: { num: 30, den: 1 }, assets: [], markers: [],
          tracks: { V1: { volume: 1 }, V2: { hidden: true }, T: {}, A1: { muted: true, volume: 0.5 }, A2: { normalize: true } },
          clips: [
            { id: "legacy-v1", kind: "video", track: "V1", asset: { url, name: "舊片段" }, startFrame: 0, durationFrames: 60, sourceStartFrame: 0, speed: 1 },
            { id: "legacy-v2", kind: "video", track: "V1", asset: { url, name: "舊片段" }, startFrame: 60, durationFrames: 60, sourceStartFrame: 60, speed: 1, transition: "融接", transitionDuration: 0.4 },
          ] },
        { revision: 0 },
      );
      await VideoWorkbench.preferences.set("tools.editor.projects", [legacy]);
      await VideoWorkbench.flush();
    }, asset.url);
    await page.reload();
    await page.waitForFunction(() => typeof ed !== "undefined" && ed.ready);
    const migrated = await page.evaluate(async () => {
      const p = ed.projects.find((x) => x.id === "legacy-tracks"),
        keys = Object.keys((await VideoWorkbench.backup.export()).preferences || {});
      return { tracks: p.tracks.map((t) => [t.id, t.kind, t.hidden, t.muted, t.volume, t.normalize]), clip: p.clips[1], kept: keys.some((k) => k.startsWith("tools.editor.projects.pre-tracks-")) };
    });
    assert.deepEqual(migrated.tracks, [
      ["V1", "video", false, false, 1, false],
      ["V2", "video", true, false, 1, false],
      ["T", "text", false, false, 1, false],
      ["A1", "audio", false, true, 0.5, false],
      ["A2", "audio", false, false, 1, true],
    ]);
    assert.equal(migrated.clip.transition, "溶解");
    assert.equal(migrated.clip.transitionFrames, 12);
    assert.equal(migrated.kept, true);
    await page.getByRole("button", { name: "舊五軌 · 16:9", exact: true }).click();
    await page.getByRole("button", { name: "匯出影片", exact: true }).click();
    await page.locator('dialog[open] [data-ed-action="quality:720p"]').click();
    await page.locator("dialog[open] [data-ed-export]").click();
    let result = null;
    for (let i = 0; i < 480 && !result; i++) {
      result = await page.evaluate(async () => {
        const j = (await VideoWorkbench.generations.list()).filter((x) => x.input?.operation === "editor-export").at(-1);
        return j && ["succeeded", "failed"].includes(j.status) ? { status: j.status, error: j.error, tracks: j.input.settings.project.tracks } : null;
      });
      if (!result) await page.waitForTimeout(250);
    }
    assert.ok(result, "export job never finished");
    assert.equal(result.status, "succeeded", JSON.stringify(result.error));
    assert.ok(Array.isArray(result.tracks) && result.tracks.length === 5);
    pass("舊五軌物件專案：原資料另存 pre-tracks 鍵，轉成軌道陣列且保留隱藏／靜音／音量／均衡設定，舊轉場轉成「溶解」12 格，仍可匯出 720p");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.closeAllConnections();
    server.close();
  }
  console.log(passed + " passed");
})().catch((error) => {
  console.error("FAIL", error);
  process.exitCode = 1;
});
