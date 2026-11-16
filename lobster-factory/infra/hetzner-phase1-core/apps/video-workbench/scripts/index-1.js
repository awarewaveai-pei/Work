(function () {
  const names = [
      "generator",
      "director",
      "tools",
      "characters",
      "templates",
      "projects",
      "storyboards",
      "workflows",
      "skills",
      "assets",
      "history",
      "works",
      "review-release",
      "script-forge",
    ];
  // Pages shown in a frame: name -> source. pages/*.html are the workbench's own; /works, /script-forge and
  // /review-release are next-admin's app/video/(wb) pages, same host (nginx sends every non-workbench path there), which
  // run this runtime as a child page and, opened on their own, come back here as /?open=<name>. review-release (plan U6)
  // has no sidebar entry: it opens from a finished video with the page's query. 腳本 (plan U3) opens with a query from an
  // episode's step 2 (?project=&episode=) and without one from the sidebar.
  const FRAMES = {
    tools: "pages/tools.html",
    characters: "pages/characters.html",
    templates: "pages/templates.html",
    projects: "pages/projects.html",
    storyboards: "pages/storyboards.html",
    works: "/works",
    "review-release": "/review-release",
    "script-forge": "/script-forge",
  };
  const $ = (id) => document.getElementById(id);
  let active = "generator";
  function activate(name, fromDirector = false, query = "") {
    if (!names.includes(name)) return;
    // Use each overlay's close handler so picker promises and polling settle.
    document.querySelectorAll('body > .asset-workspace [data-picker-close], body > .job-view [data-job-close]').forEach(button => button.click());
    $("modal").classList.add("hidden");
    $("popover").classList.add("hidden");
    document.querySelectorAll('button[data-panel]').forEach(button => button.setAttribute("aria-expanded", "false"));
    window.generatorCloseMentions?.();
    // A frame loads when it is opened with a query (each open of review-release names another video), or when its
    // source changed: first open, or opened plainly after a query (腳本 from the sidebar after an episode).
    const src = FRAMES[name] && FRAMES[name] + (query ? "?" + query : "");
    if (src && (query || $(name + "Frame").getAttribute("src") !== src)) $(name + "Frame").src = src;
    for (const n of names) {
      const el = $(n === "generator" ? "generatorView" : n + "Area");
      if (el) el.hidden = n !== name;
      $(n + "Nav")?.classList.toggle(
        "active",
        (fromDirector ? "director" : name) === n,
      );
    }
    $("workspaceArea").hidden = ![
      "workflows",
      "skills",
      "assets",
      "history",
    ].includes(name);
    for (const n of Object.keys(FRAMES))
      document.body.classList.toggle(n + "-open", name === n);
    if (["workflows", "skills", "assets", "history"].includes(name))
      VideoWorkbench.workspaces.open(name).catch(VideoWorkbench.reportError);
    if (name === "director") renderSessions();
    active = name;
  }
  async function renderSessions() {
    const rows = await VideoWorkbench.preferences.get("director.sessions", []),
      host = $("directorSessions");
    host.replaceChildren();
    if (!rows.length) {
      const p = document.createElement("p");
      p.textContent = "尚無已保存對話。開新對話後可隨時儲存草稿。";
      host.append(p);
      return;
    }
    for (const row of rows) {
      const card = document.createElement("article");
      card.className = "workspace-card";
      const title = document.createElement("h2");
      title.textContent = row.name;
      const open = document.createElement("button");
      open.textContent = "繼續編輯";
      open.onclick = () => {
        VideoWorkbench.generator.setDraft(row.draft);
        activate("generator", true);
      };
      const del = document.createElement("button");
      del.textContent = "刪除";
      del.onclick = async () => {
        if (confirm("刪除此對話草稿？")) {
          await VideoWorkbench.preferences.set(
            "director.sessions",
            rows.filter((r) => r.id !== row.id),
          );
          renderSessions();
        }
      };
      card.append(title, open, del);
      host.append(card);
    }
  }
  for (const name of names)
    $(name + "Nav")?.addEventListener("click", () => activate(name));
  document.querySelectorAll(".aw-director-start").forEach((b) =>
    b.addEventListener("click", () => {
      activate("generator", true);
      document.querySelector("#generatorView [data-mode=director]")?.click();
      VideoWorkbench.generator.newDirectorConversation();
    }),
  );
  $("saveGeneratorDraft").onclick = async () => {
    try {
      const draft = VideoWorkbench.generator.getDraft(),
        name = prompt(
          "草稿名稱",
          draft.data[draft.mode]?.slice?.(0, 30) || "新的影片想法",
        );
      if (!name?.trim()) return;
      const rows = await VideoWorkbench.preferences.get("director.sessions", []);
      rows.unshift({
        id: crypto.randomUUID(),
        name: name.trim(),
        draft,
        updatedAt: new Date().toISOString(),
      });
      await VideoWorkbench.preferences.set("director.sessions", rows);
      $("draftStatus").textContent = "草稿已儲存，可從 AI 導演繼續編輯。";
    } catch (e) {
      VideoWorkbench.reportError(e);
    }
  };
  // 作品 is the main system's library, and 腳本 writes for the main system's organization: both shown only when this
  // server is connected to it (capabilities.mainSystem).
  // ?open=<name> (a framed page opened on its own is sent back here) opens that page once the check has answered.
  const params = new URLSearchParams(location.search),
    opening = params.get("open");
  params.delete("open");
  VideoWorkbench.loadCapabilities()
    .then((caps) => {
      $("worksNav").hidden = $("script-forgeNav").hidden = !caps?.mainSystem;
      if (names.includes(opening) && !$(opening + "Nav")?.hidden) activate(opening, false, params.toString());
    })
    .catch(VideoWorkbench.reportError);
  VideoWorkbench.router = {
    activate,
    get active() {
      return active;
    },
  };
})();
