// Card ED.8: the export dialog (spec §1.7, §3 檔案歸屬: ED.8), opened by edAction("export") in tools-editor.js.
// 輸出到 = a platform preset (ratio + 1080P) or 自訂 (project ratio, 720P / 1080P / 4K); 影片浮水印 = the account watermark that
// ED.7 keeps in preference tools.editor.watermark, laid over the whole video in the exported COPY of the project (the project
// itself is never changed). Frame rate and loudness stay in 整片設定 › 輸出 / 音訊. Delivery fit = main-system RATIO_PREFERENCE.
const edExportPlatforms = [
  ["TikTok／Reels", "9:16"],
  ["YouTube Shorts", "9:16"],
  ["YouTube 推薦", "16:9"],
  ["Instagram 貼文", null],
  ["自訂", null],
];
const edExportQualityText = { "720p": "720P HD", "1080p": "1080P Full HD 推薦", "4K": "4K" };
// The exported copy: the target ratio, plus the watermark as an overlay image on its own top track for the whole length.
function edExportProject(p, ratio, mark, prepared) {
  const native = prepared || edNative(p);
  native.ratio = ratio;
  if (!mark) return native;
  const used = new Set(native.tracks.map((t) => t.id)),
    n = Array.from({ length: 99 }, (_, i) => i + 1).find((i) => !used.has("V" + i));
  if (
    native.tracks.filter((t) => t.kind === "video").length >= 8 ||
    native.tracks.length >= 16 ||
    !n
  )
    throw Error("軌道已滿，無法加入浮水印；請先刪掉一條影片軌");
  if (native.clips.filter((c) => c.kind !== "text").length >= 64)
    throw Error("影音片段已達 64 段上限，無法加入浮水印");
  const track = "V" + n;
  native.tracks.push({ id: track, kind: "video", name: "浮水印" });
  native.clips.push({
    id: "export-watermark",
    kind: "image",
    track,
    asset: { id: mark.id, url: mark.url, name: mark.name, kind: "image" },
    startFrame: 0,
    durationFrames: Math.max(...native.clips.map((c) => c.startFrame + c.durationFrames)),
    sourceStartFrame: 0,
    speed: 1,
    volume: 1,
    fadeIn: 0,
    fadeOut: 0,
    opacity: 0.85,
    scale: 1,
    x: 96,
    y: 95,
    rotation: 0,
    width: 18,
  });
  return native;
}
// Only the export copy changes. Existing timeline transitions are centred on adjacent cuts, so bookends use that same rule.
function edAddBookends(native, ends, assets) {
  const main = EditorModel.mainTrack(native.tracks),
    clip = (which, startFrame) => ({ id: crypto.randomUUID(), kind: "video", track: main, asset: assets[which], bookend: which,
      startFrame, durationFrames: Timebase.toFrames(assets[which].duration, native.timebase), sourceStartFrame: 0,
      speed: 1, volume: 1, opacity: 1, scale: 1, x: 0, y: 0, rotation: 0, width: 25, fadeIn: 0, fadeOut: 0, transition: "無" }),
    transition = (incoming, end) => {
      if (!end || Transitions.name(end.transition) === "無") return;
      incoming.transition = Transitions.name(end.transition);
      incoming.transitionFrames = Timebase.toFrames(end.transitionSeconds, native.timebase);
    };
  if (assets.intro && !native.clips.some((c) => c.bookend === "intro")) {
    const intro = clip("intro", 0), first = native.clips.filter((c) => c.track === main).sort((a, b) => a.startFrame - b.startFrame)[0];
    if (!first || (Transitions.name(ends.intro.transition) !== "無" && first.startFrame !== 0)) throw Error("主影片軌開頭有空隙，請先對齊，才能接片頭轉場");
    for (const c of native.clips) c.startFrame += intro.durationFrames;
    transition(first, ends.intro);
    native.clips.push(intro);
  }
  if (assets.outro && !native.clips.some((c) => c.bookend === "outro")) {
    const end = Math.max(...native.clips.map((c) => c.startFrame + c.durationFrames)),
      previous = native.clips.filter((c) => c.track === main).sort((a, b) => a.startFrame - b.startFrame).at(-1), outro = clip("outro", end);
    if (Transitions.name(ends.outro.transition) !== "無" && previous.startFrame + previous.durationFrames !== end) throw Error("主影片軌結尾有空隙，請先對齊，才能接片尾轉場");
    transition(outro, ends.outro);
    native.clips.push(outro);
  }
  return native;
}
async function edExportWithBookends(p, ratio, mark) {
  const hit = edSpineHit(p), native = edNative(p), assets = {};
  native.ratio = ratio;
  if (!hit) return edExportProject(p, ratio, mark, native);
  for (const which of ["intro", "outro"]) {
    const end = hit.episode[which];
    if (!end || end.kind === "none" || native.clips.some((c) => c.bookend === which)) continue;
    let input;
    if (end.kind === "template") {
      const made = EpisodeSpine.bookendJob(hit.project, hit.episode, which, ratio, VideoWorkbench.capabilities?.remotionTemplates || []);
      if (made.problem) throw Error(made.problem);
      input = made.input;
    } else {
      input = { type: "video", operation: "editor-export", prompt: which === "intro" ? "片頭標題卡" : "片尾標題卡",
        settings: { quality: "1080p", project: { ratio, timebase: p.timebase,
          tracks: [{ id: "V1", kind: "video" }, { id: "T1", kind: "text" }],
          clips: [{ id: "bookend-text", kind: "text", track: "T1", text: end.fields.title, font: "思源黑體", fontSize: 64,
            startFrame: 0, durationFrames: Timebase.toFrames(end.seconds, p.timebase), sourceStartFrame: 0, x: 50, y: 50, animation: "淡入淡出" }] } },
        link: { projectId: hit.project.id, episodeId: hit.episode.id, target: which, tool: "editor-export", step: "motion" } };
    }
    const key = end.kind === "template" ? EpisodeSpine.bookendKey(input) : JSON.stringify(input.settings),
      list = await VideoWorkbench.generations.list();
    let job = list.findLast((j) => !["failed", "cancelled", "blocked"].includes(j.status) &&
      (end.kind === "template" ? j.input?.operation === "remotion-template" && EpisodeSpine.bookendKey(j.input) === key : j.input?.bookendKey === key));
    // paid: none (both branches render locally: Remotion template or editor-export title card).
    if (!job) job = await VideoWorkbench.generations.create({ ...input, bookendKey: key });
    VideoWorkbench.showJob(job);
    const until = Date.now() + 20 * 60 * 1000;
    while (job.status !== "succeeded") {
      if (["failed", "cancelled", "blocked"].includes(job.status)) throw Error((which === "intro" ? "片頭" : "片尾") + "失敗：" + (job.error?.message || job.error || job.status));
      if (Date.now() > until) throw Error("片頭／片尾仍在處理，請稍後重新匯出；會重用已送的任務");
      await new Promise((resolve) => setTimeout(resolve, 1000));
      job = await VideoWorkbench.generations.get(job.id);
    }
    assets[which] = await edProbe(VideoWorkbench.jobAsset(job));
  }
  return edExportProject(p, ratio, mark, edAddBookends(native, hit.episode, assets));
}
// 匯出時間軸 v1: the project as MediaTimelineV1 (backend /editor/timeline-v1) sent to the main system's structural check
// (same-origin POST /api/video/timeline/validate). state = { busy } | { error } | { exported, remote }; one line per issue.
function edTimelineReport(state) {
  if (!state) return "";
  const line = (text) => `<p class="note" data-ed-timeline-issue>${esc(text)}</p>`;
  if (state.busy) return line("檢查中…");
  if (state.error) return line("時間軸 v1：" + state.error);
  const { exported, remote } = state,
    losses = exported.losses || [],
    issues = remote.ok ? [] : remote.errors?.length ? remote.errors.map((e) => e.path + "：" + e.message) : [remote.error || "主系統無法檢查（HTTP " + remote.status + "）"];
  return (
    line(remote.ok ? "主系統結構檢查通過（只檢查結構，還不能渲染）" : "主系統結構檢查未通過：") +
    issues.map(line).join("") +
    (losses.length ? line("匯出到 Timeline v1 會丟失 " + losses.length + " 項：") + losses.slice(0, 30).map((l) => line(l.message + (l.clipId ? "（片段 " + l.clipId + "）" : ""))).join("") + (losses.length > 30 ? line("…還有 " + (losses.length - 30) + " 項") : "") : "")
  );
}
async function edTimelineCheck(p) {
  const organizationId = VideoWorkbench.capabilities?.mainSystem?.organizationId;
  if (!organizationId) throw Error("需要連上主系統並選好組織");
  const exported = await VideoWorkbench.request("/editor/timeline-v1", { organizationId, project: edNative(p) }),
    r = await fetch("/api/video/timeline/validate", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ timeline: exported.timeline }) }),
    body = await r.json().catch(() => ({}));
  return { exported, remote: { ok: r.ok && body.ok === true, status: r.status, errors: body.errors, error: typeof body.error === "string" ? body.error : "" } };
}
function edExportDialog(p) {
  const st = { platforms: ["自訂"], instagram: "1:1", mark: null, useMark: false, busy: false, timeline: null, sent: [] },
    // Plan U5 (D5): 輸出到 is a multi-choice and each ratio is one export job -- two platforms of one ratio are one job;
    // a preset is 1080P, 自訂 sets its ratio's quality.
    targets = () => {
      const out = new Map();
      for (const [name, preset] of edExportPlatforms) {
        if (!st.platforms.includes(name)) continue;
        const ratio = name === "Instagram 貼文" ? st.instagram : preset || p.ratio;
        if (!out.has(ratio) || name === "自訂") out.set(ratio, { ratio, quality: name === "自訂" ? ed.quality : "1080p" });
      }
      return [...out.values()];
    },
    // A ratio accepted earlier in this dialog is not sent again when a later one failed and the user retries.
    pending = () => targets().filter((t) => !st.sent.includes(t.ratio)),
    size = (ratio, quality) => edRatios[ratio].map((v) => Math.round((v * EditorModel.QUALITIES[quality]) / 2) * 2);
  const body = () => {
    const list = targets(),
      small = (ratio) => {
        const k4 = size(ratio, "4K");
        return p.clips.some((c) => ["video", "image"].includes(c.kind) && !(c.asset?.width >= k4[0] && c.asset?.height >= k4[1]));
      },
      fit = (ratio) => {
        const delivery = ed.delivery?.ratios?.[ratio];
        return delivery?.platforms ? delivery.platforms.map((x) => x.platform + (x.preferred ? "（首選）" : "")).join("、") : delivery?.note || "此比例尚不能投遞";
      },
      custom = st.platforms.includes("自訂");
    return `<h3>匯出影片</h3>
<p class="note">輸出到（可複選，每個比例一個任務）</p>${edChoices("輸出到", "platform", st.platforms, edExportPlatforms.map(([name]) => name))}
${st.platforms.includes("Instagram 貼文") ? edChoices("Instagram 比例", "instagram", st.instagram, ["1:1", "4:5"]) : ""}
${list.length ? list.map(({ ratio, quality }) => `<p data-ed-export-spec>${esc(`${ratio} · ${size(ratio, quality).join("×")} · ${quality === "1080p" ? "1080P" : quality === "720p" ? "720P" : "4K"} · ${Timebase.label(p.timebase)} · MP4`)}</p>`).join("") : '<p class="note">請至少選一個輸出目標</p>'}
${custom ? `<p class="note">畫質</p>${edChoices("畫質", "quality", ed.quality, Object.keys(EditorModel.QUALITIES), (q) => edExportQualityText[q] + "（" + size(p.ratio, q).join("×") + "）")}` : ""}
${list.some((t) => t.quality === "4K" && small(t.ratio)) ? '<p class="note" data-ed-upscale>來源低於 4K，會放大</p>' : ""}
<p class="note">影片浮水印</p>${
      st.mark
        ? edChoices("影片浮水印", "watermark", st.useMark ? "套用" : "不套用", ["不套用", "套用"]) + (st.useMark ? `<p class="note" data-ed-watermark-name>${esc(st.mark.name || "浮水印")}，右下角、整段影片</p>` : "")
        : `${edChoices("影片浮水印", "watermark", "不套用", ["不套用"])}<p class="note">尚未設定浮水印。<button type="button" class="btn small" data-ed-watermark-setup>前往設定浮水印 ↗</button></p>`
    }
<p data-ed-export-total>剪輯總時長：<b>${edClockText(edTotal())}</b>　預估費用：<b data-ed-export-cost>免費（本機輸出，不扣點）</b></p>
<p class="note" data-ed-delivery>適合投遞：${!ed.delivery ? "讀取中…" : esc(list.map(({ ratio }) => (list.length > 1 ? ratio + " " : "") + fit(ratio)).join("；"))}</p>
<p class="note">時間軸交換格式</p><div><button type="button" class="btn small" data-ed-timeline${st.timeline?.busy ? " disabled" : ""}>匯出時間軸 v1</button></div>${edTimelineReport(st.timeline)}
<div class="editor-export-actions"><button class="btn" type="button" data-ed-export-cancel>取消</button><button class="btn primary" type="button" data-ed-export${st.busy || !pending().length ? " disabled" : ""}>開始匯出${pending().length > 1 ? "（" + pending().length + " 個任務）" : ""}</button></div>`;
  };
  const d = edDialog(`<div data-ed-export-body>${body()}</div>`),
    refresh = () => {
      const box = d.querySelector("[data-ed-export-body]");
      if (box) box.innerHTML = VideoWorkbench.sanitize(body());
      wire();
    };
  if (!ed.delivery)
    VideoWorkbench.request("/delivery-ratios", undefined, "GET")
      .then((value) => {
        ed.delivery = value;
        refresh();
      })
      .catch(VideoWorkbench.reportError);
  // The watermark must still be a library watermark (the same check the 貼圖 pane makes).
  Promise.all([
    VideoWorkbench.preferences.get("tools.editor.watermark", null),
    VideoWorkbench.assets.list(),
  ])
    .then(([mark, rows]) => {
      st.mark = mark?.url && rows.some((a) => a.id === mark.id && a.watermark === true) ? mark : null;
      refresh();
    })
    .catch(VideoWorkbench.reportError);
  const choose = (prefix, apply) =>
    d.querySelectorAll(`[data-ed-action^="${prefix}:"]`).forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        apply(b.dataset.edAction.slice(prefix.length + 1));
        refresh();
      };
    });
  function wire() {
    choose("platform", (v) => (st.platforms = st.platforms.includes(v) ? st.platforms.filter((x) => x !== v) : [...st.platforms, v]));
    choose("instagram", (v) => (st.instagram = v));
    choose("quality", (v) => (ed.quality = v));
    choose("watermark", (v) => (st.useMark = v === "套用"));
    d.querySelector("[data-ed-watermark-setup]")?.addEventListener("click", () => {
      d.close();
      document.querySelector('[data-ed-pane="貼圖"]')?.click();
    });
    d.querySelector("[data-ed-timeline]").onclick = async () => {
      st.timeline = { busy: true };
      refresh();
      try {
        st.timeline = await edTimelineCheck(p);
      } catch (err) {
        st.timeline = { error: err.message };
      }
      refresh();
    };
    d.querySelector("[data-ed-export-cancel]").onclick = () => d.close();
    d.querySelector("[data-ed-export]").onclick = async (e) => {
      e.target.disabled = st.busy = true; // a late reload of the watermark / delivery rebuilds the body: it must not re-enable the button
      try {
        p.clips.forEach(edValidate);
        let job;
        for (const { ratio, quality } of pending()) {
          job = await VideoWorkbench.generations.create({
            type: "video",
            operation: "editor-export",
            settings: {
              quality,
              project: await edExportWithBookends(p, ratio, st.useMark ? st.mark : null),
              projectRevision: p.revision || 0,
            },
          });
          st.sent.push(ratio);
        }
        d.close();
        if (job) VideoWorkbench.showJob(job);
      } catch (err) {
        VideoWorkbench.reportError(err);
        st.busy = false;
        refresh();
      }
    };
  }
  wire();
}
if (typeof module === "object" && module.exports) module.exports = { edAddBookends };
