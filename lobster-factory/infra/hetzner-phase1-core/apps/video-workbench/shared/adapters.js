(function () {
  class ServiceError extends Error {
    constructor(code, message, status = 0) {
      super(message);
      this.code = code;
      this.status = status;
    }
  }
  // The local server's /state is the one copy (plan invariant 6); localStorage only caches the last state the
  // server confirmed, so a reload while the server is down still shows something. Never written back as truth.
  class LocalAdapter {
    constructor({ report = () => {} } = {}) {
      this.key = "vw.app.v1";
      // Browsers that saved under the old name: copy (never move) each key, pre-server originals included.
      try {
        for (const k of Object.keys(localStorage)) {
          const next = k.replace(/^seedstar\.app\.v1/, this.key);
          if (next !== k && localStorage.getItem(next) === null) localStorage.setItem(next, localStorage.getItem(k));
        }
      } catch {}
      this.report = report;
    }
    cache(v) {
      try {
        localStorage.setItem(this.key, JSON.stringify(v));
      } catch (e) {
        this.report(new Error("本機快取寫入失敗（伺服器資料不受影響）：" + e.message));
      }
    }
    // Keeps the pre-server original under its own key; never overwritten or deleted by this code. A full
    // localStorage (the copy doubles the space) only loses this extra copy: the server already holds the data.
    keepOriginal(raw) {
      const key = this.key + ".pre-server-" + new Date().toISOString();
      try {
        if (localStorage.getItem(key) === null) localStorage.setItem(key, raw);
      } catch (e) {
        this.report(new Error("舊資料已存到伺服器，但瀏覽器空間不足，未另存原版備份：" + e.message));
      }
    }
    async load() {
      const raw = localStorage.getItem(this.key);
      let server;
      try {
        server = await this.request("/state", "GET");
      } catch (e) {
        this.report(new Error("無法連線本機伺服器，顯示的是上次的快取，修改不會保存：" + e.message));
        return raw ? JSON.parse(raw) : null;
      }
      if (server === null) {
        if (!raw) return null;
        // One-time migration of pre-server data: the server copy first, then the browser-side original.
        const legacy = { ...JSON.parse(raw), revision: 0 };
        const { revision } = await this.request("/state", "PUT", legacy);
        this.keepOriginal(raw);
        legacy.revision = revision;
        this.cache(legacy);
        return legacy;
      }
      if (raw) {
        const cached = JSON.parse(raw),
          strip = ({ revision, ...rest }) => JSON.stringify(rest);
        if (cached.revision !== server.revision && strip(cached) !== strip(server)) {
          this.keepOriginal(raw);
          this.report(new Error("此瀏覽器有與伺服器不同的舊資料；已改用伺服器資料，舊資料另存為備份，未合併。"));
        }
      }
      this.cache(server);
      return server;
    }
    // Resolves { revision } on success. 409 throws ServiceError with .state = the server's current state.
    async save(v) {
      const res = await fetch("/api/vw/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(v),
        signal: AbortSignal.timeout(180000),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw Object.assign(
          new ServiceError("SERVICE_ERROR", data.error?.message || "儲存失敗", res.status),
          res.status === 409 ? { state: data.state } : {},
        );
      this.cache({ ...v, revision: data.revision });
      return data;
    }
    async request(path, method = "POST", body) {
      const res = await fetch("/api/vw" + path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(180000),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new ServiceError(
          "SERVICE_ERROR",
          data.error?.message || "本機服務尚未設定",
          res.status,
        );
      return data;
    }
  }
  // 401 = not signed in (nginx 302s only the .html request itself; a page that outlived its session or came from cache gets
  // here through its first /api/vw call). The one place every page learns it: top-level goes to the login page carrying the
  // page it was on (nginx @vw_login uses the same ?next=); framed, the embedding page is told on the vw:v1 channel and
  // decides, so a frame never navigates itself to a login page. 403 is not handled here: it stays "no permission".
  // Pages that call /api/vw with their own fetch (chunked upload, engine render) call VideoWorkbenchAdapters.signedOut() on 401.
  function signedOut() {
    const next = location.pathname + location.search + location.hash;
    if (window.top !== window) window.top.postMessage({ channel: "vw:v1", action: "unauthorized", payload: { next } }, "*");
    else location.assign("/login?next=" + encodeURIComponent(next));
  }
  // One immutable organization per document, established before state or capabilities.
  // Framed workspaces share their parent's context even after another tab switches the cookie.
  const connected = window.VW_CONFIG?.mode === "http" && window.VW_CONFIG.apiBaseUrl?.replace(/\/$/, "") === "/api/vw";
  let context;
  try { if (window.parent !== window) context = window.parent.VideoWorkbenchAdapters?.context; } catch {}
  context ||= (() => {
    let active = 0, locked = false;
    const ready = connected ? fetch("/api/vw/identity", { credentials: "same-origin", cache: "no-store" }).then(async (r) => {
      if (r.status === 401) signedOut();
      if (!r.ok) throw new ServiceError("IDENTITY_ERROR", "無法確認目前客戶，請重新整理", r.status);
      const value = await r.json();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.organizationId || ""))
        throw new ServiceError("IDENTITY_ERROR", "服務尚未提供客戶識別，請重新整理");
      return Object.freeze({ organizationId: value.organizationId.toLowerCase() });
    }) : Promise.resolve(null);
    ready.catch(() => {}); // The adapter reports the failure to the existing error UI.
    return {
      ready,
      get locked() { return locked; },
      get busy() { return active > 0; },
      invalidate() { locked = true; },
      lock() {
        if (locked) throw Error("客戶已切換或正在切換，請重新整理頁面");
        if (active) throw Error("仍在傳送或儲存資料，請完成後再切換客戶");
        locked = true;
      },
      unlock() { locked = false; },
      async withSwitchLock(action) {
        if (!navigator.locks) throw Error("此瀏覽器無法安全切換客戶，請使用最新版 Chrome 或 Edge");
        return navigator.locks.request("vw-organization-work", { mode: "exclusive", ifAvailable: true }, (lock) => {
          if (!lock) throw Error("其他分頁仍在傳送或儲存資料，請完成後再切換客戶");
          return action();
        });
      },
      async run(action) {
        if (locked) throw Error("客戶已切換或正在切換，請重新整理頁面");
        active++;
        try {
          const invoke = async () => {
            if (locked) throw Error("客戶已切換或正在切換，請重新整理頁面");
            return action(await ready);
          };
          return connected && navigator.locks
            ? await navigator.locks.request("vw-organization-work", { mode: "shared" }, invoke)
            : await invoke();
        } finally { active--; }
      },
    };
  })();
  if (connected && window.addEventListener) window.addEventListener("message", async (event) => {
    if (event.data?.type !== "vw:document-organization" || !event.ports?.[0] || event.source !== navigator.serviceWorker?.controller) return;
    const identity = await context.ready.catch(() => null);
    event.ports[0].postMessage({ organizationId: context.locked ? null : identity?.organizationId || null });
  });
  async function fetchApi(input, init = {}) {
    const url = new URL(typeof input === "string" ? input : input.url, location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith("/api/vw/")) return fetch(input, init);
    return context.run(async (identity) => {
      const headers = new Headers(init.headers || (typeof input === "object" ? input.headers : undefined));
      if (identity) headers.set("X-VW-Org", identity.organizationId);
      const response = await fetch(input, { ...init, headers });
      if (response.status === 401) signedOut();
      return response;
    });
  }
  class HttpAdapter {
    constructor(config) {
      this.config = config;
    }
    // Deadlines measure silence, never size (a flat 15 s killed every video upload on a home uplink: nginx 499,
    // 2026-11-06). A read gives up after timeoutMs without bytes. A write waits gatewayTimeoutMs (nginx
    // proxy_read_timeout for this host), restarted by every upload progress event (XHR: fetch cannot report it):
    // giving up does not stop the server, it only leaves the user not knowing whether it worked. A stalled
    // upload is cut by nginx client_body_timeout and arrives here as an HTTP error.
    request(path, method = "GET", body) {
      return context.run((identity) => this.send(path, method, body, identity));
    }
    send(path, method, body, identity) {
      const json = body === undefined ? undefined : JSON.stringify(body),
        { timeoutMs } = this.config,
        limit = json === undefined ? timeoutMs : this.config.gatewayTimeoutMs || 300000;
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        let timer,
          timedOut = false;
        const wait = (ms) => {
          clearTimeout(timer);
          timer = setTimeout(() => {
            timedOut = true;
            xhr.abort();
          }, ms);
        };
        xhr.open(method, this.config.apiBaseUrl.replace(/\/$/, "") + path);
        xhr.setRequestHeader("Content-Type", "application/json");
        if (identity) xhr.setRequestHeader("X-VW-Org", identity.organizationId);
        xhr.upload.onprogress = () => wait(limit);
        xhr.onabort = () =>
          reject(new ServiceError(timedOut ? "TIMEOUT" : "ABORTED", timedOut ? `連線逾時：${Math.round(limit / 1000)} 秒沒有任何進度` : "連線已中斷"));
        xhr.onerror = () => {
          clearTimeout(timer);
          reject(new ServiceError("NETWORK_ERROR", "網路連線失敗"));
        };
        xhr.onload = () => {
          clearTimeout(timer);
          let data;
          try {
            data = xhr.status === 204 ? null : JSON.parse(xhr.responseText);
          } catch {
            data = undefined;
          }
          if (xhr.status === 401) signedOut();
          if (xhr.status < 200 || xhr.status >= 300)
            // Same contract as LocalAdapter: the server's own message reaches the user (a refusal never shows as a bare
            // status code), and a 409 carries the host's current state for runtime.js to adopt.
            reject(
              Object.assign(
                new ServiceError("HTTP_ERROR", data?.error?.message || `服務回應 ${xhr.status}`, xhr.status),
                data?.state ? { state: data.state } : {},
              ),
            );
          else if (data === undefined) reject(new ServiceError("BAD_RESPONSE", "服務回傳格式不正確", xhr.status));
          else resolve(data);
        };
        xhr.onprogress = () => wait(limit); // the answer is arriving
        wait(limit);
        xhr.send(json === undefined ? null : json);
      });
    }
    load() {
      return this.request("/state");
    }
    save(v) {
      return this.request("/state", "PUT", v);
    }
  }
  window.VideoWorkbenchAdapters = { LocalAdapter, HttpAdapter, ServiceError, signedOut, context, fetchApi };
})();
