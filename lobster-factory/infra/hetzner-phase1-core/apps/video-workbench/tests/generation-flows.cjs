const { chromium } = require("playwright"),
  assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
(async () => {
  const evidence = fs.mkdtempSync(path.join(os.tmpdir(), "vw-generation-flows-"));
  const server = require("../server.cjs").createServer({ dataDir: path.join(evidence, "data"), env: { OPENAI_API_KEY: "test-only", REPLICATE_API_TOKEN: "test-only" /* video = Replicate since Sora 2 shut down */ }, fetchImpl: async () => { throw Error("Provider forbidden"); } });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;
  const browser = await chromium.launch({ channel: "msedge" }),
    p = await browser.newPage();
  p.setDefaultTimeout(12000);
  const calls = [],
    errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.route("**/api/vw/**", async (r) => {
    const url = new URL(r.request().url()),
      route = url.pathname.replace("/api/vw", "");
    // /state is the workbench's own storage since card M2, not an AI call: let it reach the test server.
    if (route === "/uploads" || route === "/capabilities" || route === "/state") return r.continue();
    const body = r.request().postDataJSON();
    calls.push({ route, body });
    if (route === "/director/chat") return r.fulfill({ json: { reply: "測試導演回覆", choices: [], stage: body.phase, script: body.phase === "script" ? "測試腳本：海邊，人物向鏡頭揮手。" : "", duration: 4 } });
    if (route === "/director/script")
      return r.fulfill({
        json: { script: "測試腳本：海邊，人物向鏡頭揮手。" },
      });
    if (route === "/director/shots")
      return r.fulfill({
        json: { shots: [{ id: "shot-fixture", text: "海邊揮手", seconds: 4 }] },
      });
    if (route === "/generations/quote")
      return r.fulfill({
        json: { quoteId: "fixture", credits: null, billing: "測試供應商計費" },
      });
    if (route === "/generations")
      return r.fulfill({
        json: {
          id: "fixture-" + calls.length,
          type: body.type,
          status: "succeeded",
          progress: 100,
          input: body,
          result: { url: "/assets/test-image-1.png" },
        },
      });
    return r.fulfill({
      status: 503,
      json: { error: { message: "測試攔截，禁止其他 AI 呼叫" } },
    });
  });
  try {
    await p.goto(base);
    await p.locator("[data-mode=director]").click();
    await p.locator("#prompt").fill("海邊揮手");
    await p.locator("[data-action=director-start]").click();
    await p.locator('[data-director-conversation-action="script"]').waitFor();
    await p.locator('[data-director-conversation-action="script"]').click();
    await p.locator('[data-director-conversation-action="edit"]').waitFor();
    await p.locator("[data-action=director-to-video]").click();
    await p.locator("[data-action=director-generate-video]").click();
    await p.locator("[data-action=director-confirm-generate]").click();
    await p.locator(".job-view").waitFor();
    assert.match(
      calls.find((x) => x.route === "/generations/quote").body.prompt,
      /測試腳本/,
    );
    assert.equal(
      calls.find((x) => x.route === "/generations").body.duration,
      4,
    );
    await p.getByRole("button", { name: "關閉", exact: true }).last().click();
    console.log("PASS 導演腳本、有效秒數、報價與確認生成");
    await p.locator("#projectsNav").click();
    const projects = p.frameLocator("#projectsFrame");
    await projects.locator("[data-action=create]").first().click();
    await projects.locator("#create-name").fill("生成專案");
    await projects.locator("[data-action=saveProject]").click();
    await projects.locator("[data-action=storyboard]").first().click();
    await projects.locator("#story-outline").fill("人物在海邊揮手");
    await projects.locator("[data-action=noAi]").click();
    await projects.locator("[data-action=shotGenerate]").click();
    await projects.locator(".shot img").waitFor();
    assert.equal(
      calls.filter((x) => x.route === "/generations").at(-1).body.operation,
      "project-shot",
    );
    console.log("PASS 專案 AI 分鏡、逐鏡圖片生成與成果回寫");
    await p.locator("#charactersNav").click();
    const f = p.frameLocator("#charactersFrame");
    await f.locator("#gallery article").first().waitFor();
    await f.locator("[data-tab=mine]").click();
    await f.locator("#createBtn").click();
    await f.locator("[data-start=manual]").click();
    await f.locator("#charName").fill("語音角色");
    await f.locator("#charDescription").fill("成年講師，清晰語速");
    await f.locator("[data-sub=extend]").click();
    await f.locator("[data-extension=voice]").click();
    await f.locator('[data-voice-count="1"]').click();
    await f.locator("#voiceLine").fill("你好，今天開始上課");
    await f.locator("#generateVoice").click();
    await f.getByRole("button", { name: "設為角色聲音" }).click();
    await f.locator("#save").click();
    await p.waitForFunction(async () =>
      (await VideoWorkbench.characters.list()).some(
        (c) => c.name === "語音角色" && c.voice?.url,
      ),
    );
    console.log("PASS 角色語音台詞送出、成果套用與儲存");
    await p.locator("#toolsNav").click();
    const tools = p.frameLocator("#toolsFrame");
    await tools.locator('[data-act="open:subtitle"]').click();
    const output = await p.locator("#toolsFrame").evaluate((el) => {
      const S = el.contentWindow.VideoWorkbench;
      const vtt = S.convertSubtitles(
        "1\n00:00:00,000 --> 00:00:01,200\n你好",
        "vtt",
      );
      return { vtt, srt: S.convertSubtitles(vtt, "srt") };
    });
    assert.match(output.vtt, /00:00:01\.200/);
    assert.match(output.srt, /00:00:01,200/);
    console.log("PASS SRT 與 VTT 雙向格式轉換");
    await tools.getByText('貼上或檢查字幕原文',{exact:true}).click();await tools.locator('[data-key=subtitleText]').fill(output.srt);await tools.locator('[data-act=home]').first().click();await tools.locator('[data-act="open:subtitle"]').click();assert.equal(await tools.locator('[data-key=subtitleText]').inputValue(),output.srt);console.log('PASS 切換工具後保留各自設定');
    await tools.locator("[data-act=home]").first().click();
    await tools.locator('[data-act="open:region"]').click();
    await p
      .frames()
      .find((f) => f.url().includes("/pages/tools.html"))
      .evaluate(() => {
        files.image = {
          url: "/assets/test-image-1.png",
          type: "image/png",
        };
        render();
      });
    const image = tools.locator("#stage img");
    await image.waitFor();
    // The canvas is up to 74vh tall (tools-region.js): bring the whole picture into the 720 px viewport before dragging.
    await image.evaluate((el) => el.scrollIntoView({ block: "center" }));
    // Opening a tool scrolls to the top smoothly (tools-0.js scrollTo + html scroll-behavior:smooth, ~170 ms): measure
    // only once the picture has stopped moving, or the drag lands at a stale position.
    let box = await image.boundingBox();
    for (let still = 0; still < 3; ) {
      await p.waitForTimeout(50);
      const next = await image.boundingBox();
      still = next.x === box.x && next.y === box.y ? still + 1 : 0;
      box = next;
    }
    await p.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.8);
    await p.mouse.down();
    await p.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
    await p.mouse.up();
    const areas = await p
      .frames()
      .find((f) => f.url().includes("/pages/tools.html"))
      .evaluate(() => selection.regions);
    assert(areas?.length, "拖曳未產生選區");
    await tools.locator('[data-region-prompt="0"]').fill("花朵改為淺藍色");
    const firstArea = areas[0];
    const regionBox = await tools.locator('.region-selection').boundingBox();
    await p.mouse.move(regionBox.x + regionBox.width / 2, regionBox.y + regionBox.height / 2);
    await p.mouse.down(); await p.mouse.move(regionBox.x + regionBox.width / 2 + 10, regionBox.y + regionBox.height / 2 + 10); await p.mouse.up();
    const regionFrame = p.frames().find(f => f.url().includes('/pages/tools.html'));
    const moved = await regionFrame.evaluate(() => structuredClone(selection.regions[0]));
    assert(moved.x > firstArea.x && moved.y > firstArea.y);
    const handle = await tools.locator('[data-region-handle="se"]').boundingBox();
    await p.mouse.move(handle.x + 5, handle.y + 5); await p.mouse.down(); await p.mouse.move(handle.x + 15, handle.y + 15); await p.mouse.up();
    const resized = await regionFrame.evaluate(() => structuredClone(selection.regions[0]));
    assert(resized.w > moved.w && resized.h > moved.h);
    assert.equal(resized.prompt, "花朵改為淺藍色");
    await tools.locator("[data-act=submit]").click();
    await tools.locator(".job-view").waitFor();
    const region = calls.filter((x) => x.route === "/generations").at(-1).body;
    assert.match(region.mask, /^\/generated\/[\w-]+\.png$/);
    assert(region.selection.regions[0].w > 0);
    assert(region.selection.regions[0].h > 0);
    assert.match(region.prompt, /區域 1.*花朵改為淺藍色/);
    await tools.getByRole('button', { name: '關閉', exact: true }).last().click();
    await tools.getByRole('button', { name: '刪除區域 1', exact: true }).click();
    assert.equal(await tools.locator('.region-selection').count(), 0);
    console.log("PASS 區域獨立指令、移動、八方縮放、逐區刪除，指令與座標送入同筆生成");
    console.log("PASS 反向拖曳選區、PNG 遮罩與區域編輯送出");
    const quotaResult = await p.evaluate(async () => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function () {
        throw new DOMException("quota test", "QuotaExceededError");
      };
      try {
        const job = await VideoWorkbench.generations.create({
          type: "image",
          prompt: "儲存失敗仍保留已接收任務",
        });
        return { status: job.status, accepted: job.serverAccepted, id: job.id };
      } finally {
        Storage.prototype.setItem = original;
      }
    });
    assert.equal(quotaResult.status, "succeeded");
    assert.equal(quotaResult.accepted, true);
    assert(quotaResult.id.startsWith("fixture-"));
    console.log("PASS 瀏覽器儲存失敗不會把已接收生成誤判為 blocked");
    assert.deepEqual(errors, []);
  } catch (e) {
    console.error(
      await p
        .locator("#toolsFrame")
        .evaluate(
          (el) =>
            el.contentDocument.querySelector("#service-error")?.textContent,
        )
        .catch(() => ""),
      calls.at(-1),
    );
    console.error(e);
    throw e;
  } finally {
    await browser.close();
    server.closeAllConnections(); await new Promise(r => server.close(r));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

