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
    ],
    loaded = new Set();
  const $ = (id) => document.getElementById(id);
  let active = "generator";
  function activate(name, fromDirector = false) {
    if (!names.includes(name)) return;
    // Use each overlay's close handler so picker promises and polling settle.
    document.querySelectorAll('body > .asset-workspace [data-picker-close], body > .job-view [data-job-close]').forEach(button => button.click());
    $("modal").classList.add("hidden");
    $("popover").classList.add("hidden");
    document.querySelectorAll('button[data-panel]').forEach(button => button.setAttribute("aria-expanded", "false"));
    window.generatorCloseMentions?.();
    if (
      ["tools", "characters", "templates", "projects", "storyboards"].includes(
        name,
      ) &&
      !loaded.has(name)
    ) {
      $(name + "Frame").src = "pages/" + name + ".html";
      loaded.add(name);
    }
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
    for (const n of [
      "tools",
      "characters",
      "templates",
      "projects",
      "storyboards",
    ])
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
  VideoWorkbench.router = {
    activate,
    get active() {
      return active;
    },
  };
})();
