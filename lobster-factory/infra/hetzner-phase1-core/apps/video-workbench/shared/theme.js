(function () {
  const isRoot = document.documentElement.hasAttribute("data-vw-root");
  const decorate = () => {
    for (const select of document.querySelectorAll("select")) select.classList.add("form-select");
  };
  decorate();
  new MutationObserver(decorate).observe(document.body, { childList: true, subtree: true });
  if (parent !== window && !isRoot) {
    window.addEventListener("message", (e) => {
      if (
        e.source !== parent ||
        e.origin !== location.origin ||
        e.data?.channel !== "vw:theme"
      )
        return;
      for (const [k, v] of Object.entries(e.data.tokens))
        if (/^--[\w-]+$/.test(k))
          document.documentElement.style.setProperty(k, v);
    });
    parent.postMessage({ channel: "vw:theme-ready" }, location.origin);
    return;
  }
  const root = document.documentElement;
  const visited = new Set();
  function collect(s) {
    if (visited.has(s)) return [];
    visited.add(s);
    try {
      return [...s.cssRules]
        .flatMap((r) => r.styleSheet ? collect(r.styleSheet) : r.selectorText === ":root" ? [...r.style].filter((k) => k.startsWith("--")) : []);
    } catch {
      return [];
    }
  }
  const tokens = [...new Set([...document.styleSheets].flatMap(collect))];
  const requestedOrigin = new URLSearchParams(location.search).get("awarewaveParentOrigin");
  const trustedOrigin = requestedOrigin && (requestedOrigin === "https://app.aware-wave.com" || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(requestedOrigin)) ? requestedOrigin : null;
  function getTokens() {
    const s = getComputedStyle(root);
    return Object.fromEntries(
      tokens.map((k) => [k, s.getPropertyValue(k).trim()]),
    );
  }
  function refresh() {
    const values = getTokens();
    for (const f of document.querySelectorAll("iframe"))
      f.contentWindow?.postMessage(
        { channel: "vw:theme", tokens: values },
        location.origin,
      );
    return values;
  }
  window.addEventListener("message", (e) => {
    if (parent !== window && trustedOrigin && e.source === parent && e.origin === trustedOrigin && e.data?.channel === "awarewave:theme") {
      if (!e.data.tokens || typeof e.data.tokens !== "object" || Array.isArray(e.data.tokens)) return;
      for (const name of tokens) {
        const value = e.data.tokens[name];
        typeof value === "string" ? root.style.setProperty(name, value) : root.style.removeProperty(name);
      }
      root.dataset.awarewaveEmbedded = "true";
      refresh();
      parent.postMessage({ channel: "awarewave:theme-applied" }, trustedOrigin);
      return;
    }
    if (
      e.origin === location.origin &&
      e.data?.channel === "vw:theme-ready" &&
      [...document.querySelectorAll("iframe")].some(
        (f) => f.contentWindow === e.source,
      )
    )
      refresh();
  });
  if (parent !== window && trustedOrigin) parent.postMessage({ channel: "awarewave:theme-ready" }, trustedOrigin);
  new MutationObserver(refresh).observe(root, {
    attributes: true,
    attributeFilter: ["style", "class", "data-theme"],
  });
  new MutationObserver(refresh).observe(document.head, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  // Card P6.16: a tab that comes back reads the theme saved on app again (?fresh makes the server ask app too) and
  // swaps it into the imported sheet in place, so the cascade order stays the same. No timer: only this event.
  const savedSheet = (sheets) => {
    for (const s of sheets) {
      if (s.href && new URL(s.href).pathname === "/awarewave/theme.css") return s;
      try {
        const inner = savedSheet([...s.cssRules].map((r) => r.styleSheet).filter(Boolean));
        if (inner) return inner;
      } catch {}
    }
    return null;
  };
  async function reloadSavedTheme() {
    const sheet = savedSheet([...document.styleSheets]);
    if (!sheet) return;
    const r = await fetch("/awarewave/theme.css?fresh=1", { cache: "no-store", credentials: "same-origin" });
    // Same block shape backend/appearance.cjs cuts from globals.css (its comments contain "<", so no stricter class).
    const blocks = r.ok ? (await r.text()).match(/:root\s*\{[^}]*\}/g) : null;
    if (blocks?.length !== 2) return;   // bundled defaults + saved block, or leave the sheet alone
    while (sheet.cssRules.length) sheet.deleteRule(0);
    blocks.forEach((block, i) => sheet.insertRule(block, i));
    refresh();
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") reloadSavedTheme().catch(() => {});
  });
  window.addEventListener("themechange", refresh);
  window.addEventListener("awarewave:theme-change", refresh);
  window.AwareWaveTheme = {
    tokens,
    getTokens,
    refresh,
    setTokens(values) {
      for (const [key, value] of Object.entries(values)) {
        if (!tokens.includes(key)) throw Error("Unknown theme token: " + key);
        value == null
          ? root.style.removeProperty(key)
          : root.style.setProperty(key, String(value));
      }
      return refresh();
    },
    resetTokens() {
      for (const k of tokens) root.style.removeProperty(k);
      return refresh();
    },
  };
})();
