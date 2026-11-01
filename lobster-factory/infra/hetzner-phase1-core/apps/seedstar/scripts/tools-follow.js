const followRuntime = {
  worker: null,
  pending: new Map(),
  next: 0,
  token: 0,
  busy: false,
  progress: "",
  boxes: [],
  boxTime: 0,
  plan: [],
  playerTime: 0,
};
function followFingerprint(draft = values, source = files.src) {
  return JSON.stringify([
    source?.url,
    Number(draft.followStart || 0),
    Number(draft.followEnd),
    draft.followAnchors || [],
  ]);
}
function followReady() {
  return (
    !!values.followTrack?.length &&
    values.followFingerprint === followFingerprint()
  );
}
function followPlan() {
  return FollowMath.smooth(
    values.followTrack || [],
    { 平穩: 1, 標準: 0.5, 靈敏: 0.15 }[values.followMotion || "標準"],
  );
}
function toolFollowScreen(t) {
  wfDefaults({
    followStart: 0,
    followCenter: 50,
    followMode: "跟拍人物",
    followMotion: "標準",
    followAnchors: [],
  });
  if (!files.src)
    return wfWrap(
      t,
      `<div class="two-col flow-layout">${wfSource()}<aside class="side"><h3>使用方式</h3><ol><li>選影片，設定 5 秒至 3 分鐘的片段。</li><li>偵測人物並點選要跟拍的人。</li><li>預覽動態裁切；跟錯時，移到該時間重新選人修正。</li><li>輸出保留原音的 9:16 影片。</li></ol></aside></div>`,
    );
  const ready = followReady(),
    fixed = values.followMode === "固定位置",
    lost = (values.followTrack || []).filter((p) => p.lost).length;
  const stage = `<section><div class="follow-source"><video data-flow-media="src" controls preload="metadata" src="${esc(files.src.url)}"></video><div data-follow-crop></div><div data-follow-people></div></div><p>${esc(files.src.name || "已選影片")}</p><div class="row">${btn("更換影片", "library:src")}${btn("上傳影片", "upload:src")}</div><p class="note" data-follow-status>${esc(followRuntime.progress || "播放或拖動到要選人的畫面，再按「更新此畫面的人物」。")}</p><h3>點選要跟拍的人</h3><p class="note">沒被框出的人可直接點身體位置；拖曳此畫面可改成固定裁切。</p><canvas class="follow-pick" data-follow-pick aria-label="人物選取畫面"></canvas><h3>9:16 裁切預覽</h3><canvas class="follow-output" data-follow-output width="270" height="480"></canvas><div class="row">${wfButton("播放／暫停預覽", "follow-preview")}<input type="range" data-follow-seek aria-label="跟拍預覽位置" min="${Number(values.followStart || 0)}" max="${Number(values.followEnd || files.src.duration || 0)}" step="0.01" value="${followRuntime.playerTime}"><span data-follow-clock></span></div></section>`;
  const settings = `<aside class="side"><h3>1 選擇片段</h3>${wfField("followStart", "開始（秒）", "number", 'min="0" step="0.1"')}${wfField("followEnd", "結束（秒）", "number", 'min="0" step="0.1"')}<div class="row">${wfButton("開始 −1s", "follow-nudge:start:-1", followRuntime.busy)}${wfButton("開始 +1s", "follow-nudge:start:1", followRuntime.busy)}${wfButton("開始設為目前時間", "follow-start-now", followRuntime.busy)}${wfButton("結束 −1s", "follow-nudge:end:-1", followRuntime.busy)}${wfButton("結束 +1s", "follow-nudge:end:1", followRuntime.busy)}${wfButton("結束設為目前時間", "follow-end-now", followRuntime.busy)}</div><h3>2 選取人物並跟拍</h3>${wfChoice("followMode", ["跟拍人物", "固定位置"])}${fixed ? range("followCenter", 50, 0, 100, 1) : `${wfButton("更新此畫面的人物", "follow-detect", followRuntime.busy)}<p>點選影片上的人物框，會開始追蹤。跟錯時，移到該時刻再更新人物並點選正確的人。</p>${wfButton("移除人物", "follow-clear", followRuntime.busy)}${wfButton("重新追蹤", "follow-track", followRuntime.busy || !values.followAnchors.length)}${wfButton("取消追蹤", "follow-cancel", !followRuntime.busy)}<label>跟拍移動</label>${wfChoice("followMotion", ["平穩", "標準", "靈敏"])}<p>${values.followAnchors.length} 個人物選取／修正點</p><div class="flow-choices">${values.followAnchors.map((a, i) => wfButton(a.time.toFixed(2) + " 秒 · 刪除修正點", "follow-remove:" + i, followRuntime.busy)).join("")}</div>${ready ? `<p role="status">追蹤完成，${values.followTrack.length} 個位置取樣${lost ? "；" + lost + " 個取樣未辨識到原人物，會保留最近位置，請預覽並修正。" : "。"}</p>` : '<p class="note">選好人物並完成追蹤後即可輸出。</p>'}`}${wfStats()}${wfButton(fixed ? "輸出固定位置的 9:16 影片" : "輸出跟拍 9:16 影片", fixed ? "follow-export" : "follow-render", followRuntime.busy || (!fixed && !ready))}<p class="note">Google EfficientDet-Lite0 在本機偵測人物；影片不傳至辨識服務。多人交錯、遮擋或離開畫面可能跟丟，可逐點修正。原始素材保留。</p></aside>`;
  return wfWrap(
    t,
    `<div class="two-col flow-layout">${stage}${settings}</div>`,
  );
}
function followWorkerCall(bitmap, track) {
  if (!followRuntime.worker) {
    const worker = new Worker("/scripts/follow-worker.js");
    followRuntime.worker = worker;
    worker.onmessage = (event) => {
      const response = event.data,
        pending = followRuntime.pending.get(response.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      followRuntime.pending.delete(response.id);
      response.error
        ? pending.reject(Error(response.error))
        : pending.resolve(response);
    };
    worker.onerror = () => {
      followCancel("人物偵測初始化失敗，請確認模型檔案已安裝後重試。");
      if (tool === "follow") render();
    };
  }
  return new Promise((resolve, reject) => {
    const id = ++followRuntime.next,
      timer = setTimeout(() => {
        followRuntime.pending.delete(id);
        reject(Error("人物偵測逾時，請重新偵測"));
      }, 60000);
    followRuntime.pending.set(id, { resolve, reject, timer });
    followRuntime.worker.postMessage(
      { id, bitmap, track },
      bitmap ? [bitmap] : [],
    );
  });
}
function followCancel(message = "已取消追蹤") {
  followRuntime.token++;
  followRuntime.busy = false;
  followRuntime.progress = message;
  followRuntime.worker?.terminate();
  followRuntime.worker = null;
  for (const pending of followRuntime.pending.values()) {
    clearTimeout(pending.timer);
    pending.reject(Error(message));
  }
  followRuntime.pending.clear();
}
function followRefreshButtons() {
  document
    .querySelectorAll('[data-flow-action^="follow-"]')
    .forEach((button) => {
      const action = button.dataset.flowAction;
      button.disabled =
        action === "follow-cancel" ||
        (action === "follow-track" && !values.followAnchors?.length) ||
        (action === "follow-render" && !followReady());
    });
  followStatus(followRuntime.progress);
}
async function followMedia(source) {
  const media = document.createElement("video");
  media.muted = true;
  media.preload = "auto";
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      followRelease(media);
      reject(Error("影片讀取逾時"));
    }, 15000);
    media.onloadeddata = () => {
      clearTimeout(timer);
      resolve();
    };
    media.onerror = () => {
      clearTimeout(timer);
      media.onerror = null;
      followRelease(media);
      reject(Error("無法讀取影片"));
    };
    media.src = source.url;
  });
  return media;
}
function followRelease(media) {
  media.pause();
  media.removeAttribute("src");
  media.load();
}
async function followBitmap(media, time) {
  const target = Math.max(0, Math.min(time, media.duration - 0.002));
  if (Math.abs(media.currentTime - target) > 0.002 || media.readyState < 2)
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error("擷取影片畫面逾時")), 15000);
      media.onseeked = () => {
        clearTimeout(timer);
        media.onseeked = null;
        resolve();
      };
      media.onerror = () => {
        clearTimeout(timer);
        reject(Error("影片解碼失敗"));
      };
      media.currentTime = target;
    });
  const scale = Math.min(1, 640 / media.videoWidth);
  // Let the decoded seek reach the rendering surface before copying its pixels.
  await new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );
  const canvas = new OffscreenCanvas(
    Math.round(media.videoWidth * scale),
    Math.round(media.videoHeight * scale),
  );
  canvas.getContext("2d").drawImage(media, 0, 0, canvas.width, canvas.height);
  return createImageBitmap(canvas);
}
function followBounds() {
  const start = Number(values.followStart || 0),
    end = Number(values.followEnd);
  if (
    !files.src ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end - start < 5 ||
    end - start > 180 ||
    end > Number(files.src.duration || 0) + 0.1
  )
    throw Error("片段需為 5 秒至 3 分鐘，並位於來源影片內");
  return { start, end };
}
function followStatus(text) {
  followRuntime.progress = text;
  const node = document.querySelector("[data-follow-status]");
  if (node) node.textContent = text;
}
async function followDetect() {
  if (followRuntime.busy) return;
  const bounds = followBounds(),
    visible = document.querySelector('[data-flow-media="src"]'),
    time = Math.max(
      bounds.start,
      Math.min(visible.currentTime, bounds.end - 0.01),
    ),
    source = files.src,
    draft = values,
    token = ++followRuntime.token;
  followRuntime.busy = true;
  followStatus("正在載入本機模型並偵測人物…");
  let media, snapshot;
  try {
    media = await followMedia(source);
    if (
      token !== followRuntime.token ||
      draft !== values ||
      source !== files.src
    )
      return;
    const bitmap = await followBitmap(media, time);
    snapshot = await createImageBitmap(bitmap);
    if (
      token !== followRuntime.token ||
      draft !== values ||
      source !== files.src
    ) {
      bitmap.close();
      return;
    }
    const response = await followWorkerCall(bitmap);
    if (
      token !== followRuntime.token ||
      tool !== "follow" ||
      values !== draft ||
      files.src !== source
    )
      return;
    followRuntime.snapshot?.close();
    followRuntime.snapshot = snapshot;
    snapshot = null;
    followRuntime.boxes = response.boxes;
    followRuntime.boxTime = time;
    visible.currentTime = time;
    followStatus(
      response.boxes.length
        ? "找到 " +
            response.boxes.length +
            " 人，點選人物框開始跟拍；未框出的人可直接點下方選人畫面。"
        : "未辨識到人物，可移到清楚的畫面更新，或直接在選人畫面點身體位置。",
    );
  } catch (error) {
    if (token === followRuntime.token) throw error;
  } finally {
    snapshot?.close();
    if (media) followRelease(media);
    if (token === followRuntime.token) {
      followRuntime.busy = false;
      if (tool === "follow") render();
    }
  }
}
async function followTrack() {
  if (followRuntime.busy) return;
  const { start, end } = followBounds(),
    draft = values,
    source = files.src,
    anchors = structuredClone(values.followAnchors || [])
      .filter((a) => a.time >= start && a.time < end)
      .sort((a, b) => a.time - b.time);
  if (!anchors.length) throw Error("請先在片段範圍內點選要跟拍的人");
  const fingerprint = followFingerprint(),
    token = ++followRuntime.token;
  followRuntime.busy = true;
  followStatus("正在追蹤人物…");
  render();
  let media;
  try {
    media = await followMedia(source);
    const points = new Map();
    let done = 0;
    const put = (time, box, lost = false) =>
      points.set(time.toFixed(3), {
        time: Number(time.toFixed(3)),
        x: box.cx,
        y: box.cy,
        lost,
      });
    const segments = [
      { anchor: anchors[0], end: start, direction: -1 },
      ...anchors.map((anchor, i) => ({
        anchor,
        end: anchors[i + 1]?.time ?? end,
        direction: 1,
      })),
    ];
    for (const segment of segments) {
      let previous = segment.anchor.box,
        appearance = segment.anchor.box.hist.slice();
      put(segment.anchor.time, previous);
      const count = Math.ceil(Math.abs(segment.end - segment.anchor.time) * 8);
      for (let i = 1; i <= count; i++) {
        if (
          token !== followRuntime.token ||
          tool !== "follow" ||
          draft !== values ||
          source !== files.src ||
          fingerprint !== followFingerprint()
        )
          return;
        const time =
          segment.direction > 0
            ? Math.min(segment.end, segment.anchor.time + i / 8)
            : Math.max(segment.end, segment.anchor.time - i / 8);
        const bitmap = await followBitmap(media, time);
        if (
          token !== followRuntime.token ||
          draft !== values ||
          source !== files.src
        ) {
          bitmap.close();
          return;
        }
        const response = await followWorkerCall(bitmap, previous),
          match = previous.manual
            ? response.template
            : FollowMath.match(response.boxes, previous, appearance) ||
              response.template;
        if (match) {
          previous = match;
          appearance = appearance.map(
            (n, j) => n * 0.95 + match.hist[j] * 0.05,
          );
        }
        put(time, previous, !match);
        done++;
        if (done % 4 === 0)
          followStatus(
            `追蹤中 · 已分析 ${Math.min(end - start, done / 8).toFixed(1)} / ${(end - start).toFixed(1)} 秒`,
          );
      }
    }
    if (
      token !== followRuntime.token ||
      draft !== values ||
      source !== files.src ||
      fingerprint !== followFingerprint()
    )
      return;
    draft.followTrack = [...points.values()].sort((a, b) => a.time - b.time);
    draft.followFingerprint = fingerprint;
    saveDraft();
    followStatus("人物追蹤完成；播放預覽，跟錯時可在該時間重新點選人物修正。");
  } catch (error) {
    if (token === followRuntime.token) throw error;
  } finally {
    if (media) followRelease(media);
    if (token === followRuntime.token) {
      followRuntime.busy = false;
      if (tool === "follow") render();
    }
  }
}
function followDraw() {
  const media = document.querySelector('[data-flow-media="src"]'),
    canvas = document.querySelector("[data-follow-output]"),
    crop = document.querySelector("[data-follow-crop]");
  if (tool !== "follow" || !media?.videoWidth || !canvas || !crop) return;
  if (followRuntime.preview && media.currentTime >= Number(values.followEnd)) {
    media.pause();
    followRuntime.preview = false;
  }
  const seek = document.querySelector("[data-follow-seek]"),
    clock = document.querySelector("[data-follow-clock]"),
    start = Number(values.followStart || 0),
    end = Number(values.followEnd || 0);
  if (seek) {
    seek.min = start;
    seek.max = end;
    seek.value = Math.max(start, Math.min(end, media.currentTime));
  }
  if (clock)
    clock.textContent = `${Math.max(0, media.currentTime - start).toFixed(1)} / ${Math.max(0, end - start).toFixed(1)} 秒`;
  const point =
      values.followMode === "固定位置"
        ? { x: 0.5, y: 0.5 }
        : FollowMath.sample(followRuntime.plan, media.currentTime),
    g = FollowMath.crop(media.videoWidth, media.videoHeight, point);
  if (values.followMode === "固定位置")
    g.x =
      Math.round(
        ((g.width - 720) * Number(values.followCenter || 0)) / 100 / 2,
      ) * 2;
  const sx = (g.x / g.width) * media.videoWidth,
    sy = (g.y / g.height) * media.videoHeight,
    sw = (720 / g.width) * media.videoWidth,
    sh = (1280 / g.height) * media.videoHeight;
  canvas
    .getContext("2d")
    .drawImage(media, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  const scale = Math.min(
      media.clientWidth / media.videoWidth,
      media.clientHeight / media.videoHeight,
    ),
    left = (media.clientWidth - media.videoWidth * scale) / 2,
    top = (media.clientHeight - media.videoHeight * scale) / 2;
  Object.assign(crop.style, {
    left: left + sx * scale + "px",
    top: top + sy * scale + "px",
    width: sw * scale + "px",
    height: sh * scale + "px",
  });
  const people = document.querySelector("[data-follow-people]");
  people.replaceChildren();
  if (
    Math.abs(media.currentTime - followRuntime.boxTime) < 0.15 &&
    !followRuntime.busy
  )
    followRuntime.boxes.forEach((box, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.followPerson = i;
      b.setAttribute("aria-label", "跟拍人物 " + (i + 1));
      b.textContent = "人物 " + (i + 1);
      Object.assign(b.style, {
        left: left + box.x * media.videoWidth * scale + "px",
        top: top + box.y * media.videoHeight * scale + "px",
        width: box.w * media.videoWidth * scale + "px",
        height: box.h * media.videoHeight * scale + "px",
      });
      people.append(b);
    });
  const pick = document.querySelector("[data-follow-pick]");
  if (pick && media.readyState >= 2) {
    const frame = followRuntime.snapshot || media,
      time = followRuntime.snapshot ? followRuntime.boxTime : media.currentTime;
    pick.width = followRuntime.snapshot?.width || media.videoWidth;
    pick.height = followRuntime.snapshot?.height || media.videoHeight;
    pick.dataset.time = time;
    const ctx = pick.getContext("2d");
    ctx.drawImage(frame, 0, 0, pick.width, pick.height);
    ctx.strokeStyle =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--accent")
        .trim() || "#695cff";
    ctx.lineWidth = Math.max(2, pick.width / 300);
    ctx.font = Math.max(14, pick.width / 45) + "px sans-serif";
    ctx.fillStyle = ctx.strokeStyle;
    if (followRuntime.snapshot)
      followRuntime.boxes.forEach((b, i) => {
        ctx.strokeRect(
          b.x * pick.width,
          b.y * pick.height,
          b.w * pick.width,
          b.h * pick.height,
        );
        ctx.fillText(
          "人物 " + (i + 1),
          b.x * pick.width + 4,
          b.y * pick.height + 22,
        );
      });
    const position =
        values.followMode === "固定位置"
          ? { x: 0.5, y: 0.5 }
          : FollowMath.sample(followRuntime.plan, time),
      geometry = FollowMath.crop(media.videoWidth, media.videoHeight, position);
    if (values.followMode === "固定位置")
      geometry.x =
        ((geometry.width - 720) * Number(values.followCenter || 0)) / 100;
    ctx.setLineDash([10, 8]);
    ctx.strokeRect(
      (geometry.x / geometry.width) * pick.width,
      (geometry.y / geometry.height) * pick.height,
      (720 / geometry.width) * pick.width,
      (1280 / geometry.height) * pick.height,
    );
  }
}
function toolFollowAfterRender() {
  followRuntime.resize?.disconnect();
  if (tool !== "follow") {
    if (followRuntime.busy) followCancel();
    return;
  }
  if (followRuntime.sourceUrl !== files.src?.url) {
    if (followRuntime.busy) {
      followCancel("來源已改變，請重新選取人物");
      queueMicrotask(() => {
        if (tool === "follow") render();
      });
    }
    followRuntime.sourceUrl = files.src?.url;
    followRuntime.boxes = [];
    followRuntime.snapshot?.close();
    followRuntime.snapshot = null;
    followRuntime.playerTime = Number(values.followStart || 0);
  }
  followRuntime.plan = followReady() ? followPlan() : [];
  const media = document.querySelector('[data-flow-media="src"]');
  if (!media) return;
  const restore = () => {
    media.currentTime = Math.min(
      followRuntime.playerTime,
      Math.max(0, media.duration - 0.002),
    );
  };
  const paint = () => {
    if (!media.isConnected) return;
    followDraw();
    if (!media.paused) requestAnimationFrame(paint);
  };
  media.addEventListener("loadedmetadata", restore, { once: true });
  media.addEventListener("loadeddata", paint);
  media.addEventListener(
    "loadeddata",
    () => {
      if (
        !followRuntime.busy &&
        followRuntime.autoSource !== files.src?.url &&
        values.followMode === "跟拍人物" &&
        !followReady() &&
        Number(values.followEnd) - Number(values.followStart || 0) >= 5
      ) {
        followRuntime.autoSource = files.src.url;
        followDetect().catch(SeedStar.reportError);
      }
    },
    { once: true },
  );
  media.addEventListener("timeupdate", followDraw);
  media.addEventListener("seeked", followDraw);
  media.addEventListener("play", paint);
  followRuntime.resize = new ResizeObserver(() => {
    if (media.isConnected) followDraw();
  });
  followRuntime.resize.observe(media);
  if (media.readyState >= 1) restore();
  if (media.readyState >= 2) paint();
}
function toolFollowBeforeRender() {
  const media = document.querySelector(
    '.follow-source [data-flow-media="src"]',
  );
  if (media && files.src && media.getAttribute("src") === files.src.url)
    followRuntime.playerTime = media.currentTime;
}
async function toolFollowAction(action) {
  if (action === "follow-preview") {
    const media = document.querySelector('[data-flow-media="src"]');
    if (!media) return;
    if (!media.paused) {
      media.pause();
      followRuntime.preview = false;
    } else {
      const { start, end } = followBounds();
      if (media.currentTime < start || media.currentTime >= end - 0.02)
        media.currentTime = start;
      followRuntime.preview = true;
      await media.play();
    }
  }
  if (action === "follow-detect") await followDetect();
  if (action === "follow-track") await followTrack();
  if (action === "follow-cancel") {
    followCancel();
    render();
  }
  if (action === "follow-clear") {
    values.followAnchors = [];
    delete values.followTrack;
    delete values.followFingerprint;
    saveDraft();
    render();
  }
  if (action?.startsWith("follow-nudge:")) {
    const [, edge, delta] = action.split(":"),
      key = edge === "start" ? "followStart" : "followEnd";
    values[key] = Math.max(
      0,
      Math.min(
        Number(files.src?.duration || 0),
        Number(values[key] || 0) + Number(delta),
      ),
    );
    saveDraft();
    render();
  }
  if (action?.startsWith("follow-remove:")) {
    values.followAnchors.splice(Number(action.slice(14)), 1);
    delete values.followFingerprint;
    saveDraft();
    render();
  }
  if (action === "follow-render") {
    if (!followReady()) throw Error("來源、片段或選取人物已改變，請重新追蹤");
    const { start, end } = followBounds(),
      draft = structuredClone(values),
      source = structuredClone(files.src),
      points = followPlan();
    const job = await SeedStar.generations.create({
      type: "video",
      operation: "follow-track",
      references: { src: source },
      settings: {
        start,
        end,
        points,
        followDraft: {
          followAnchors: draft.followAnchors,
          followTrack: draft.followTrack,
          followFingerprint: draft.followFingerprint,
          followMotion: draft.followMotion,
        },
      },
    });
    SeedStar.showJob(job);
  }
}
document.addEventListener("click", (event) => {
  const b = event.target.closest("[data-follow-person]");
  if (!b || followRuntime.busy) return;
  const box = followRuntime.boxes[Number(b.dataset.followPerson)];
  if (!box) return;
  const time = followRuntime.boxTime;
  values.followAnchors = (values.followAnchors || []).filter(
    (a) => Math.abs(a.time - time) > 0.06,
  );
  values.followAnchors.push({ time, box: structuredClone(box) });
  values.followAnchors.sort((a, b) => a.time - b.time);
  saveDraft();
  followTrack().catch(SeedStar.reportError);
});
function followCanvasBox(canvas, x, y) {
  const w = 0.16,
    h = 0.4,
    box = {
      x: Math.max(0, Math.min(1 - w, x - w / 2)),
      y: Math.max(0, Math.min(1 - h, y - h / 2)),
      w,
      h,
      manual: true,
    };
  box.cx = box.x + w / 2;
  box.cy = box.y + h / 2;
  const patch = document.createElement("canvas");
  patch.width = 24;
  patch.height = 32;
  const ctx = patch.getContext("2d");
  const frame =
    followRuntime.snapshot || document.querySelector('[data-flow-media="src"]');
  ctx.drawImage(
    frame,
    box.x * canvas.width,
    box.y * canvas.height,
    w * canvas.width,
    h * canvas.height,
    0,
    0,
    24,
    32,
  );
  const pixels = ctx.getImageData(0, 0, 24, 32).data,
    hist = Array(64).fill(0),
    samples = [];
  for (let i = 0; i < pixels.length; i += 4) {
    hist[
      (pixels[i] >> 6) * 16 + (pixels[i + 1] >> 6) * 4 + (pixels[i + 2] >> 6)
    ]++;
    samples.push(
      pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114,
    );
  }
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length,
    norm = Math.sqrt(samples.reduce((sum, n) => sum + (n - mean) ** 2, 0));
  if (norm < 1) throw Error("這個區域缺少可追蹤特徵，請改點清楚的身體位置");
  box.hist = hist.map((n) => n / (24 * 32));
  box.patch = samples.map((n) => (n - mean) / norm);
  return box;
}
document.addEventListener("pointerdown", (event) => {
  const canvas = event.target.closest("[data-follow-pick]");
  if (!canvas || followRuntime.busy || event.button !== 0) return;
  const bounds = canvas.getBoundingClientRect(),
    startX = event.clientX;
  let moved = false;
  canvas.setPointerCapture(event.pointerId);
  const move = (ev) => {
    if (Math.abs(ev.clientX - startX) < 5 && !moved) return;
    moved = true;
    const media = document.querySelector('[data-flow-media="src"]'),
      g = FollowMath.crop(media.videoWidth, media.videoHeight, {
        x: 0.5,
        y: 0.5,
      }),
      visible = 720 / g.width;
    values.followMode = "固定位置";
    values.followCenter = Math.max(
      0,
      Math.min(
        100,
        (((ev.clientX - bounds.left) / bounds.width - visible / 2) /
          Math.max(0.001, 1 - visible)) *
          100,
      ),
    );
    followDraw();
  };
  canvas.onpointermove = move;
  canvas.onpointerup = (ev) => {
    canvas.onpointermove = canvas.onpointerup = canvas.onpointercancel = null;
    try {
      if (!moved) {
        const x = (ev.clientX - bounds.left) / bounds.width,
          y = (ev.clientY - bounds.top) / bounds.height,
          time = Number(canvas.dataset.time),
          box =
            (followRuntime.snapshot &&
              followRuntime.boxes.find(
                (b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h,
              )) ||
            followCanvasBox(canvas, x, y);
        values.followAnchors = (values.followAnchors || []).filter(
          (a) => Math.abs(a.time - time) > 0.06,
        );
        values.followAnchors.push({ time, box: structuredClone(box) });
        values.followAnchors.sort((a, b) => a.time - b.time);
        values.followMode = "跟拍人物";
        saveDraft();
        followTrack().catch(SeedStar.reportError);
      } else {
        saveDraft();
        render();
      }
    } catch (error) {
      SeedStar.reportError(error);
    }
  };
  canvas.onpointercancel = () => {
    canvas.onpointermove = canvas.onpointerup = canvas.onpointercancel = null;
    saveDraft();
    render();
  };
});
document.addEventListener("input", (event) => {
  if (tool !== "follow" || !event.target.dataset.key) return;
  if (
    ["followStart", "followEnd"].includes(event.target.dataset.key) &&
    followRuntime.busy
  ) {
    values[event.target.dataset.key] = event.target.value;
    saveDraft();
    followCancel("區間已改變，請重新追蹤");
    followRefreshButtons();
  }
  followDraw();
});
window.addEventListener("beforeunload", () => followCancel());
document.addEventListener("input", (event) => {
  if (!event.target.matches("[data-follow-seek]")) return;
  const media = document.querySelector('[data-flow-media="src"]');
  if (media) {
    media.currentTime = Number(event.target.value);
    followDraw();
  }
});
