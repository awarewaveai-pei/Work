// Card PJ.1 (docs/pj-project-spine-spec-20261106.md §2 PJ.1, §3.3): old edit files show up on the projects page,
// the stored edit files stay byte-for-byte, each opens from its episode with the same output settings, and
// 回到這一集 leads back. An existing project without the new fields opens as before.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  { spawnSync } = require("node:child_process"),
  ffmpeg = require("ffmpeg-static"),
  { chromium } = require("playwright");
const { isolatedServer } = require("./isolated-server.cjs");
const STORE = "awarewave-projects-screenshot-frontend-v1";

(async () => {
  const { base, dataDir, server } = await isolatedServer("vw-pj1-legacy-");
  const generated = path.join(dataDir, "generated");
  fs.mkdirSync(generated, { recursive: true });
  const name = crypto.randomUUID() + ".mp4";
  const made = spawnSync(ffmpeg, ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=320x180:r=30:d=4", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", path.join(generated, name)], { windowsHide: true, encoding: "utf8" });
  assert.equal(made.status, 0, made.stderr);
  const url = "/generated/" + name;
  // Same three kinds as tests/pj1-spine-unit.cjs: a pre-M3 bare object (seconds), a P2 envelope (frames), a FilmCraft row.
  const bare = { id: "bare-1", title: "舊裸專案", ratio: "9:16", clips: [{ id: "b1", kind: "video", track: "V1", start: 0, duration: 2, sourceStart: 0, asset: { url, name: "片" } }] },
    wrapped = {
      formatVersion: 1, engine: "workbench-editor", engineVersion: "1", nativeProjectRef: null, revision: 3, timebase: { num: 30, den: 1 }, output: { ratio: "16:9", quality: "1080p" }, assets: [{ id: null, url }],
      native: { id: "env-2", title: "P2 專案", ratio: "16:9", timebase: { num: 30, den: 1 }, assets: [], markers: [], tracks: [{ id: "V1", kind: "video" }, { id: "A1", kind: "audio" }],
        clips: [{ id: "e1", kind: "video", track: "V1", asset: { url, name: "片" }, startFrame: 0, durationFrames: 30, sourceStartFrame: 0, speed: 1 }, { id: "e2", kind: "video", track: "V1", asset: { url, name: "片" }, startFrame: 30, durationFrames: 30, sourceStartFrame: 30, speed: 1 }] },
    },
    film = { formatVersion: 1, engine: "filmcraft", engineVersion: "1", nativeProjectRef: null, native: { name: "x" }, assets: [], output: { ratio: "16:9", quality: "1080p" }, revision: 0, id: "film-3", name: "專業剪輯片.fcproj", title: "專業剪輯片" },
    existing = { id: "project_1", title: "既有專案", type: "single", ratio: "16:9", style: 1, customStyle: "", settings: {}, assets: { character: [], scene: [], prop: [] }, episodes: [{ id: "ep1_1", name: "既有專案", outline: "舊大綱", shots: [{ text: "舊鏡頭", seconds: 5 }] }] };
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.route("**/*", (r) => (r.request().url().startsWith(base + "/") ? r.continue() : r.abort()));
    await p.goto(base);
    await p.waitForFunction(() => window.VideoWorkbench?.router);
    await p.locator("#toolsNav").click(); // the frames get their page on first visit
    await p.waitForFunction(() => document.getElementById("toolsFrame").contentWindow?.edNative);
    // The values the editor computes from each seed before anything is adopted (pure functions of the tools page).
    const expected = await p.evaluate(
      async ({ STORE, existing, bare, wrapped, film }) => {
        await VideoWorkbench.ready;
        VideoWorkbench.storage.setItem(STORE, JSON.stringify({ projects: [existing], current: null, episode: 0 }));
        await VideoWorkbench.preferences.set("tools.editor.projects", [bare, wrapped]);
        await VideoWorkbench.preferences.set("tools.engine.projects", [film]);
        await VideoWorkbench.flush();
        const w = document.getElementById("toolsFrame").contentWindow;
        return Object.fromEntries([bare, wrapped].map((row) => [w.EpisodeSpine.editId(row), { native: w.edNative(w.edNormalizeProject(structuredClone(row))), quality: w.eval("ed.quality") }]));
      },
      { STORE, existing, bare, wrapped, film },
    );
    await p.reload();
    await p.waitForFunction(() => window.VideoWorkbench?.router);
    await p.evaluate(() => VideoWorkbench.ready.then(() => VideoWorkbench.flush()));
    const stored = await p.evaluate(async () => {
      const s = await (await fetch("/api/vw/state")).json();
      return { editor: s.preferences["tools.editor.projects"], engine: s.preferences["tools.engine.projects"], projects: s.projects };
    });
    assert.deepEqual(stored.editor, [bare, wrapped]);
    assert.deepEqual(stored.engine, [film]);
    assert.equal(stored.projects.length, 4);
    assert.deepEqual(stored.projects[0].episodes, existing.episodes);
    console.log("PASS 舊資料：搬進 3 個專案（共 4 個），伺服器上 tools.editor.projects／tools.engine.projects 與種子完全相同，既有專案的集沒被改");

    await p.locator("#projectsNav").click();
    const f = p.frameLocator("#projectsFrame");
    await f.locator(".project-card").nth(3).waitFor();
    assert.equal(await f.locator(".project-card").count(), 4);
    const tools = p.frameLocator("#toolsFrame");
    for (const [id, title, clips] of [["bare-1", "舊裸專案", 1], ["env-2", "P2 專案", 2]]) {
      await f.locator(`[data-action=openProject][data-id="project-ed-${id}"]`).click();
      await f.getByText("剪輯檔：" + title, { exact: true }).waitFor();
      await f.getByRole("button", { name: "開啟剪輯", exact: true }).click();
      await tools.locator("[data-ed-stage]").waitFor();
      const got = await p.evaluate(() => {
        const w = document.getElementById("toolsFrame").contentWindow;
        return w.eval("({ id: edProject().id, clips: edProject().clips.length, native: edNative(edProject()), quality: ed.quality })");
      });
      assert.equal(got.id, id);
      assert.equal(got.clips, clips);
      assert.deepEqual({ native: got.native, quality: got.quality }, expected[id]);
      await tools.getByRole("button", { name: "回到這一集", exact: true }).click();
      await f.locator(".work-top h1").waitFor();
      assert.match(await f.locator(".work-top h1").innerText(), new RegExp(title));
      await f.getByRole("button", { name: "←　專案列表", exact: true }).click();
      console.log(`PASS ${title}：專案頁「開啟剪輯」開到同一筆（片段 ${clips} 段），輸出設定與搬之前相同；「回到這一集」回到這一集`);
    }
    await f.locator('[data-action=openProject][data-id="project-ed-film-3"]').click();
    await f.getByText("剪輯檔：專業剪輯片", { exact: true }).waitFor();
    const film3 = await p.evaluate(() => {
      const w = document.getElementById("toolsFrame").contentWindow;
      return w.VideoWorkbench.tools.acceptAsset({ intent: "open-tool", tool: "edit-pro", link: { projectId: "project-ed-film-3", episodeId: "ep-ed-film-3" }, edit: { engine: "filmcraft", projectId: "film-3" } });
    });
    assert.deepEqual(film3, { ok: true, tool: "edit-pro" });
    console.log("PASS FilmCraft 那筆：剪輯檔列顯示標題，開到「專業剪輯」（acceptAsset 回 ok）");

    await p.locator("#projectsNav").click();
    await f.getByRole("button", { name: "←　專案列表", exact: true }).click().catch(() => {});
    await f.locator('[data-action=openProject][data-id="project_1"]').click();
    await f.getByText("還沒有剪輯檔。", { exact: true }).waitFor();
    assert.equal(await f.locator("[data-bind='episode.outline']").inputValue(), "舊大綱");
    assert.equal(await f.locator(".shot").count(), 1);
    assert.deepEqual(errors, []);
    console.log("PASS 既有專案打開照舊（大綱、鏡頭都在），顯示「建立剪輯檔」，沒有頁面錯誤");
  } finally {
    await browser.close();
    server.closeAllConnections();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
