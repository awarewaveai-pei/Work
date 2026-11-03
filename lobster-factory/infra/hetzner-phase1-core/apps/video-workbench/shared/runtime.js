(function () {
  "use strict";
  const M = SeedStarModels,
    child =
      parent !== window &&
      !document.documentElement.hasAttribute("data-seedstar-root"),
    config = window.SEEDSTAR_CONFIG;
  const adapter =
    config.mode === "http"
      ? new SeedStarAdapters.HttpAdapter(config)
      : new SeedStarAdapters.LocalAdapter({ report: (e) => reportError(e) });
  let db = {
    version: 1,
    revision: 0,
    characters: [],
    projects: [],
    assets: [],
    jobs: [],
    compositions: [],
    preferences: {},
    selection: {},
  };
  // Card P3: compositor documents (shared/compositor.js) are a ledger collection like projects; stored as given.
  const COLLECTIONS = ["characters", "projects", "assets", "compositions"];
  const composition = (v = {}) => ({ ...structuredClone(v), id: v.id || crypto.randomUUID() });
  let queue = Promise.resolve();
  const pending = new Map();
  const knownSource = (source) =>
    [...document.querySelectorAll("iframe")].some(
      (f) => f.contentWindow === source,
    );
  const rpc = (action, payload) =>
    new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error("頁面通訊逾時"));
      }, config.timeoutMs);
      pending.set(id, { resolve, reject, timer });
      parent.postMessage(
        { channel: "seedstar:v1", id, action, payload },
        location.origin,
      );
    });
  function reportError(error) {
    console.error("[SeedStar]", error);
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
  const CONFLICT = "seedstar.conflict-reload";
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
  function read(key) {
    if (key === "seedstar.characters")
      return db.characters.map(M.legacyCharacter);
    if (key === "awarewave-projects-screenshot-frontend-v1")
      return { projects: db.projects.map(M.legacyProject), ...db.selection };
    return db.preferences[key] ?? null;
  }
  function write(key, value) {
    if (["__proto__", "constructor", "prototype"].includes(key))
      throw new Error("無效的資料鍵");
    if (key === "seedstar.characters")
      db.characters = [
        ...db.characters.filter(
          (c) =>
            c.id.startsWith("catalog-") && !value.some((v) => v.id === c.id),
        ),
        ...value.map(M.character),
      ];
    else if (key === "awarewave-projects-screenshot-frontend-v1") {
      db.projects = value.projects.map(M.project);
      db.selection = { current: value.current, episode: value.episode };
    } else db.preferences[key] = value;
  }
  function broadcast() {
    for (const f of document.querySelectorAll("iframe"))
      f.contentWindow?.postMessage(
        { channel: "seedstar:v1", action: "snapshot", payload: db },
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
      return SeedStar.generator.import(payload);
    if (action === "job-get") return SeedStar.generations.get(payload.id);
    if (action === "job-cancel") return SeedStar.generations.cancel(payload.id);
    if (action === "service-request")
      return adapter.request(
        payload.path,
        payload.method || "POST",
        payload.body,
      );
    if (action === "preference-set") {
      write(payload.key, payload.value);
      await persist();
      broadcast();
      document.dispatchEvent(new CustomEvent("seedstar:changed"));
      return payload.value;
    }
    if (action === "write") {
      write(payload.key, payload.value);
      await persist();
      broadcast();
      return db;
    }
    if (action === "generate") return generate(payload);
    if (action === "navigate") {
      document.getElementById(payload.target + "Nav")?.click();
      return true;
    }
    throw new Error("未知頁面指令");
  }
  window.addEventListener("message", async (event) => {
    if (
      event.origin !== location.origin ||
      event.data?.channel !== "seedstar:v1"
    )
      return;
    const m = event.data;
    if (child) {
      if (event.source !== parent) return;
      if (m.action === "snapshot") {
        db = m.payload;
        document.dispatchEvent(new CustomEvent("seedstar:changed"));
        return;
      }
      const p = pending.get(m.id);
      if (p) {
        clearTimeout(p.timer);
        pending.delete(m.id);
        m.error ? p.reject(new Error(m.error)) : p.resolve(m.payload);
      }
      return;
    }
    if (!knownSource(event.source)) return;
    try {
      const payload = await perform(m.action, m.payload);
      event.source.postMessage(
        { channel: "seedstar:v1", id: m.id, payload },
        event.origin,
      );
    } catch (e) {
      event.source.postMessage(
        { channel: "seedstar:v1", id: m.id, error: e.message },
        event.origin,
      );
    }
  });
  async function generate(input) {
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
        if (config.mode === "http" || e instanceof SeedStarAdapters.ServiceError)
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
        e instanceof SeedStarAdapters.ServiceError &&
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
  const ready = child
    ? rpc("load").then((v) => {
        db = v;
      })
    : adapter.load().then((v) => {
        if (v) {
          if (v.version !== 1) throw new Error("不支援的資料版本");
          db = v;
          if (!Number.isInteger(db.revision)) db.revision = 0;
          if (!Array.isArray(db.compositions)) db.compositions = []; // state saved before card P3
          if (normalizeAssets()) persist().catch(() => {});
        }
        try {
          if (sessionStorage.getItem(CONFLICT)) {
            sessionStorage.removeItem(CONFLICT);
            reportError(new Error("另一個分頁已更新，已載入最新資料"));
          }
        } catch {}
      });
  // The asset a finished job becomes. Id job-<jobId> keeps SeedStar.showJob and reconcileJobs from doubling it.
  const jobAsset = (v) => ({
    id: "job-" + v.id,
    kind: v.type,
    type: v.type === "audio" ? "audio/mpeg" : v.type === "image" ? "image/png" : "video/mp4",
    name: (v.input?.operation || v.type) + "-" + v.id.slice(0, 8),
    url: v.result.url,
    ...(v.result.origin ? { origin: v.result.origin } : {}),
  });
  // Paid output must not depend on a job panel staying open (Codex 2026-11-02): on load, every job not known to be
  // finished is asked again; succeeded ones without their asset get it. Still-running ones are re-asked every 5 s
  // for up to 10 min. Parent page only (children share its db).
  async function reconcileJobs(round = 0) {
    const open = db.jobs
      .filter((j) => j?.id && !["failed", "cancelled", "blocked"].includes(j.status) && !db.assets.some((a) => a.id === "job-" + j.id))
      .slice(-50);
    let changed = false,
      running = false;
    for (const j of open) {
      let v;
      try {
        v = await adapter.request("/generations/" + encodeURIComponent(j.id), "GET");
      } catch {
        continue;
      }
      if (!v || v.status === j.status) {
        running ||= ["queued", "running"].includes(v?.status);
        if (v?.status !== "succeeded") continue;
      }
      Object.assign(j, v);
      changed = true;
      if (v.status === "succeeded" && v.result?.url && !db.assets.some((a) => a.id === "job-" + j.id))
        db.assets.push(M.asset(jobAsset(v)));
      running ||= ["queued", "running"].includes(v.status);
    }
    if (changed) {
      await persist().catch(reportError);
      broadcast();
      document.dispatchEvent(new CustomEvent("seedstar:changed"));
    }
    if (running && round < 120) setTimeout(() => reconcileJobs(round + 1).catch(reportError), 5000);
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
      db[name] = db[name].filter((x) => x.id !== id);
      await persist();
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
        name === "compositions"
          ? composition
          : M[
              name === "characters"
                ? "character"
                : name === "projects"
                  ? "project"
                  : "asset"
            ];
      const v = normalize(value);
      const items = db[name],
        i = items.findIndex((x) => x.id === v.id);
      i < 0 ? items.push(v) : items.splice(i, 1, v);
      {
        await persist();
        broadcast();
      }
      return v;
    },
  });
  window.SeedStar = {
    request: (path, body, method = "POST") =>
      child
        ? rpc("service-request", { path, body, method })
        : adapter.request(path, method, body),
    generator: { import: (payload) => rpc("generator-import", payload) },
    ready,
    storage,
    reportError,
    models: M,
    jobAsset,
    characters: collection("characters"),
    projects: collection("projects"),
    compositions: collection("compositions"),
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
          : window.SeedStar.generations.get(job.id),
      retry: async (job) => {
        const current = await window.SeedStar.generations.refresh(job);
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
        ])
          for (const item of value[name] || []) {
            if (!item || typeof item !== "object" || !item.id) continue;
            if (!db[name].some((v) => v.id === item.id))
              db[name].push(normalize(item));
          }
        db.preferences = { ...value.preferences, ...db.preferences };
        await persist();
        broadcast();
        document.dispatchEvent(new CustomEvent("seedstar:changed"));
      },
    },
    navigate: (target) =>
      child ? rpc("navigate", { target }) : perform("navigate", { target }),
  };
  ready.catch(reportError);
})();
