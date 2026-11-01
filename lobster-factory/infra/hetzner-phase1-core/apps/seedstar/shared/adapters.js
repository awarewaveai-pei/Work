(function () {
  class ServiceError extends Error {
    constructor(code, message, status = 0) {
      super(message);
      this.code = code;
      this.status = status;
    }
  }
  class LocalAdapter {
    constructor() {
      this.key = "seedstar.app.v1";
    }
    async load() {
      const v = localStorage.getItem(this.key);
      return v ? JSON.parse(v) : null;
    }
    async save(v) {
      localStorage.setItem(this.key, JSON.stringify(v));
    }
    async request(path, method = "POST", body) {
      const res = await fetch("/api/seedstar" + path, {
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
  class HttpAdapter {
    constructor(config) {
      this.config = config;
    }
    async request(path, method = "GET", body) {
      const controller = new AbortController(),
        timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
      try {
        const res = await fetch(
          this.config.apiBaseUrl.replace(/\/$/, "") + path,
          {
            method,
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: controller.signal,
          },
        );
        if (!res.ok)
          throw new ServiceError(
            "HTTP_ERROR",
            `服務回應 ${res.status}`,
            res.status,
          );
        return res.status === 204 ? null : await res.json();
      } finally {
        clearTimeout(timer);
      }
    }
    load() {
      return this.request("/state");
    }
    save(v) {
      return this.request("/state", "PUT", v);
    }
  }
  window.SeedStarAdapters = { LocalAdapter, HttpAdapter, ServiceError };
})();
