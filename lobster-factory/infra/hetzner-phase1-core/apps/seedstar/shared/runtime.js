(function () {
  "use strict";
  const M = SeedStarModels,
    child = parent !== window && !document.documentElement.hasAttribute("data-seedstar-root"),
    config = window.SEEDSTAR_CONFIG;
  const adapter =
    config.mode === "http"
      ? new SeedStarAdapters.HttpAdapter(config)
      : new SeedStarAdapters.LocalAdapter();
  let db = {
    version: 1,
    characters: [],
    projects: [],
    assets: [],
    jobs: [],
    preferences: {},
    selection: {},
  };
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
  function persist() {
    queue = queue.catch(() => {}).then(() => adapter.save(structuredClone(db)));
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
      return adapter.request(payload.path, payload.method || "POST", payload.body);
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
      const result = await adapter.request("/generations", "POST", input);
      if (
        !result?.id ||
        !["queued", "running", "succeeded", "failed"].includes(result.status)
      )
        throw new Error("生成服務回傳格式不正確");
      Object.assign(job, result);
      job.serverAccepted = true;
    } catch (e) {
      const rejected = e instanceof SeedStarAdapters.ServiceError && [400, 401, 403, 404, 405, 413, 415, 422, 429].includes(e.status);
      job.status = rejected ? "blocked" : "submitting";
      job.submissionRejected = rejected;
      job.submissionUnconfirmed = !rejected;
      job.error = rejected ? e.message : "未收到服務端確認，任務可能已送出；請先確認任務紀錄，避免重複計費。 " + e.message;
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
        }
      });
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
      if (!["characters", "projects", "assets"].includes(name))
        throw new Error("未知資源");
      await ready;
      if (child) return rpc("entity-remove", { name, id });
      db[name] = db[name].filter((x) => x.id !== id);
      await persist();
      broadcast();
    },
    list: async () => {
      await ready;
      return structuredClone(db[name]);
    },
    save: async (value) => {
      if (!["characters", "projects", "assets"].includes(name))
        throw new Error("未知資源");
      await ready;
      if (child) return rpc("entity-save", { name, value });
      const normalize =
        M[
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
    characters: collection("characters"),
    projects: collection("projects"),
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
      refresh: (job) => job.serverAccepted === false || (!job.serverAccepted && ["blocked", "submitting"].includes(job.status)) ? Promise.resolve(job) : window.SeedStar.generations.get(job.id),
      retry: async (job) => {
        const current = await window.SeedStar.generations.refresh(job);
        if (current.submissionUnconfirmed || (current.status === "blocked" && !current.serverAccepted && !current.submissionRejected)) throw Error("上次送出狀態未確認，不會自動重送；請先確認服務端任務紀錄。");
        if (["queued", "running", "submitting"].includes(current.status)) throw Error("任務仍在執行，請先檢視任務，不會重複送出。");
        if (["queued", "running", "submitting"].includes(job.status)) return current;
        const sourceUrl = current.result?.sourceUrl;
        return generate(current.status === "failed" && current.type === "image" && sourceUrl && ["center-crop", "region-preserve"].includes(current.input?.settings?.imageLayout)
          ? { type: "image", operation: "image-output", references: { src: { url: sourceUrl } }, settings: current.input.settings }
          : current.input);
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
        await queue;
        return structuredClone(db);
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
        ])
          for (const item of value[name]) {
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
