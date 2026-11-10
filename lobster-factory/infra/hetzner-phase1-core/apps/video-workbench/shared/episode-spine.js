// Card PJ.1 (docs/pj-project-spine-spec-20261106.md §1.4): one video = one episode of the projects page; the episode
// points at its edit file. Card PJ.2: a finished job linked to an episode becomes one of its steps (settle).
// Pure functions, no DOM. Browser global `EpisodeSpine`; require() in Node.
// Invariant (spec §0): the spine fields of an episode are changed only by the top page's runtime; a child page's
// whole-list write keeps the top page's copy of them (keepSpine), so a stale copy can never overwrite them.
(function (root) {
  const SPINE = ["edit", "steps", "outputs"],
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
      const title = editTitle(row);
      out.push({
        id: "project-ed-" + id,
        title,
        type: "single",
        ratio: editRatio(row),
        style: 8,
        customStyle: "",
        createdAt: Date.now(),
        cover: "",
        assets: [],
        settings: { model: "", lockModel: true, videoPrompt: "" }, // "" = the default video model (shared/models.js get)
        episodes: [
          {
            id: "ep-ed-" + id,
            name: title,
            outline: "",
            shots: [],
            edit: { engine, projectId: id },
            steps: [],
            outputs: [],
          },
        ],
      });
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
    upscale: "finish", enhance: "finish", watermark: "finish", cta: "finish", privacy: "finish",
    region: "retouch", depth: "retouch",
    short: "derive", follow: "derive",
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
    if (typeof target === "string" && target.startsWith("shot:")) {
      const shot = (episode.shots || []).find((s) => s?.id === target.slice(5));
      if (shot && output.kind === "image") shot.image = output.url;
      if (shot && output.kind === "video") shot.video = output.url;
    } else if (target === "output")
      // derivedFrom = the cut it was made from (its "export" source, spec §1.3 example); an export from the edit has none.
      episode.outputs = [
        ...(episode.outputs || []),
        { url: output.url, assetId: output.assetId, jobId: job.id, editRevision: job.input.settings?.projectRevision ?? null, derivedFrom: from.find((f) => f.slot === "export")?.key ?? null, at },
      ];
    return true;
  }

  // Card PJ.4 (spec §4): the one staleness rule of the workbench. A key recorded when something was made against a
  // place's key now; an unknown key now (place gone, engine without revisions) is never stale.
  const isStale = (recordedKey, currentKey) => currentKey != null && recordedKey !== currentKey;
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

  // The 11 steps of spec §6, each "todo" | "done" | "optional" | "stale". Read from what the episode has, so an episode
  // without steps/outputs (spec §3.2) shows what its shots and edit file imply.
  function stepStates(episode, editRows) {
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
      or = (state, stale) => (stale && state === "done" ? "stale" : state);
    return [
      "done",
      shots.length ? "done" : "todo",
      shots.length && shots.every((s) => s?.image || s?.video) ? "done" : "todo",
      made("retouch") ? "done" : "optional",
      "optional", // spec §8 C6: a motion piece reaches the episode through 放到剪輯, never as a job of it
      or(row ? "done" : "todo", staleIn((c) => String(c.slot).startsWith("shot:"))),
      or(made("sound") ? "done" : "todo", voiceStale || staleIn((c) => c.kind === "audio")),
      or(made("subtitle") || clips.some((c) => c.kind === "text" && c.slot) ? "done" : "todo", staleIn((c) => c.kind === "text")),
      or(outputs.length ? "done" : "todo", outputs.some((o) => o.derivedFrom == null && outputStale(episode, o, editRows))),
      or(made("finish") ? "done" : "optional", outputs.some((o) => TOOL_STEP[toolOf(episode, o)] === "finish" && outputStale(episode, o, editRows))),
      "optional", // review is decided on the main system's /release page; this page cannot see the result
    ];
  }

  const api = { editId, editTitle, adopt, keepSpine, findByEdit, TOOL_STEP, settle, current, isStale, staleClip, outputStale, lineage, stepStates };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.EpisodeSpine = api;
})(typeof globalThis === "object" ? globalThis : this);
