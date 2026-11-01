(function () {
  const isRoot = document.documentElement.hasAttribute("data-seedstar-root");
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
        e.data?.channel !== "seedstar:theme"
      )
        return;
      for (const [k, v] of Object.entries(e.data.tokens))
        if (/^--[\w-]+$/.test(k))
          document.documentElement.style.setProperty(k, v);
    });
    parent.postMessage({ channel: "seedstar:theme-ready" }, location.origin);
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
        { channel: "seedstar:theme", tokens: values },
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
      e.data?.channel === "seedstar:theme-ready" &&
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
