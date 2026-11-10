(function () {
  "use strict";
  const M = VideoWorkbenchModels,
    child =
      parent !== window &&
      !document.documentElement.hasAttribute("data-vw-root"),
    config = window.VW_CONFIG;
  const adapter =
    config.mode === "http"
      ? new VideoWorkbenchAdapters.HttpAdapter(config)
      : new VideoWorkbenchAdapters.LocalAdapter({ report: (e) => reportError(e) });
  let db = {
    version: 1,
    revision: 0,
    characters: [],
    projects: [],
    assets: [],
    jobs: [],
    compositions: [],
    scenes3d: [],
    preferences: {},
    selection: {},
  };
  // Card P3: compositor documents (shared/compositor.js) are a ledger collection like projects; stored as given.
  // Card P5: 3D scene documents (scripts/tools-3d.js), same rules as compositions.
  const COLLECTIONS = ["characters", "projects", "assets", "compositions", "scenes3d"];
  const composition = (v = {}) => ({ ...structuredClone(v), id: v.id || crypto.randomUUID() });
  let queue = Promise.resolve();
  const pending = new Map();
  const knownSource = (source) =>
    [...document.querySelectorAll("iframe")].some(
      (f) => f.contentWindow === source,
    );
  // The timer only detects a parent that never answers: the parent acks at once, and from then on the work's own
  // deadline (the adapter's fetch timeout) decides. A flat 15 s here failed every video upload (2026-11-06).
  const rpc = (action, payload) =>
    new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error("頁面通訊逾時"));
      }, config.timeoutMs);
      pending.set(id, { resolve, reject, timer });
      parent.postMessage(
        { channel: "vw:v1", id, action, payload },
        location.origin,
      );
    });
  function reportError(error) {
    console.error("[VideoWorkbench]", error);
    let box = document.getElementById("service-error");
    if (!box) {
      box = document.createElement("div");
      box.id = "service-error";
      box.setAttribute("role", "alert");
      box.className = "service-error";
      const close = document.createElement("button");
      close.textContent = "關閉";
      close.onclick = () => box.remove();
      box.append(document.createElement("span"), close);
      document.body.append(box);
    }
    box.firstChild.textContent = error.message || String(error);
  }
  // Pre-M2 data has assets without origin, top-level and inside projects; normalizing adds
  // {kind:"import",legacy:true}. True = something changed.
  function normalizeAssets() {
    const bare = (a) => a && typeof a === "object" && !a.origin,
      missing =
        db.assets.some((a) => !a?.origin) ||
        db.projects.some((p) => Array.isArray(p?.assets) && p.assets.some(bare));
    db.assets = db.assets.map((a) => M.asset(a));
    db.projects = db.projects.map((p) => M.project(p));
    return missing;
  }
  // Card PJ.1: every edit file not yet in an episode becomes a project (spec §3.1); the edit files are only read.
  // Runs on load and on every write of an edit-file store, so a file saved by any engine joins at once.
  // Card PJ.2: the same pass names old shots that have no id (spec §3.2). Returns how much it changed.
  const Spine = window.EpisodeSpine || null,
    EDIT_STORES = ["tools.editor.projects", "tools.engine.projects"];
  function spineAdopt() {
    if (!Spine) return 0;
    // Card PJ.5: the edit files ever linked (EpisodeSpine.adopt `known`); stored only when it grew.
    const known = db.preferences["spine.linkedEdits"],
      r = Spine.adopt(db.projects, db.preferences["tools.editor.projects"], db.preferences["tools.engine.projects"], known);
    db.projects = r.projects.map(M.project);
    const grew = r.known.length !== (Array.isArray(known) ? known.length : 0);
    if (grew) db.preferences["spine.linkedEdits"] = r.known;
    return r.added + r.named + (grew ? 1 : 0);
  }
  async function spineChanged() {
    await persist();
    broadcast();
    document.dispatchEvent(new CustomEvent("vw:changed"));
  }
  // A stored state becomes db (on load, and on a conflict that keeps the page). True = normalizing changed it.
  function adopt(v) {
    if (v.version !== 1) throw new Error("不支援的資料版本");
    db = v;
    if (!Number.isInteger(db.revision)) db.revision = 0;
    if (!Array.isArray(db.compositions)) db.compositions = []; // state saved before card P3
    if (!Array.isArray(db.scenes3d)) db.scenes3d = []; // state saved before card P5
    const normalized = normalizeAssets();
    return spineAdopt() > 0 || normalized;
  }
  const CONFLICT = "vw.conflict-reload";
  function persist() {
    queue = queue
      .catch(() => {})
      .then(async () => {
        try {
          const saved = await adapter.save(structuredClone(db));
          if (Number.isInteger(saved?.revision)) db.revision = saved.revision;
        } catch (e) {
          // Another tab saved first: its state wins, ours is dropped rather than overwriting it. Pages keep
          // private copies (the editor's ed.projects), so reload everything from the server copy instead of
          // patching db: a stale copy saved later would overwrite the other tab (Codex 2026-11-02).
          if (e.status !== 409 || !e.state) throw e;
          adapter.cache?.(e.state);
          // A page whose work lives outside db (the full-page engine tab, scripts/tools-engine-host.js) must not reload:
          // it takes the other tab's state and rejects this write with .conflict; the caller redoes it on the new state.
          if (window.VW_KEEP_PAGE_ON_CONFLICT) {
            adopt(structuredClone(e.state));
            broadcast();
            document.dispatchEvent(new CustomEvent("vw:changed"));
            throw Object.assign(new Error("另一個分頁已更新，已改用最新資料"), { conflict: true });
          }
          try {
            sessionStorage.setItem(CONFLICT, "1");
          } catch {}
          setTimeout(() => location.reload(), 0);
          throw new Error("另一個分頁已更新，已載入最新資料");
        }
      });
    queue.catch(reportError);
    return queue;
  }
  // Saves a change already made to db that can be made again (an upsert or removal by id, a settle). On a page that keeps
  // itself on a conflict (VW_KEEP_PAGE_ON_CONFLICT) db is then the other tab's state: the change is made on it and saved
  // once more instead of being dropped. A whole-value write (preferences) is redone by its caller (read-modify-write).
  async function persistRedo(redo) {
    try {
      await persist();
    } catch (e) {
      if (!e.conflict) throw e;
      redo();
      await persist();
    }
  }
  function read(key) {
    if (key === "vw.characters")
      return db.characters.map(M.legacyCharacter);
    if (key === "awarewave-projects-screenshot-frontend-v1")
      return { projects: db.projects.map(M.legacyProject), ...db.selection };
    return db.preferences[key] ?? null;
  }
  function write(key, value) {
    if (["__proto__", "constructor", "prototype"].includes(key))
      throw new Error("無效的資料鍵");
    if (key === "vw.characters")
      db.characters = [
        ...db.characters.filter(
          (c) =>
            c.id.startsWith("catalog-") && !value.some((v) => v.id === c.id),
        ),
        ...value.map(M.character),
      ];
    else if (key === "awarewave-projects-screenshot-frontend-v1") {
      const next = value.projects.map(M.project);
      // Card PJ.1: a child's whole-list write keeps the top page's spine fields (shared/episode-spine.js). Pages
      // opened on their own without the spine script (characters, storyboards) are their own top page: no stale copy.
      db.projects = child || !Spine ? next : Spine.keepSpine(db.projects, next);
      // `open` = the spine-open counter, changed only here on the top page (scripts/projects-0.js spineSignature).
      db.selection = { current: value.current, episode: value.episode, ...(db.selection?.open ? { open: db.selection.open } : {}) };
    } else db.preferences[key] = value;
  }
  function broadcast() {
    for (const f of document.querySelectorAll("iframe"))
      f.contentWindow?.postMessage(
        { channel: "vw:v1", action: "snapshot", payload: db },
        location.origin,
      );
  }
  async function perform(action, payload) {
    if (action === "load") {
      await ready;
      return db;
    }
    if (action === "entity-save")
      return collection(payload.name).save(payload.value);
    if (action === "entity-remove")
      return collection(payload.name).remove(payload.id);
    if (action === "generator-import")
      return VideoWorkbench.generator.import(payload);
    if (action === "job-get") return VideoWorkbench.generations.get(payload.id);
    if (action === "job-cancel") return VideoWorkbench.generations.cancel(payload.id);
    if (action === "service-request")
      return adapter.request(
        payload.path,
        payload.method || "POST",
        payload.body,
      );
    if (action === "preference-set") {
      write(payload.key, payload.value);
      if (EDIT_STORES.includes(payload.key)) spineAdopt();
      await persist();
      broadcast();
      document.dispatchEvent(new CustomEvent("vw:changed"));
      return payload.value;
    }
    if (action === "write") {
      write(payload.key, payload.value);
      await persist();
      broadcast();
      return db;
    }
    if (action === "generate") return generate(payload);
    if (action === "spine-attach-edit") {
      const hit = db.projects.find((p) => p.id === payload.projectId)?.episodes.find((e) => e.id === payload.episodeId);
      if (!hit) throw new Error("找不到這一集");
      hit.edit = { engine: payload.edit.engine, projectId: payload.edit.projectId };
      await spineChanged();
      return hit.edit;
    }
    // Card PJ.2: a finished job back to its episode (shared/episode-spine.js settle; the same job twice = no change).
    if (action === "spine-settle") {
      if (Spine?.settle(db.projects, payload)) {
        await persistRedo(() => Spine.settle(db.projects, payload));
        broadcast();
        document.dispatchEvent(new CustomEvent("vw:changed"));
      }
      return true;
    }
    if (action === "spine-open") {
      const index = db.projects.find((p) => p.id === payload.projectId)?.episodes.findIndex((e) => e.id === payload.episodeId) ?? -1;
      if (index < 0) throw new Error("找不到這一集");
      db.selection = { current: payload.projectId, episode: index, open: (db.selection?.open || 0) + 1 };
      await spineChanged();
      return perform("navigate", { target: "projects" });
    }
    if (action === "navigate") {
      document.getElementById(payload.target + "Nav")?.click();
      return true;
    }
    throw new Error("未知頁面指令");
  }
  window.addEventListener("message", async (event) => {
    if (
      event.origin !== location.origin ||
      event.data?.channel !== "vw:v1"
    )
      return;
    const m = event.data;
    if (child) {
      if (event.source !== parent) return;
      if (m.action === "snapshot") {
        db = m.payload;
        document.dispatchEvent(new CustomEvent("vw:changed"));
        return;
      }
      const p = pending.get(m.id);
      if (p && m.ack) clearTimeout(p.timer);
      else if (p) {
        clearTimeout(p.timer);
        pending.delete(m.id);
        m.error ? p.reject(new Error(m.error)) : p.resolve(m.payload);
      }
      return;
    }
    if (!knownSource(event.source)) return;
    event.source.postMessage({ channel: "vw:v1", id: m.id, ack: true }, event.origin);
    try {
      const payload = await perform(m.action, m.payload);
      event.source.postMessage(
        { channel: "vw:v1", id: m.id, payload },
        event.origin,
      );
    } catch (e) {
      event.source.postMessage(
        { channel: "vw:v1", id: m.id, error: e.message },
        event.origin,
      );
    }
  });
  async function generate(input) {
    // Card PJ.2: every job gets its episode here, the one entry point (the tools page answers, scripts/tools-0.js).
    if (!input.link && typeof window.VideoWorkbench?.spineLink === "function") {
      const link = window.VideoWorkbench.spineLink(input);
      if (link) input = { ...input, link };
    }
    if (child) return rpc("generate", input);
    const job = {
      id: crypto.randomUUID(),
      type: input.type || "video",
      status: "submitting",
      progress: 0,
      input,
      serverAccepted: false,
      createdAt: new Date().toISOString(),
    };
    db.jobs.push(job);
    try {
      // One key per submission: a resend after a network failure gets the first job back instead of a second
      // provider call (backend/api.cjs POST /generations). Only the local server is known to honour the key.
      const idempotencyKey = crypto.randomUUID(),
        send = () =>
          adapter.request("/generations", "POST", { ...input, idempotencyKey });
      job.idempotencyKey = idempotencyKey;
      let result;
      try {
        result = await send();
      } catch (e) {
        if (config.mode === "http" || e instanceof VideoWorkbenchAdapters.ServiceError)
          throw e;
        result = await send();
      }
      if (
        !result?.id ||
        !["queued", "running", "succeeded", "failed", "cancelled"].includes(
          result.status,
        )
      )
        throw new Error("生成服務回傳格式不正確");
      Object.assign(job, result);
      job.serverAccepted = true;
    } catch (e) {
      // A rejection proves nothing was sent to a provider, so retry is safe. Holds for POST /generations
      // only: the local server answers 202 before touching a provider (backend/api.cjs finish() runs after),
      // so 501 (unsupported) and 503 (no API key) come first. Text routes forward provider codes; do not
      // reuse this list there. 502/504, network errors and malformed 2xx stay "unconfirmed".
      const rejected =
        e instanceof VideoWorkbenchAdapters.ServiceError &&
        [400, 401, 403, 404, 405, 409, 413, 415, 422, 429, 501, 503].includes(
          e.status,
        );
      job.status = rejected ? "blocked" : "submitting";
      job.submissionRejected = rejected;
      job.submissionUnconfirmed = !rejected;
      job.error = rejected
        ? e.message
        : "未收到服務端確認，任務可能已送出；請先確認任務紀錄，避免重複計費。 " +
          e.message;
      await persist().catch(() => {});
      broadcast();
      throw e;
    }
    await persist().catch((e) =>
      reportError(new Error("任務已送出，但本機紀錄保存失敗：" + e.message)),
    );
    broadcast();
    return job;
  }
  // Browser media copy (scripts/media-cache-sw.js): only for the served workbench, where media crosses the network.
  if (!child && config.mode === "http" && window.isSecureContext && "serviceWorker" in navigator)
    navigator.serviceWorker.register("/scripts/media-cache-sw.js", { scope: "/" }).catch(() => {});
  const ready = child
    ? rpc("load").then((v) => {
        db = v;
      })
    : adapter.load().then((v) => {
        if (v && adopt(v)) persist().catch(() => {});
        try {
          if (sessionStorage.getItem(CONFLICT)) {
            sessionStorage.removeItem(CONFLICT);
            reportError(new Error("另一個分頁已更新，已載入最新資料"));
          }
        } catch {}
      });
  // The asset a finished job becomes. Id job-<jobId> keeps VideoWorkbench.showJob and reconcileJobs from doubling it.
  // The result's own media fields win (an alpha MOV keeps its VP9 previewUrl and video/quicktime type).
  const EXT_TYPE = { mov: "video/quicktime", mp4: "video/mp4", webm: "video/webm", glb: "model/gltf-binary", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", mp3: "audio/mpeg", wav: "audio/wav" };
  const jobAsset = (v) => {
    const r = v.result,
      media = {};
    for (const k of ["url", "previewUrl", "thumbUrl", "type", "width", "height", "duration", "frames", "origin"])
      if (r[k] !== undefined && r[k] !== null) media[k] = r[k];
    return {
      id: "job-" + v.id,
      kind: r.kind || v.type,
      name: (v.input?.operation || v.type) + "-" + v.id.slice(0, 8),
      ...media,
      type:
        media.type ||
        EXT_TYPE[/\.([a-z0-9]+)(?:[?#]|$)/i.exec(r.url)?.[1]?.toLowerCase()] ||
        (v.type === "audio" ? "audio/mpeg" : v.type === "image" ? "image/png" : v.type === "model" ? "model/gltf-binary" : "video/mp4"),
    };
  };
  // Paid output must not depend on a job panel staying open (Codex 2026-11-02): on load, every job not known to be
  // finished is asked again; succeeded ones without their asset get it. Still-running ones are re-asked every 5 s
  // until the server's own deadline for that job (job.deadlineAt, backend/api.cjs jobTimeoutMs) -- no client limit.
  // Parent page only (children share its db).
  async function reconcileJobs() {
    const open = db.jobs
      .filter((j) => j?.id && !["failed", "cancelled", "blocked"].includes(j.status) && !db.assets.some((a) => a.id === "job-" + j.id))
      .slice(-50);
    let changed = false,
      running = false;
    const watch = (x) => ["queued", "running"].includes(x?.status) && Date.now() < Date.parse(x.deadlineAt);
    for (const j of open) {
      let v;
      try {
        v = await adapter.request("/generations/" + encodeURIComponent(j.id), "GET");
      } catch {
        continue;
      }
      if (!v || v.status === j.status) {
        running ||= watch(v);
        if (v?.status !== "succeeded") continue;
      }
      Object.assign(j, v);
      changed = true;
      if (v.status === "succeeded" && v.result?.url && !db.assets.some((a) => a.id === "job-" + j.id))
        db.assets.push(M.asset(jobAsset(v)));
      running ||= watch(v);
    }
    // Card PJ.2: every succeeded job linked to an episode lands there (spec §0 F5) -- also one whose asset already
    // exists (the panel saved it, then its own settle failed); the asset is not proof the episode has it.
    for (const j of db.jobs) if (Spine?.settle(db.projects, j)) changed = true;
    if (changed) {
      await persist().catch(reportError);
      broadcast();
      document.dispatchEvent(new CustomEvent("vw:changed"));
    }
    if (running) setTimeout(() => reconcileJobs().catch(reportError), 5000);
  }
  if (!child) ready.then(() => reconcileJobs()).catch(reportError);
  const storage = {
    getItem: (key) => {
      const v = read(key);
      return v === null ? null : JSON.stringify(v);
    },
    setItem: (key, value) => {
      const parsed = JSON.parse(value);
      write(key, parsed);
      if (child) {
        queue = rpc("write", { key, value: parsed })
          .then((v) => {
            db = v;
          })
          .catch(reportError);
      } else {
        persist();
        broadcast();
      }
    },
  };
  const collection = (name) => ({
    remove: async (id) => {
      if (!COLLECTIONS.includes(name))
        throw new Error("未知資源");
      await ready;
      if (child) return rpc("entity-remove", { name, id });
      const drop = () => (db[name] = db[name].filter((x) => x.id !== id));
      drop();
      await persistRedo(drop);
      broadcast();
    },
    list: async () => {
      await ready;
      return structuredClone(db[name] || []);
    },
    save: async (value) => {
      if (!COLLECTIONS.includes(name))
        throw new Error("未知資源");
      await ready;
      if (child) return rpc("entity-save", { name, value });
      const normalize =
        name === "compositions" || name === "scenes3d"
          ? composition
          : M[
              name === "characters"
                ? "character"
                : name === "projects"
                  ? "project"
                  : "asset"
            ];
      const v = normalize(value);
      const put = () => {
        const items = db[name],
          i = items.findIndex((x) => x.id === v.id);
        i < 0 ? items.push(v) : items.splice(i, 1, v);
      };
      put();
      await persistRedo(put);
      broadcast();
      return v;
    },
  });
  // Page boot scripts: all <script> tags go in at once so the downloads overlap (page load = one round trip + the biggest
  // file, not one round trip per file); async = false makes the browser still run them in list order. A failed file rejects.
  function loadScripts(files, base) {
    return Promise.all(
      files.map(
        (file) =>
          new Promise((resolve, reject) => {
            const s = document.createElement("script");
            s.async = false;
            s.src = base + file;
            s.onload = resolve;
            s.onerror = () => reject(Error("無法載入 " + file));
            document.body.append(s);
          }),
      ),
    );
  }
  window.VideoWorkbench = {
    request: (path, body, method = "POST") =>
      child
        ? rpc("service-request", { path, body, method })
        : adapter.request(path, method, body),
    generator: { import: (payload) => rpc("generator-import", payload) },
    ready,
    loadScripts,
    storage,
    reportError,
    models: M,
    jobAsset,
    characters: collection("characters"),
    projects: collection("projects"),
    compositions: collection("compositions"),
    scenes3d: collection("scenes3d"),
    assets: {
      save: collection("assets").save,
      remove: async (id) => {
        const c = (await collection("characters").list()).find(
          (c) => c.id === id && c.inLibrary,
        );
        if (c) await collection("characters").save({ ...c, inLibrary: false });
        return collection("assets").remove(id);
      },
      list: async () => {
        await ready;
        return [
          ...db.assets,
          ...db.characters
            .filter((x) => x.inLibrary)
            .map((x) => M.asset({ ...x, kind: "character", url: x.image })),
        ];
      },
    },
    generations: {
      list: async () => {
        await ready;
        return structuredClone(db.jobs);
      },
      quote: (input) =>
        child
          ? rpc("service-request", { path: "/generations/quote", body: input })
          : adapter.request("/generations/quote", "POST", input),
      create: generate,
      refresh: (job) =>
        job.serverAccepted === false ||
        (!job.serverAccepted && ["blocked", "submitting"].includes(job.status))
          ? Promise.resolve(job)
          : window.VideoWorkbench.generations.get(job.id),
      retry: async (job) => {
        const current = await window.VideoWorkbench.generations.refresh(job);
        if (
          current.submissionUnconfirmed ||
          (current.status === "blocked" &&
            !current.serverAccepted &&
            !current.submissionRejected)
        )
          throw Error(
            "上次送出狀態未確認，不會自動重送；請先確認服務端任務紀錄。",
          );
        if (["queued", "running", "submitting"].includes(current.status))
          throw Error("任務仍在執行，請先檢視任務，不會重複送出。");
        if (["queued", "running", "submitting"].includes(job.status))
          return current;
        const sourceUrl = current.result?.sourceUrl;
        return generate(
          current.status === "failed" &&
            current.type === "image" &&
            sourceUrl &&
            ["center-crop", "region-preserve"].includes(
              current.input?.settings?.imageLayout,
            )
            ? {
                type: "image",
                operation: "image-output",
                references: { src: { url: sourceUrl } },
                settings: current.input.settings,
              }
            : current.input,
        );
      },
      get: async (id) => {
        if (child) return rpc("job-get", { id });
        const cached = db.jobs.find((j) => j.id === id);
        if (
          config.mode === "local" &&
          cached &&
          !(cached.status === "blocked" && cached.serverAccepted) &&
          ["blocked", "failed", "succeeded", "cancelled"].includes(
            cached.status,
          )
        )
          return structuredClone(cached);
        const job = await adapter.request(
          "/generations/" + encodeURIComponent(id),
          "GET",
        );
        if (cached) Object.assign(cached, job);
        await persist().catch(reportError);
        broadcast();
        return job;
      },
      cancel: async (id) => {
        if (child) return rpc("job-cancel", { id });
        const job = await adapter.request(
          "/generations/" + encodeURIComponent(id) + "/cancel",
          "POST",
        );
        const cached = db.jobs.find((j) => j.id === id);
        if (cached) Object.assign(cached, job);
        await persist().catch(reportError);
        broadcast();
        return job;
      },
    },
    flush: () => queue,
    preferences: {
      get: async (key, fallback = null) => {
        await ready;
        return structuredClone(read(key) ?? fallback);
      },
      set: async (key, value) => {
        await ready;
        return child
          ? rpc("preference-set", { key, value })
          : perform("preference-set", { key, value });
      },
    },
    backup: {
      export: async () => {
        await ready;
        await queue.catch(() => {});
        // The server copy is the backup source; null = nothing saved yet, so this tab's state is all there is.
        return (await adapter.request("/state", "GET")) ?? structuredClone(db);
      },
      import: async (value) => {
        await ready;
        if (child) throw Error("請從主頁匯入");
        if (
          value?.version !== 1 ||
          !["characters", "projects", "assets", "jobs"].every((k) =>
            Array.isArray(value[k]),
          )
        )
          throw Error("備份格式不正確");
        for (const [name, normalize] of [
          ["characters", M.character],
          ["projects", M.project],
          ["assets", M.asset],
          ["jobs", (v) => v],
          ["compositions", composition],
          ["scenes3d", composition],
        ])
          for (const item of value[name] || []) {
            if (!item || typeof item !== "object" || !item.id) continue;
            if (!db[name].some((v) => v.id === item.id))
              db[name].push(normalize(item));
          }
        db.preferences = { ...value.preferences, ...db.preferences };
        await persist();
        broadcast();
        document.dispatchEvent(new CustomEvent("vw:changed"));
      },
    },
    navigate: (target) =>
      child ? rpc("navigate", { target }) : perform("navigate", { target }),
    // Card PJ.1: the episode spine's actions; children ask the top page, which alone changes spine fields.
    // Card PJ.2 adds settle(job).
    spine: Object.fromEntries(
      [["attachEdit", "spine-attach-edit"], ["open", "spine-open"], ["settle", "spine-settle"]].map(([name, action]) => [
        name,
        async (payload = {}) => {
          await ready;
          return child ? rpc(action, payload) : perform(action, payload);
        },
      ]),
    ),
  };
  // storyboards-0.js is hash-protected and still calls the old global name.
  window.SeedStar = window.VideoWorkbench;
  ready.catch(reportError);
})();
