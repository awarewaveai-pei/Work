// U5.5: edit, render and rejoin the episode's one bookend setting. All rendering here is local (免費).
(function () {
  const V = VideoWorkbench, S = EpisodeSpine, clone = (v) => structuredClone(v);
  const label = (end, templates) => !end ? "尚未設定" : (end.kind === "title" ? "標題卡" : templates.find((t) => t.id === end.templateId)?.label || "模板") + " · " + end.seconds + " 秒 · " + (Transitions.name(end.transition) ?? "") + "轉場";
  const current = async (v, create = false) => {
    const links = await V.preferences.get("bookends.jobLinks", {});
    let link = v.input?.link || links[v.id], list = await V.projects.list(), p = list.find((p) => p.id === link?.projectId), e = p?.episodes?.find((e) => e.id === link.episodeId);
    if (!e && create) {
      link = await V.spine.create({ title: v.input?.settings?.title || v.input?.prompt || "成片", shots: [] });
      list = await V.projects.list(); p = list.find((p) => p.id === link.projectId); e = p?.episodes?.find((e) => e.id === link.episodeId);
      await V.preferences.set("bookends.jobLinks", { ...await V.preferences.get("bookends.jobLinks", {}), [v.id]: link });
      v.input ||= {}; v.input.link = { ...link }; // only this dialog's reference; the new output carries its real lineage
    }
    return e ? { p, e } : null;
  };
  const wait = async (job) => {
    const until = Date.now() + 20 * 60 * 1000;
    while (job.status !== "succeeded") {
      if (["failed", "cancelled", "blocked"].includes(job.status)) throw Error("片頭失敗：" + (job.error?.message || job.error || job.status));
      if (Date.now() > until) throw Error("片頭仍在處理，稍後重開會重用這個任務");
      await new Promise((r) => setTimeout(r, 1500)); job = await V.generations.get(job.id);
    }
    return job;
  };
  async function render(p, e, which, ratio, force = false, peek = false) {
    const end = e[which];
    if (!end) return null;
    let input;
    if (end.kind === "template") {
      const made = S.bookendJob(p, e, which, ratio, V.capabilities?.remotionTemplates || []);
      if (made.problem) throw Error(made.problem); input = made.input;
    } else {
      input = { type: "video", operation: "editor-export", prompt: "片頭標題卡", settings: { quality: "1080p", project: {
        ratio, timebase: { num: 30, den: 1 }, tracks: [{ id: "V1", kind: "video" }, { id: "T1", kind: "text" }],
        clips: [{ id: "title", kind: "text", track: "T1", text: end.fields.title, font: "思源黑體", fontSize: 64,
          startFrame: 0, durationFrames: Math.round(end.seconds * 30), sourceStartFrame: 0, x: 50, y: 50, animation: "淡入淡出" }] } } };
    }
    input.link ||= { projectId: p.id, episodeId: e.id, step: "motion", tool: "bookends", target: which };
    const key = end.kind === "template" ? S.bookendKey(input) : JSON.stringify(input.settings),
      previous = (await V.generations.list()).filter((j) => end.kind === "template" ? j.input?.operation === "remotion-template" && S.bookendKey(j.input) === key : j.input?.bookendKey === key)
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))).at(-1);
    if (peek) return previous?.status === "succeeded" ? previous : null;
    // paid: none (Remotion / editor-export render locally).
    const job = !force && previous && !["failed", "cancelled", "blocked"].includes(previous.status) ? previous : await V.generations.create({ ...input, bookendKey: key });
    V.showJob(job); return wait(job);
  }
  const seconds = (url) => new Promise((resolve, reject) => {
    const video = document.createElement("video"), timeout = setTimeout(() => finish(Error("讀取主片長度逾時")), 15000);
    const finish = (error) => { clearTimeout(timeout); const n = video.duration; video.onloadedmetadata = video.onerror = null; video.removeAttribute("src"); video.load(); error || !(n > 0) || !Number.isFinite(n) ? reject(error || Error("影片沒有有效長度")) : resolve(n); };
    video.preload = "metadata"; video.onloadedmetadata = () => finish(); video.onerror = () => finish(Error("無法讀取影片")); video.src = V.safeUrl(url);
  });
  // Original input tracks are reusable, including their voice clips; quick-render keeps its already-voiced main file.
  function baseProject(v, duration) {
    if (v.input?.settings?.bookendBase) return clone(v.input.settings.bookendBase);
    if (v.input?.operation === "editor-export") {
      const p = clone(v.input.settings.project), intro = p.clips.find((c) => c.bookend === "intro"), offset = intro?.durationFrames || 0;
      p.clips = p.clips.filter((c) => !c.bookend).map((c) => ({ ...c, startFrame: Math.max(0, c.startFrame - offset), ...(c.startFrame === offset ? { transition: "無" } : {}) }));
      return p;
    }
    const url = v.result.mainUrl || v.result.url;
    if (!v.result.mainUrl && (v.input?.settings?.bookends || v.input?.settings?.intro)) throw Error("這支舊成片沒有保留可重接的主片；請從原剪輯輸出一次，再換片頭");
    return { ratio: v.result.ratio || v.input?.settings?.ratio, timebase: { num: 30, den: 1 }, tracks: [{ id: "V1", kind: "video" }], clips: [
      { id: "main", kind: "video", track: "V1", asset: { id: "main-" + v.id, url, kind: "video" }, startFrame: 0,
        durationFrames: Math.round(duration * 30), sourceStartFrame: 0, speed: 1, volume: 1, opacity: 1, scale: 1, x: 0, y: 0, rotation: 0, width: 25 },
    ] };
  }
  async function join(v) {
    const hit = await current(v, true), ratio = v.result.ratio || v.input?.settings?.ratio || v.input?.settings?.project?.ratio;
    if (!ratio) throw Error("成片未記錄比例，無法重接");
    const base = baseProject(v, v.input?.operation === "editor-export" || v.input?.settings?.bookendBase ? 0 : await seconds(v.result.mainUrl || v.result.url)),
      project = clone(base), fps = project.timebase.num / project.timebase.den,
      main = project.tracks.find((t) => t.kind === "video")?.id;
    if (!main) throw Error("主片沒有影片軌");
    let baseText = v.input?.settings?.bookendBaseText || (v.input?.operation !== "editor-export" ? {
      title: v.result.title || hit.p.title, script: v.result.script || (v.input?.settings?.scenes || []).map((s) => s.narration).join("\n"),
      captions: v.result.mainCaptionCues || [],
    } : null);
    if (baseText && !baseText.captions.length && v.result.assetId && V.capabilities?.mainSystem?.organizationId) {
      const res = await fetch("/api/video/assets?" + new URLSearchParams({ organizationId: V.capabilities.mainSystem.organizationId, includeWorkbench: "1" }), { credentials: "same-origin" });
      if (!res.ok) throw Error("無法讀取原成片字幕，請稍後重試");
      const metadata = (await res.json()).items?.find((a) => a.id === v.result.assetId)?.metadata;
      baseText = { ...baseText, captions: (v.result.mainUrl ? metadata?.mainCaptionCues : metadata?.captionCues) || [], script: metadata?.script || baseText.script };
    }
    project.title ||= hit.p.title;
    let leadFrames = 0;
    for (const which of ["intro", "outro"]) {
      const end = hit.e[which]; if (!end) continue;
      const job = await render(hit.p, hit.e, which, ratio), asset = V.jobAsset(job), duration = await seconds(asset.url),
        length = Math.round(duration * fps), first = project.clips.filter((c) => c.track === main).sort((a, b) => a.startFrame - b.startFrame)[0],
        clip = { id: crypto.randomUUID(), bookend: which, kind: "video", track: main, asset, startFrame: which === "intro" ? 0 : Math.max(...project.clips.map((c) => c.startFrame + c.durationFrames)),
          durationFrames: length, sourceStartFrame: 0, speed: 1, volume: 1, opacity: 1, scale: 1, x: 0, y: 0, rotation: 0, width: 25 };
      if (which === "intro") {
        if (first?.startFrame !== 0) throw Error("主影片軌開頭有空隙，請先在剪輯器對齊");
        project.clips.forEach((c) => c.startFrame += length);
        leadFrames = length;
      }
      if (which === "outro" && Transitions.name(end.transition) !== "無") {
        const previous = project.clips.filter((c) => c.track === main).sort((a, b) => a.startFrame - b.startFrame).at(-1);
        if (previous.startFrame + previous.durationFrames !== clip.startFrame) throw Error("主影片軌結尾有空隙，請先在剪輯器對齊");
      }
      const incoming = which === "intro" ? first : clip;
      incoming.transition = Transitions.name(end.transition);
      incoming.transitionFrames = Math.round(end.transitionSeconds * fps); project.clips.push(clip);
    }
    // paid: none (only re-encodes the existing pictures and voice with local editor-export).
    const next = await V.generations.create({ type: "video", operation: "editor-export", prompt: "重接片頭／片尾",
      references: { source: { url: v.result.url } }, settings: { quality: v.input?.settings?.quality || "1080p", project, bookendBase: base,
        ...(baseText ? { bookendBaseText: baseText, reusedText: { ...baseText, captions: baseText.captions.map((c) => ({ ...c, startMs: c.startMs + Math.round(leadFrames / fps * 1000), endMs: c.endMs + Math.round(leadFrames / fps * 1000) })) } } : {}) },
      link: { projectId: hit.p.id, episodeId: hit.e.id, step: "finish", tool: "bookends", target: "output", from: [{ slot: "export", key: v.result.url }] } });
    V.showJob(next); return next;
  }
  async function edit(v) {
    const hit = await current(v, true), caps = V.capabilities || await V.loadCapabilities(), templates = caps.remotionTemplates || [],
      assets = await V.assets.list(), d = document.createElement("dialog");
    let draft = clone(hit.e.intro || { kind: "title", fields: { title: hit.p.title }, seconds: 3, transition: Transitions.AUTO.id, transitionSeconds: 0.5 });
    const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const draw = () => {
      const t = templates.find((t) => t.id === draft.templateId), field = (f) => {
        if (["image", "audio"].includes(f.type)) return `<fieldset><legend>${esc(f.label)}</legend>${assets.filter((a) => V.mediaKind(a) === f.type).map((a) => `<button type="button" class="btn small" data-pick="${esc(f.key)}" data-id="${esc(a.id)}" aria-pressed="${draft.references?.[f.key]?.url === a.url}">${esc(a.name || a.id)}</button>`).join("")}<button type="button" class="btn small" data-pick="${esc(f.key)}" data-id="">不使用</button></fieldset>`;
        return `<label>${esc(f.label)}<input class="text-input" data-field="${esc(f.key)}" value="${esc(draft.fields?.[f.key] ?? "")}" maxlength="${f.max || 200}"></label>`;
      };
      d.innerHTML = V.sanitize(`<form><h3>編輯片頭</h3><p>渲染與重接 免費，原鏡頭與配音不重生。</p><div class="row">${[["none", "不要"], ["title", "標題卡"], ...templates.map((t) => [t.id, t.label])].map(([id, name]) => `<button type="button" class="btn small" data-kind="${esc(id)}" aria-pressed="${id === (draft.templateId || draft.kind)}">${esc(name)}</button>`).join("")}</div>${draft.kind === "title" ? field({ key: "title", label: "標題", max: 80 }) : draft.kind === "template" ? (t?.fields || []).map(field).join("") : ""}<label>長度（秒）<input type="number" class="text-input" name="seconds" min="${t?.seconds.min || 1}" max="${t?.seconds.max || 15}" value="${draft.seconds}"></label>${Transitions.buttons({ label: "轉場", value: draft.transition, esc, why: Transitions.bookendWhy })}<p data-error role="alert"></p><button type="button" class="btn" data-cancel>取消</button><button class="btn primary" type="submit">儲存並渲染片頭 · 免費</button></form>`);
      d.querySelectorAll('[data-kind]').forEach((b) => b.onclick = () => { const id = b.dataset.kind, t = templates.find((t) => t.id === id); draft = { ...draft, kind: t ? "template" : id, templateId: t?.id, fields: id === "title" ? { title: hit.p.title } : {}, references: {}, seconds: t?.seconds.def || 3 }; draw(); });
      d.querySelectorAll('[data-field]').forEach((i) => i.oninput = () => { draft.fields ||= {}; draft.fields[i.dataset.field] = i.value; });
      d.querySelector('[name=seconds]').oninput = (ev) => draft.seconds = Number(ev.target.value);
      d.querySelectorAll('[data-transition]').forEach((b) => b.onclick = () => { draft.transition = b.dataset.transition; draw(); });
      d.querySelectorAll('[data-pick]').forEach((b) => b.onclick = () => { draft.references ||= {}; const a = assets.find((a) => a.id === b.dataset.id); if (a) draft.references[b.dataset.pick] = { url: a.url, id: a.id }; else delete draft.references[b.dataset.pick]; draw(); });
      d.querySelector('[data-cancel]').onclick = () => d.close();
      d.querySelector('form').onsubmit = async (ev) => {
        ev.preventDefault(); const submit = d.querySelector('[type=submit]'); submit.disabled = true;
        try {
          const end = S.normalizeBookend(draft, templates); if (draft.kind !== 'none' && !end) throw Error('請確認標題、長度與轉場設定');
          const e = { ...hit.e, intro: end }, ratio = v.result?.ratio || v.input?.settings?.ratio || v.input?.settings?.project?.ratio || hit.p.ratio;
          if (end?.kind === 'template') { const made = S.bookendJob(hit.p, e, 'intro', ratio, templates); if (made.problem) throw Error(made.problem); }
          await V.spine.setBookends({ projectId: hit.p.id, episodeId: hit.e.id, intro: end });
          if (end) await render(hit.p, e, 'intro', ratio); d.close(); V.notify('片頭已更新；按「加入這支影片」產生新版本');
        } catch (error) { d.querySelector('[data-error]').textContent = error.message; submit.disabled = false; }
      };
    };
    draw(); document.body.append(d); d.showModal();
    return new Promise((resolve) => d.addEventListener('close', () => { d.remove(); resolve(); }, { once: true }));
  }
  V.bookends = { label, current, render, join, edit, baseProject, peek: (p, e, which, ratio) => render(p, e, which, ratio, false, true) };
})();
