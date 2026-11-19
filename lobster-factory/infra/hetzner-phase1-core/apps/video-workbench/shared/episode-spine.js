// Card PJ.1 (docs/pj-project-spine-spec-20261106.md §1.4): one video = one episode of the projects page; the episode
// points at its edit file. Card PJ.2: a finished job linked to an episode becomes one of its steps (settle).
// Pure functions, no DOM. Browser global `EpisodeSpine`; require() in Node.
// Invariant (spec §0): the spine fields of an episode are changed only by the top page's runtime; a child page's
// whole-list write keeps the top page's copy of them (keepSpine), so a stale copy can never overwrite them.
(function (root) {
  // Plan U5.3: intro / outro / autoRun are spine fields too (written only by the top page: spine-set-bookends,
  // spine-set-auto-run), so a child's stale whole-list write can never undo a choice or a run's progress.
  const SPINE = ["edit", "steps", "outputs", "intro", "outro", "autoRun"],
    SHOT_SPINE = ["image", "video"];
  const newId = () => globalThis.crypto.randomUUID();
  // The editor's rows keep their id inside native (shared/project-envelope.js wrap); a Craft engine's row carries
  // its own id outside (scripts/tools-engine-host.js engineSaveProject), and its native is the engine's own document.
  const own = (row) =>
    row?.formatVersion === 1 && row.engine === "workbench-editor";
  const editId = (row) => (own(row) ? row.native?.id : row?.id) ?? null;
  const editTitle = (row) =>
    (own(row) ? row.native?.title : (row?.title ?? row?.native?.title)) ||
    "剪輯專案";
  const editRatio = (row) =>
    row?.native?.ratio ?? row?.output?.ratio ?? row?.ratio ?? "16:9";
  const episodes = (projects) =>
    projects.flatMap((p) =>
      (p.episodes || []).map((episode) => ({ project: p, episode })),
    );

  // A project the spine makes, with one episode: adopt (an edit file) and card U3's spine-create (a script sent from 腳本).
  // The projects page's own 建立新專案 asks type and style first and builds its own. `extra` = more project fields
  // (U3: storyBibleSeries, the Story Bible series the script used).
  function newProject({ id, title, ratio = "16:9", assets = [], episode = {}, ...extra }) {
    return {
      id, title, type: "single", ratio, style: 8, customStyle: "", createdAt: Date.now(), cover: "", assets,
      settings: { model: "", lockModel: true, videoPrompt: "" }, // "" = the default video model (shared/models.js get)
      ...extra,
      episodes: [{ name: title, outline: "", shots: [], steps: [], outputs: [], ...episode }],
    };
  }
  // Card U3: a shot from a script scene, with a new id. Its picture is never taken from the caller: settle and setShot
  // alone put one on a shot (this file's invariant).
  function newShot(s) {
    const n = Math.round(Number(s?.seconds));
    return { id: newId(), text: String(s?.text ?? ""), seconds: Number.isFinite(n) ? Math.min(120, Math.max(1, n)) : 5, line: String(s?.line ?? "") };
  }
  // Card U3: a script's Story Bible cast as project characters. key = the Bible character id a shot's `character` names
  // (card U9: kept, so a later 寫回 or 存成核准版本 pairs with the same character); refs only https or same-origin paths.
  const refUrl = (u) => typeof u === "string" && /^(https:\/\/|\/(?!\/))/.test(u);
  function castOf(characters) {
    return (Array.isArray(characters) ? characters.slice(0, 50) : [])
      .filter((c) => typeof c?.name === "string" && c.name.trim())
      .map((c) => ({ id: newId(), ...(typeof c.key === "string" && c.key ? { key: c.key } : {}), name: c.name.trim(), role: String(c.role ?? ""), descr: "", refs: (Array.isArray(c.refs) ? c.refs : []).filter(refUrl).slice(0, 8) }));
  }
  // shots -> episode shots with new ids; a shot naming a cast key (shot.character) is bound to that character.
  const castShots = (shots, characters) => {
    const byKey = new Map((characters || []).filter((c) => c?.key).map((c) => [c.key, c.id]));
    return shots.slice(0, 200).map((s) => ({ ...newShot(s), ...(byKey.has(s?.character) ? { characterIds: [byKey.get(s.character)] } : {}) }));
  };
  // Card U3 「寫回這一集」: the episode's shots become the script's. Old pictures go with their shots; the steps that made
  // them stay (history). Same in-place contract as setShot; false = no such episode. Card U9: the script's cast joins the
  // project (a character already there by its key stays as the project has it) and each shot is bound to the one its
  // scene names; storyBibleSeries is set when the project has none.
  function setShots(projects, { projectId, episodeId, shots, characters, storyBibleSeries }) {
    const project = (projects || []).find((p) => p.id === projectId),
      episode = project?.episodes?.find((e) => e.id === episodeId);
    if (!episode || !Array.isArray(shots)) return false;
    // Two shapes hold a project's items: the top page's store (shared/models.js project: one array, each with `kind` and
    // `references`) and the projects page's ({ character: [...], ... }, refs). A new character is added in the shape found.
    const flat = Array.isArray(project.assets),
      assets = flat ? project.assets : project.assets && typeof project.assets === "object" ? project.assets : (project.assets = { character: [], scene: [], prop: [] }),
      have = flat ? assets.filter((a) => a?.kind === "character") : Array.isArray(assets.character) ? assets.character : (assets.character = []);
    for (const c of castOf(characters))
      if (!c.key || !have.some((h) => h?.key === c.key)) {
        have.push(c);
        if (flat) assets.push({ ...c, kind: "character", references: c.refs });
      }
    episode.shots = castShots(shots, have);
    if (typeof storyBibleSeries === "string" && storyBibleSeries && !project.storyBibleSeries) project.storyBibleSeries = storyBibleSeries;
    return true;
  }

  // Every edit file not yet linked to an episode becomes a project with one episode pointing at it (spec §2 PJ.1
  // "adopt 的輸入輸出形狀"). The rows are only read: the content stays where it is, byte for byte (spec §3.1).
  // Card PJ.5 (spec §3.4): an edit file is adopted once, the first time it is seen unlinked. `known` = the ids ever
  // linked; a file whose episode or project was deleted is in it and stays a plain library file. The returned
  // `known` adds what is linked now and what this run adopted.
  function adopt(projects, editorRows, engineRows, known = []) {
    const now = episodes(projects)
        .map(({ episode }) => episode.edit?.projectId)
        .filter(Boolean),
      seen = new Set(Array.isArray(known) ? known : []),
      linked = new Set([...seen, ...now]);
    // Card PJ.2 (spec §3.2): a step lands on a shot by its id; old shots without one get one here.
    let named = 0;
    const out = projects.map((p) =>
      (p.episodes || []).some((e) => (e.shots || []).some((s) => s && !s.id))
        ? {
            ...p,
            episodes: (p.episodes || []).map((e) => ({
              ...e,
              shots: (e.shots || []).map((s) => (s && !s.id ? (named++, { ...s, id: newId() }) : s)),
            })),
          }
        : p,
    );
    let added = 0,
      skipped = 0;
    const take = (row, engine) => {
      const id = editId(row);
      if (!id) return void skipped++;
      if (linked.has(id)) return;
      linked.add(id);
      out.push(newProject({ id: "project-ed-" + id, title: editTitle(row), ratio: editRatio(row), episode: { id: "ep-ed-" + id, edit: { engine, projectId: id } } }));
      added++;
    };
    for (const row of Array.isArray(editorRows) ? editorRows : [])
      take(row, "workbench-editor");
    // tools.engine.projects also holds EffectCraft compositions; only FilmCraft rows are edit files.
    for (const row of Array.isArray(engineRows) ? engineRows : [])
      if (row?.engine === "filmcraft") take(row, "filmcraft");
    return { projects: out, added, skipped, named, known: [...seen, ...[...linked].filter((id) => !seen.has(id))] };
  }

  // The spine fields of every episode in `next` come from the same episode in `prev`; episodes and projects that
  // `next` dropped stay dropped. An episode new in `next` keeps what it brought.
  function keepSpine(prev, next) {
    const before = new Map(
      episodes(prev).map(({ project, episode }) => [
        project.id + "\u0000" + episode.id,
        episode,
      ]),
    );
    return next.map((p) => ({
      ...p,
      episodes: (p.episodes || []).map((e) => {
        const old = before.get(p.id + "\u0000" + e.id);
        if (!old) return e;
        const copy = { ...e };
        for (const k of SPINE) {
          if (k in old) copy[k] = old[k];
          else delete copy[k];
        }
        // Card PJ.2: a shot's picture is set only by settle, so it too comes from prev (matched by shot id).
        const was = new Map((old.shots || []).filter((s) => s?.id).map((s) => [s.id, s]));
        if (Array.isArray(copy.shots))
          copy.shots = copy.shots.map((s) => {
            const prevShot = s?.id && was.get(s.id);
            if (!prevShot) return s;
            const shot = { ...s };
            for (const k of SHOT_SPINE) {
              if (k in prevShot) shot[k] = prevShot[k];
              else delete shot[k];
            }
            return shot;
          });
        return copy;
      }),
    }));
  }

  const findByEdit = (projects, editProjectId) =>
    (editProjectId &&
      episodes(projects).find(
        ({ episode }) => episode.edit?.projectId === editProjectId,
      )) ||
    null;

  // Spec §6 答 2: which step of an episode each tool's output is (tool ids = TOOLS in scripts/tools-0.js).
  const TOOL_STEP = Object.freeze({
    edit: "edit", "edit-pro": "edit",
    compose: "motion", rig: "motion", "3d": "motion",
    subtitle: "subtitle",
    voice: "sound", music: "sound", sfx: "sound", separate: "sound",
    upscale: "finish", enhance: "finish", watermark: "finish", cta: "finish", privacy: "finish", bookends: "finish",
    region: "retouch", depth: "retouch",
    short: "derive", follow: "derive", breakout: "derive",
  });
  // Same rule as localUrls in backend/main-system.cjs (its LOCAL_URL): every local file url anywhere in a value.
  const LOCAL_URL = /^\/(generated\/[a-f0-9-]+\.[a-z0-9]+|media\/[a-f0-9]{64}\/original\.[a-z0-9]+)$/;
  function localUrls(value, out = new Set()) {
    if (typeof value === "string") {
      if (LOCAL_URL.test(value)) out.add(value);
    } else if (Array.isArray(value)) for (const v of value) localUrls(v, out);
    else if (value && typeof value === "object") for (const v of Object.values(value)) localUrls(v, out);
    return out;
  }

  // What a shot shows = its newest picture. A new still replaces the moving version made from the old one (that version
  // stays in the episode's steps); a new video plays over the still it was made from -- only while that still is the
  // shot's picture (madeFrom = the shot's key the job was sent with): a video of a replaced still stays a step only.
  function land(shot, output, madeFrom) {
    if (!shot) return;
    if (output.kind === "video" && madeFrom != null && shot.image !== madeFrom) return;
    if (output.kind === "image") {
      shot.image = output.url;
      delete shot.video;
    }
    if (output.kind === "video") shot.video = output.url;
  }
  // Card U4: a picture put on a shot without a job (換圖 from the library, 圖庫素材) -- one step without a job (spec §1.2
  // Step.id), landed like a job's. Same in-place contract as settle; false = no such shot.
  function setShot(projects, { projectId, episodeId, shotId, url, assetId = null, kind, tool }) {
    const episode = (projects || []).find((p) => p.id === projectId)?.episodes?.find((e) => e.id === episodeId),
      shot = (episode?.shots || []).find((s) => s?.id === shotId);
    if (!shot || typeof url !== "string" || !url || !["image", "video"].includes(kind)) return false;
    const output = { url, assetId: assetId ?? null, kind };
    episode.steps = [
      ...(episode.steps || []),
      { id: newId(), step: "shot", tool: tool ?? null, jobId: null, from: [], sources: [...localUrls(url)], settings: {}, target: "shot:" + shotId, output, at: new Date().toISOString() },
    ];
    land(shot, output);
    return true;
  }

  // A succeeded job whose input.link names an existing episode becomes one Step of it and lands on its target
  // (spec §2 PJ.2 settle rules 1-6). Changes `projects` in place; true = changed. The same job twice changes nothing,
  // so the job panel and the top page's reconcile may both call it.
  function settle(projects, job) {
    const link = job?.input?.link;
    if (job?.status !== "succeeded" || !job.result?.url || !link) return false;
    const episode = (projects || []).find((p) => p.id === link.projectId)?.episodes?.find((e) => e.id === link.episodeId);
    if (!episode) return false;
    if ((episode.steps || []).some((s) => s.jobId === job.id)) return false;
    const { project: _whole, ...settings } = job.input.settings || {};
    // kind = VideoWorkbench.jobAsset's kind (shared/runtime.js jobAsset), so the step and the asset agree.
    const output = { url: job.result.url, assetId: "job-" + job.id, kind: job.result.kind || job.type },
      target = link.target ?? null,
      from = Array.isArray(link.from) ? link.from : [],
      at = new Date().toISOString();
    episode.steps = [
      ...(episode.steps || []),
      { id: job.id, step: link.step ?? TOOL_STEP[link.tool] ?? null, tool: link.tool ?? null, jobId: job.id, from, sources: [...localUrls(job.input)], settings, target, output, at },
    ];
    if (typeof target === "string" && target.startsWith("shot:")) land((episode.shots || []).find((s) => s?.id === target.slice(5)), output, from.find((f) => f.slot === target)?.key);
    else if (target === "output")
      // derivedFrom = the cut it was made from (its "export" source, spec §1.3 example); an export from the edit has none.
      episode.outputs = [
        ...(episode.outputs || []),
        { url: output.url, assetId: output.assetId, jobId: job.id, editRevision: job.input.settings?.projectRevision ?? null, derivedFrom: from.find((f) => f.slot === "export")?.key ?? null, at },
      ];
    return true;
  }

  // Plan U5 快速輸出 (step 9): what the render service gets from an episode -- per shot its clip or picture and its
  // line -- and one job per chosen ratio (plan D5). The cut remembers the shot pictures it was made from (lineage).
  // choice = { ratios: ["16:9" | "9:16" | "4:5"], tts?, until?: "video" | "drafts", embedSiteId?, bookends?: { [ratio]:
  // { intro, outro, transition, transitionSeconds } } } (backend/quick-render.cjs request). A bookend part is
  // { kind: "title", title, seconds } or { kind: "template", url } (the finished remotion-template video of that ratio).
  const QUICK_RATIOS = ["16:9", "9:16", "4:5"];
  const quickScenes = (episode) => (episode?.shots || []).map((s) => ({ narration: String(s?.line ?? "").trim(), url: s?.video || s?.image || "" }));
  function quickRenderJobs(project, episode, choice) {
    const scenes = quickScenes(episode),
      from = (episode.shots || []).filter((s) => s?.id && (s.video || s.image)).map((s) => ({ slot: "shot:" + s.id, key: s.video || s.image }));
    return QUICK_RATIOS.filter((ratio) => (choice.ratios || []).includes(ratio)).map((ratio) => {
      const b = choice.bookends?.[ratio],
        ends = b ? ["intro", "outro"].filter((k) => b[k]?.kind === "template").map((k) => ({ slot: k, key: b[k].url })) : [];
      return {
        type: "video",
        operation: "quick-render",
        prompt: "快速輸出 " + ratio,
        settings: {
          ratio, title: project.title, scenes, ...(choice.tts ? { tts: choice.tts } : {}), ...(b && (b.intro || b.outro) ? { bookends: b } : {}),
          until: choice.until === "drafts" ? "drafts" : "video", ...(choice.until === "drafts" && choice.embedSiteId ? { embedSiteId: choice.embedSiteId } : {}),
        },
        link: { projectId: project.id, episodeId: episode.id, tool: "quick-render", step: "export", target: "output", from: [...from, ...ends] },
      };
    });
  }

  // ── Plan U5.3 / U5.4: the episode's intro and outro (§9: one setting, read by 快速輸出, 一鍵成片 and the editor) ──
  // EpisodeBookend = { kind: "none"|"title"|"template", templateId?, fields?, references?, seconds, transition:
  // "none"|"crossfade"|"fade-black", transitionSeconds }. Absent = kind "none". templates = capabilities.remotionTemplates.
  const TRANSITIONS = ["none", "crossfade", "fade-black"],
    TEMPLATE_RATIOS = ["16:9", "9:16", "4:5", "1:1"]; // backend/remotion.cjs formats; a template may list fewer (t.ratios)
  const bookendOn = (b) => b?.kind === "title" || b?.kind === "template";
  // A valid bookend or null (= refused). templates may be omitted (top page without capabilities): then the id is only
  // checked for shape, and the template's own checks run when its job is sent.
  function normalizeBookend(v, templates) {
    if (v == null || v.kind === "none") return null;
    const transition = TRANSITIONS.includes(v.transition) ? v.transition : "crossfade",
      ts = v.transitionSeconds === undefined ? 0.5 : Number(v.transitionSeconds),
      base = { transition, transitionSeconds: ts };
    if (!(ts >= 0.2 && ts <= 2)) return null;
    const strings = (o) => Object.fromEntries(Object.entries(o && typeof o === "object" ? o : {}).filter(([k, x]) => /^[A-Za-z0-9]{1,40}$/.test(k) && typeof x === "string").map(([k, x]) => [k, x.slice(0, 200)]));
    if (v.kind === "title") {
      const title = String(v.fields?.title ?? "").trim(), seconds = Number(v.seconds ?? 3);
      if (!title || title.length > 80 || !(seconds > 0 && seconds <= 15)) return null;
      return { kind: "title", fields: { title }, seconds, ...base };
    }
    if (v.kind !== "template" || typeof v.templateId !== "string") return null;
    const t = Array.isArray(templates) ? templates.find((x) => x.id === v.templateId) : { seconds: { min: 1, def: 5, max: 30 } };
    if (!t) return null;
    const seconds = v.seconds === undefined ? t.seconds.def : Number(v.seconds);
    if (!Number.isInteger(seconds) || seconds < t.seconds.min || seconds > t.seconds.max) return null;
    const refs = Object.fromEntries(Object.entries(v.references && typeof v.references === "object" ? v.references : {})
      .filter(([k, r]) => /^[A-Za-z0-9]{1,40}$/.test(k) && typeof r?.url === "string" && r.url)
      .map(([k, r]) => [k, { url: r.url, ...(typeof r.id === "string" ? { id: r.id } : {}) }]));
    return { kind: "template", templateId: v.templateId, fields: strings(v.fields), references: refs, seconds, ...base };
  }
  // Card U5.3: the episode's bookends, set by the top page only. Same in-place contract as setShot; false = no such
  // episode or an invalid bookend. intro/outro undefined = left as it is; null or kind "none" = removed.
  function setBookends(projects, { projectId, episodeId, intro, outro }, templates) {
    const episode = (projects || []).find((p) => p.id === projectId)?.episodes?.find((e) => e.id === episodeId);
    if (!episode) return false;
    const next = {};
    for (const [k, v] of [["intro", intro], ["outro", outro]]) {
      if (v === undefined) continue;
      const b = normalizeBookend(v, templates);
      if (v && v.kind !== "none" && !b) return false;
      next[k] = b;
    }
    for (const [k, b] of Object.entries(next)) b ? (episode[k] = b) : delete episode[k];
    return true;
  }
  // What a template bookend renders for one ratio: the remotion-template job input (scripts/editor-panes/text.js
  // title-generate shape). Fields left empty are filled from the episode: the first text field = the project title,
  // later ones = the shots' lines; image fields = the shots' pictures in order. { input } or { problem }.
  function bookendJob(project, episode, which, ratio, templates) {
    const b = episode?.[which];
    if (b?.kind !== "template") return null;
    const t = (templates || []).find((x) => x.id === b.templateId);
    if (!t) return { problem: "片頭模板「" + b.templateId + "」已不存在" };
    if (!(t.ratios || TEMPLATE_RATIOS).includes(ratio)) return { problem: (which === "intro" ? "片頭" : "片尾") + "模板「" + t.label + "」不支援 " + ratio + "，請改選標題卡" };
    const lines = (episode.shots || []).map((s) => String(s?.line ?? "").trim()).filter(Boolean),
      pictures = (episode.shots || []).filter((s) => s?.image).map((s) => s.image),
      fields = {}, references = {};
    let text = 0, image = 0;
    for (const f of t.fields) {
      if (f.type === "image" || f.type === "audio") {
        const r = b.references?.[f.key] || (f.type === "image" && f.required ? (pictures[image++] ? { url: pictures[image - 1] } : null) : null);
        if (r) references[f.key] = r;
        else if (f.required) return { problem: (which === "intro" ? "片頭" : "片尾") + "模板「" + t.label + "」需要更多鏡頭畫面" };
        continue;
      }
      const given = String(b.fields?.[f.key] ?? "").trim(),
        auto = !f.type || f.type === "text" ? (text++ === 0 ? project.title : lines[text - 2] || project.title) : "";
      const value = (given || (f.required ? auto : "")).slice(0, f.max || 200);
      if (value) fields[f.key] = value;
    }
    return {
      input: {
        type: "video", operation: "remotion-template", prompt: t.label,
        settings: { templateId: t.id, fields, seconds: b.seconds, ratio, fps: 30 },
        references,
        link: { projectId: project.id, episodeId: episode.id, tool: "remotion", step: "motion", target: which },
      },
    };
  }
  // One bookend is rendered once (§9): the same template, fields, pictures, seconds and ratio = the same video, reused.
  const bookendKey = (input) => JSON.stringify([input?.settings?.templateId, input?.settings?.fields, Object.entries(input?.references || {}).map(([k, r]) => [k, r?.url]).sort(), input?.settings?.seconds, input?.settings?.ratio]);
  // The newest job of that key: { state: "none" | "running" | "done" | "failed", url?, error? }.
  function bookendState(jobs, input) {
    const key = bookendKey(input),
      job = (jobs || []).filter((j) => j?.input?.operation === "remotion-template" && bookendKey(j.input) === key).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))).at(-1);
    if (!job) return { state: "none" };
    // done = registered on the main system too (result.assetId): 快速輸出 sends asset ids only (backend/quick-render.cjs).
    if (job.status === "succeeded" && job.result?.url && job.result.assetId) return { state: "done", url: job.result.url };
    if (["failed", "cancelled", "blocked"].includes(job.status)) return { state: "failed", error: job.error?.message || job.error || "片頭模板渲染失敗", jobId: job.id };
    return { state: "running" };
  }

  // ── Plan U5.3 一鍵成片 / §12: one runner, one stop point ──
  // EpisodeAutoRun = { until: "script"|"video"|"drafts", budgetTwd, fill: "ai"|"stock-video"|"stock-photo", ratios,
  // tts, embedSiteId, prices: { perPictureTwd, perRatioTwd } (the server's quote at start), status: "running"|"stopped"|
  // "done", stop: { step, reason, jobId, detail } | null, spentTwd, startedAt, jobIds }. A writer sends the first seven; the rest are the
  // runtime's. jobIds = the jobs this run sent (not a time window: a job's createdAt is the server's clock).
  const UNTIL = ["script", "video", "drafts"], FILL = ["ai", "stock-video", "stock-photo"];
  const AUTO_RUN_STEP = { fill: "補畫面", intro: "片頭", outro: "片尾", render: "輸出", drafts: "草稿" };
  // The one stop sentence for a step that failed: what stopped and what to do. Raw output (job.error such as an ffmpeg
  // tail, the server's last_error, a TypeError, a 5xx) is never the sentence: it stays with the job (檢視任務, jobId)
  // and in detail. An Error written for people (our own throw, a 4xx such as 點數不足) is the sentence's middle part.
  function autoRunFailure(step, { ratio, shot } = {}, error, jobId) {
    const label = AUTO_RUN_STEP[step] || "這一步", end = step === "intro" || step === "outro",
      what = shot ? "第 " + shot + " 個鏡頭的畫面" : (ratio ? ratio + " 的" : "") + label,
      retry = end ? "按「重試" + label + "」再做一次，或「不加" + label + "先出片」" : "按「從這裡繼續」再試一次",
      said = typeof error === "object" && error?.name === "Error" && !(error.status >= 500) && String(error.message || "").trim(); // not instanceof: an Error may come from another frame
    jobId = typeof jobId === "string" && jobId ? jobId : null;
    if (said) return { step, jobId, reason: (what + "沒有完成：" + said.slice(0, 200)).replace(/[。.]?$/, "。") + "處理好之後" + retry + "。", detail: "" };
    return {
      step, jobId,
      reason: what + "沒有完成。" + retry + "；再不行請聯絡客服，並附上" + (jobId ? "「檢視任務」裡" : "下方") + "的錯誤原文。",
      detail: String((typeof error === "object" && error ? error.message : error) ?? "").slice(0, 2000),
    };
  }
  // A saved stop as the page shows it. Stops written before they carried detail held a job's raw error in the reason in
  // exactly these three forms (old autoRunNext): they read as the sentence above, the error moved to detail. Any other
  // old reason (a caught error, the drafts error) cannot be told from a sentence and shows as it was saved.
  function readStop(stop) {
    if (!stop || typeof stop.reason !== "string") return null;
    const step = String(stop.step || "");
    if (typeof stop.detail === "string")
      return { step, reason: stop.reason.slice(0, 500), jobId: typeof stop.jobId === "string" && /^[\w-]{1,80}$/.test(stop.jobId) ? stop.jobId : null, detail: stop.detail.slice(0, 2000) };
    let m;
    if (step === "render" && (m = /^(\S+) 輸出失敗：([\s\S]*)$/.exec(stop.reason))) return autoRunFailure(step, { ratio: m[1] }, m[2]);
    if ((step === "intro" || step === "outro") && (m = /^(?:片頭|片尾)失敗：([\s\S]*)$/.exec(stop.reason))) return autoRunFailure(step, {}, m[1]);
    if (step === "fill" && (m = /^第 (\d+) 個鏡頭的畫面沒做成：([\s\S]*)$/.exec(stop.reason))) return autoRunFailure(step, { shot: Number(m[1]) }, m[2]);
    return { step, reason: stop.reason.slice(0, 500), jobId: null, detail: "" };
  }
  function normalizeAutoRun(v, now = new Date().toISOString()) {
    if (v == null) return null;
    const ratios = QUICK_RATIOS.filter((r) => (v.ratios || []).includes(r)),
      budgetTwd = Number(v.budgetTwd), spentTwd = v.spentTwd === undefined ? 0 : Number(v.spentTwd),
      price = (n) => (Number.isFinite(Number(n)) && Number(n) >= 0 ? Number(n) : null),
      prices = { perPictureTwd: price(v.prices?.perPictureTwd), perRatioTwd: price(v.prices?.perRatioTwd),
        byShotTwd: Object.fromEntries(Object.entries(v.prices?.byShotTwd || {}).filter(([, n]) => price(n) !== null).map(([id, n]) => [id, price(n)])) };
    if (!UNTIL.includes(v.until) || !FILL.includes(v.fill) || !Number.isFinite(budgetTwd) || !(budgetTwd >= 0) || !Number.isFinite(spentTwd) || !(spentTwd >= 0)) return null;
    if (v.until !== "script" && (!ratios.length || prices.perPictureTwd === null || prices.perRatioTwd === null)) return null;
    const tts = v.tts && typeof v.tts === "object" && ["edge", "openai"].includes(v.tts.provider) && typeof v.tts.voice === "string" ? { provider: v.tts.provider, voice: v.tts.voice } : null;
    return {
      runId: typeof v.runId === "string" && /^[A-Za-z0-9-]{1,64}$/.test(v.runId) ? v.runId : newId(),
      attempt: Number.isSafeInteger(v.attempt) && v.attempt >= 0 ? v.attempt : 0,
      until: v.until, budgetTwd, fill: v.fill, ratios, tts,
      embedSiteId: v.until === "drafts" && typeof v.embedSiteId === "string" && v.embedSiteId ? v.embedSiteId : null,
      prices, status: ["running", "stopped", "done"].includes(v.status) ? v.status : "running",
      stop: readStop(v.stop),
      spentTwd, startedAt: typeof v.startedAt === "string" ? v.startedAt : now,
      baseSpentTwd: Number.isFinite(v.baseSpentTwd) && v.baseSpentTwd >= 0 ? v.baseSpentTwd : 0,
      jobIds: (Array.isArray(v.jobIds) ? v.jobIds : []).filter((x) => typeof x === "string").slice(-300),
    };
  }
  // spine-set-auto-run: autoRun null = removed. False = no such episode or an invalid run.
  function setAutoRun(projects, { projectId, episodeId, autoRun }) {
    const episode = (projects || []).find((p) => p.id === projectId)?.episodes?.find((e) => e.id === episodeId);
    if (!episode) return false;
    if (autoRun == null) return delete episode.autoRun, true;
    const run = normalizeAutoRun(autoRun);
    if (!run) return false;
    episode.autoRun = run;
    return true;
  }
  // The runner's next move for a running episode (pure; the projects page does it, then asks again). One of:
  // null (nothing running) | { do: "wait" } | { do: "stop", step, reason } | { do: "done" } |
  // { do: "fill", shotIds, costTwd } | { do: "bookend", which, ratio, input } | { do: "render", ratios, costTwd, bookends }.
  // Never a publish: the furthest a run goes is a quick render whose until is "video" or "drafts" (§12: a pressed
  // button ends at drafts; outward publishing is only the topic queue).
  function autoRunNext(project, episode, jobs, templates) {
    const run = episode?.autoRun;
    if (!run || run.status !== "running") return null;
    if (run.until === "script") return { do: "done" };
    if (run.spentTwd > run.budgetTwd + 1e-9) return { do: "stop", step: "fill", reason: "實際花費已到上限 NT$" + run.budgetTwd };
    const ids = new Set(run.jobIds || []),
      mine = (jobs || []).filter((j) => ids.has(j?.id) || (run.runId && j?.input?.runId === run.runId))
        .filter((j) => !["failed", "cancelled", "blocked"].includes(j.status) || !Number.isInteger(j.input?.runAttempt) || j.input.runAttempt === run.attempt)
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))),
      over = (cost, step) => (run.spentTwd + cost > run.budgetTwd + 1e-9 ? { do: "stop", step, reason: "已到上限 NT$" + run.budgetTwd + "，下一步要 NT$" + Math.round(cost * 100) / 100 } : null);
    const shots = episode.shots || [];
    if (!shots.length) return { do: "stop", step: "fill", reason: "這一集還沒有鏡頭" };
    const unlined = shots.findIndex((s) => !String(s?.line ?? "").trim());
    if (unlined >= 0) return { do: "stop", step: "render", reason: "第 " + (unlined + 1) + " 個鏡頭沒有旁白" };
    // 1. Missing pictures. A shot that has one is never made again; a job already sent for a shot is waited for.
    const missing = shots.filter((s) => !s?.image && !s?.video), wait = [], todo = [];
    for (const s of missing) {
      const j = mine.filter((x) => x.input?.link?.target === "shot:" + s.id).at(-1);
      if (!j) todo.push(s);
      else if (["failed", "cancelled", "blocked"].includes(j.status)) return { do: "stop", ...autoRunFailure("fill", { shot: shots.indexOf(s) + 1 }, j.error || j.status, j.id) };
      else wait.push(s);
    }
    if (todo.length) {
      if (run.fill === "ai" && todo.some((s) => !String(s.text ?? "").trim())) return { do: "stop", step: "fill", reason: "缺畫面的鏡頭要有畫面描述才能 AI 生圖" };
      const cost = run.fill === "ai" ? todo.reduce((sum, s) => sum + (run.prices.byShotTwd?.[s.id] ?? run.prices.perPictureTwd), 0) : 0;
      return over(cost, "fill") || { do: "fill", shotIds: todo.map((s) => s.id), costTwd: cost };
    }
    if (wait.length) return { do: "wait" };
    // 2. Template bookends, one per ratio, each rendered once (reused when one with the same key exists).
    const bookends = {};
    for (const ratio of run.ratios) {
      const b = { transition: (episode.intro || episode.outro)?.transition || "none", transitionSeconds: (episode.intro || episode.outro)?.transitionSeconds || 0.5 };
      for (const which of ["intro", "outro"]) {
        const end = episode[which];
        if (!bookendOn(end)) continue;
        if (end.kind === "title") { b[which] = { kind: "title", title: end.fields.title, seconds: end.seconds }; continue; }
        const job = bookendJob(project, episode, which, ratio, templates);
        if (job.problem) return { do: "stop", step: which, reason: job.problem };
        const st = bookendState(jobs, job.input);
        if (st.state === "none") return { do: "bookend", which, ratio, input: job.input };
        if (st.state === "running") return { do: "wait" };
        if (st.state === "failed") return { do: "stop", ...autoRunFailure(which, { ratio }, st.error, st.jobId) };
        b[which] = { kind: "template", url: st.url };
      }
      if (b.intro || b.outro) bookends[ratio] = b;
    }
    // 3. The quick renders not sent yet in this run (a ratio already sent is never sent twice; its newest job failing
    // stops the run there).
    const sent = new Map();
    // B26 從這裡繼續: a render finished in an EARLIER attempt (a resume bumps run.attempt) from shot pictures that have since
    // been swapped is not "sent": the resume renders again, then goes on to drafts. A render of this attempt never is
    // (its idempotency key is the same, so a repeat would only return the same job).
    for (const j of mine)
      if (j.input?.operation === "quick-render" && !(j.status === "succeeded" && (j.input.runAttempt ?? 0) < (run.attempt || 0) && shotsSwapped(episode, j.input.link?.from)))
        sent.set(j.input.settings?.ratio, j);
    for (const [ratio, j] of sent)
      if (["failed", "cancelled", "blocked"].includes(j.status)) return { do: "stop", ...autoRunFailure("render", { ratio }, j.error || j.status, j.id) };
    const left = run.ratios.filter((r) => !sent.has(r));
    if (!left.length) {
      if ([...sent.values()].some((j) => j.status !== "succeeded")) return { do: "wait" };
      return { do: run.until === "drafts" ? "drafts" : "done" };
    }
    const cost = run.prices.perRatioTwd * left.length;
    return over(cost, "render") || { do: "render", ratios: left, costTwd: cost, bookends };
  }

  // Card PJ.4 (spec §4): the one staleness rule of the workbench. A key recorded when something was made against a
  // place's key now; an unknown key now (place gone, engine without revisions) is never stale.
  const isStale = (recordedKey, currentKey) => currentKey != null && recordedKey !== currentKey;
  // B26: did any shot picture a render was made from (link.from, slot "shot:<id>", key = the picture/clip url) change since?
  // outputStale does not see this: a quick-render cut has no editRevision.
  const shotsSwapped = (episode, from) =>
    (Array.isArray(from) ? from : []).some((f) => typeof f?.slot === "string" && f.slot.startsWith("shot:") && isStale(f.key, current(episode, f.slot)));
  // The newest cut was made from shot pictures that are not the shots' pictures now (the stop panel says it will be re-rendered).
  function cutOutdated(episode) {
    const cut = (episode?.outputs || []).findLast((o) => o.derivedFrom == null),
      step = cut && (episode.steps || []).find((s) => s.jobId === cut.jobId);
    return !!step && shotsSwapped(episode, step.from);
  }
  const editRow = (episode, editRows) =>
    (episode?.edit && (Array.isArray(editRows) ? editRows : []).find((r) => editId(r) === episode.edit.projectId)) || null;
  // The key a place has now (spec §2 PJ.4 table). A line is trimmed: the editor voices and subtitles the trimmed line.
  function current(episode, slot, editRows) {
    if (typeof slot !== "string") return null;
    const shot = (id) => (episode?.shots || []).find((s) => s?.id === id);
    if (slot.startsWith("shot:")) {
      const s = shot(slot.slice(5));
      return s?.video || s?.image || null;
    }
    if (slot.startsWith("line:")) {
      const s = shot(slot.slice(5));
      return s?.line == null ? null : String(s.line).trim();
    }
    if (slot === "edit") {
      // A FilmCraft row has no revision (spec §8 C4); a bare pre-M3 row is revision 0 (ProjectEnvelope.unwrap).
      const row = episode?.edit?.engine === "workbench-editor" ? editRow(episode, editRows) : null;
      return row ? "rev:" + (own(row) && Number.isInteger(row.revision) ? row.revision : 0) : null;
    }
    if (slot === "export") return (episode?.outputs || []).findLast((o) => o.derivedFrom == null)?.url ?? null;
    return null;
  }
  // What an episode clip in the edit file was made from: a shot clip its picture, a subtitle its text, a voice-over the
  // line its job was sent with. A clip the user added has no slot and is never stale.
  function staleClip(episode, clip) {
    const slot = clip?.slot;
    if (typeof slot !== "string") return false;
    const key = slot.startsWith("shot:")
      ? clip.asset?.url
      : clip.kind === "text"
        ? clip.text
        : (episode?.steps || []).find((s) => s.jobId === clip.jobId)?.from?.[0]?.key;
    return key != null && isStale(key, current(episode, slot));
  }
  const toolOf = (episode, o) => (episode?.steps || []).find((s) => s.jobId === o.jobId)?.tool ?? null;
  // A cut (no derivedFrom) is stale when its edit file changed since; only the newest cut counts -- an older one is
  // history, not work to redo. A version made from a cut (step 10, derive) is stale when the newest cut is another
  // one and the same tool has not been run on the newest cut yet.
  function outputStale(episode, o, editRows) {
    const cut = current(episode, "export");
    if (o?.derivedFrom == null)
      return !!o && o.url === cut && o.editRevision != null && isStale("rev:" + o.editRevision, current(episode, "edit", editRows));
    const tool = toolOf(episode, o);
    return isStale(o.derivedFrom, cut) && !(episode.outputs || []).some((x) => x.derivedFrom === cut && toolOf(episode, x) === tool);
  }
  // "這支成片是怎麼做的": from the step that made outputUrl, back through every key and source url it used to the
  // steps that made them; one row per step of spec §6 (two shots = one row), newest step first.
  const STEP_NO = { shot: 3, retouch: 4, motion: 5, edit: 6, sound: 7, subtitle: 8, export: 9, finish: 10 };
  function lineage(episode, outputUrl) {
    const steps = episode?.steps || [],
      made = (url) => steps.findLast((s) => s.output?.url === url),
      seen = new Map();
    for (let todo = [made(outputUrl)]; todo.length; ) {
      const s = todo.shift();
      if (!s || seen.has(s.id)) continue;
      seen.set(s.id, s);
      for (const url of [...(s.from || []).map((f) => f.key), ...(s.sources || [])]) todo.push(made(url));
    }
    const rows = new Map();
    for (const s of seen.values()) {
      const row = rows.get(s.step) || { step: s.step, n: STEP_NO[s.step] ?? null, tools: [], at: s.at, outputs: [] };
      if (!row.tools.includes(s.tool)) row.tools.push(s.tool);
      if (s.at > row.at) row.at = s.at;
      if (s.output) row.outputs.push(s.output);
      rows.set(s.step, row);
    }
    // A step outside the 11 (derive) is the last thing done to a cut, so it comes first.
    return [...rows.values()].sort((a, b) => (b.n ?? 99) - (a.n ?? 99));
  }

  // The 12 steps of spec §6 (plan U6 splits the last, 送審, into 審片 and 發布), each "todo" | "done" | "optional" | "stale". Read from what the episode has, so an episode
  // without steps/outputs (spec §3.2) shows what its shots and edit file imply.
  function stepStates(episode, editRows, review) {
    const shots = episode?.shots || [],
      steps = episode?.steps || [],
      outputs = episode?.outputs || [],
      made = (name) => steps.some((s) => s.step === name),
      row = editRow(episode, editRows),
      // The edit file's clips: an editor envelope keeps them in native, a bare pre-M3 row is the project itself; a
      // FilmCraft row's clips are the engine's own (spec §8 C4: no clip-level staleness there).
      clips = episode?.edit?.engine === "workbench-editor" && row ? ((own(row) ? row.native : row)?.clips ?? []) : [],
      staleIn = (test) => clips.some((c) => test(c) && staleClip(episode, c)),
      // A line is voiced again by a newer step for it, so only each line's newest voice-over counts.
      voices = new Map(steps.filter((s) => s.step === "sound" && String(s.target).startsWith("line:")).map((s) => [s.target, s])),
      voiceStale = [...voices.values()].some((s) => s.from?.[0] && isStale(s.from[0].key, current(episode, s.target))),
      or = (state, stale) => (stale && state === "done" ? "stale" : state),
      // 快速輸出 (backend/quick-render.cjs) voices and subtitles on the server and never goes through an edit file, so for a
      // cut made that way, with no edit file, 剪輯/聲音/字幕 are not undone work. Only "todo" turns optional; a step really made stays "done".
      // Only the newest cut counts (same as outputStale): an older quick render is history once a later cut came from elsewhere.
      newestCut = outputs.findLast((o) => o.derivedFrom == null),
      viaQuick = !row && !!newestCut && toolOf(episode, newestCut) === "quick-render",
      skip = (state) => (viaQuick && state === "todo" ? "optional" : state);
    return [
      "done",
      shots.length ? "done" : "todo",
      shots.length && shots.every((s) => s?.image || s?.video) ? "done" : "todo",
      made("retouch") ? "done" : "optional",
      "optional", // spec §8 C6: a motion piece reaches the episode through 放到剪輯, never as a job of it
      skip(or(row ? "done" : "todo", staleIn((c) => String(c.slot).startsWith("shot:")))),
      skip(or(made("sound") ? "done" : "todo", voiceStale || staleIn((c) => c.kind === "audio"))),
      skip(or(made("subtitle") || clips.some((c) => c.kind === "text" && c.slot) ? "done" : "todo", staleIn((c) => c.kind === "text"))),
      or(outputs.length ? "done" : "todo", outputs.some((o) => o.derivedFrom == null && outputStale(episode, o, editRows))),
      or(made("finish") ? "done" : "optional", outputs.some((o) => TOOL_STEP[toolOf(episode, o)] === "finish" && outputStale(episode, o, editRows))),
      // 審片 and 發布 are decided on the main system (plan U6); the page reads them (scripts/projects-0.js reviewStates)
      // and shows them in place of these. Until it has, a cut that exists is not known to be reviewed.
      outputs.length ? (arguments.length < 3 ? "todo" : review ? review.reviewed ? "done" : "todo" : "unknown") : "optional",
      outputs.length ? (arguments.length < 3 ? "todo" : review ? review.drafted ? "done" : "todo" : "unknown") : "optional",
    ];
  }
  // U6.4: every surface consumes this exact result from the shared step states. No local workflow judgments.
  function nextAction(states) {
    if (!Array.isArray(states) || states.length !== 12) return null;
    if ([1, 2, 8].some((i) => !["done", "todo", "stale"].includes(states[i]))) return null;
    if (states[1] !== "done") return { key: "script", label: "寫腳本", target: "script" };
    if (states[2] !== "done" || states[8] !== "done") return { key: "video", label: "一鍵成片", target: "video" };
    if ([states[10], states[11]].some((s) => !["done", "todo"].includes(s))) return null;
    if (states[10] !== "done") return { key: "review", label: "審片", target: "qa" };
    if (states[11] !== "done") return { key: "release", label: "發布", target: "release" };
    return { key: "done", label: "完成", target: "done" };
  }

  const api = { editId, editTitle, newProject, newShot, castOf, castShots, setShots, adopt, keepSpine, findByEdit, TOOL_STEP, settle, setShot, QUICK_RATIOS, quickScenes, quickRenderJobs,
    TRANSITIONS, TEMPLATE_RATIOS, normalizeBookend, setBookends, bookendJob, bookendKey, bookendState, AUTO_RUN_STEP, autoRunFailure, readStop, normalizeAutoRun, setAutoRun, autoRunNext, current, isStale, shotsSwapped, cutOutdated, staleClip, outputStale, lineage, stepStates, nextAction };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.EpisodeSpine = api;
})(typeof globalThis === "object" ? globalThis : this);
