// Card PJ.1 (docs/pj-project-spine-spec-20261106.md §1.4): one video = one episode of the projects page; the episode
// points at its edit file. Pure functions, no DOM. Browser global `EpisodeSpine`; require() in Node.
// Invariant (spec §0): the spine fields of an episode are changed only by the top page's runtime; a child page's
// whole-list write keeps the top page's copy of them (keepSpine), so a stale copy can never overwrite them.
(function (root) {
  const SPINE = ["edit", "steps", "outputs"];
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
    const out = [...projects];
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
    return { projects: out, added, skipped };
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

  const api = { editId, editTitle, adopt, keepSpine, findByEdit };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.EpisodeSpine = api;
})(typeof globalThis === "object" ? globalThis : this);
