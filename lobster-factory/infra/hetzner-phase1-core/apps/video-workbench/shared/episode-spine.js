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
  function adopt(projects, editorRows, engineRows) {
    const linked = new Set(
      episodes(projects)
        .map(({ episode }) => episode.edit?.projectId)
        .filter(Boolean),
    );
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
        settings: { model: "sora-2", lockModel: true, videoPrompt: "" },
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
    return { projects: out, added, skipped, named };
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

  // The 11 steps of spec §6, each "todo" | "done" | "optional" (PJ.4 adds "stale"). Read from what the episode has,
  // so an episode without steps/outputs (spec §3.2) shows what its shots and edit file imply.
  function stepStates(episode, editRows) {
    const shots = episode?.shots || [],
      made = (name) => (episode?.steps || []).some((s) => s.step === name),
      editFound = !!episode?.edit && (Array.isArray(editRows) ? editRows : []).some((r) => editId(r) === episode.edit.projectId),
      exported = (episode?.outputs || []).length > 0;
    return [
      "done",
      shots.length ? "done" : "todo",
      shots.length && shots.every((s) => s?.image || s?.video) ? "done" : "todo",
      made("retouch") ? "done" : "optional",
      "optional", // spec §8 C6: a motion piece reaches the episode through 放到剪輯, never as a job of it
      editFound ? "done" : "todo",
      made("sound") ? "done" : "todo",
      made("subtitle") ? "done" : "todo",
      exported ? "done" : "todo",
      made("finish") ? "done" : "optional",
      "optional", // review is decided on the main system's /release page; this page cannot see the result
    ];
  }

  const api = { editId, editTitle, adopt, keepSpine, findByEdit, TOOL_STEP, settle, stepStates };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.EpisodeSpine = api;
})(typeof globalThis === "object" ? globalThis : this);
