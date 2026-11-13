// The one way a page shows money: NT$ at capabilities.twdRate (next-admin image-models.js TWD_RATE). Prices travel in USD
// (cost-model.ts); only the text on the page is NT$. No rate yet (capabilities not loaded) = "" like an unknown price.
window.VideoWorkbenchMoney = (usd, c = window.VideoWorkbench?.capabilities) => {
  const rate = Number(c?.twdRate), n = Number(usd) * rate;
  if (!(rate > 0) || !Number.isFinite(n)) return "";
  return "NT$" + (n >= 10 ? n.toFixed(1) : n >= 0.1 ? n.toFixed(2) : String(Number(n.toPrecision(2))));
};
// Speech models / transcription engines (capabilities speech.models, transcribe.engines: the server's one list, which
// already drops retired rows and marks rows without a key available:false). The one rule for which row a page shows as
// chosen: the saved id while its row is listed AND available, else the server's default (itself the first available
// row). A row without a key is shown 未啟用 and can never be the chosen one, so it is never sent.
window.VideoWorkbenchProviders = {
  rows: (kind, c = window.VideoWorkbench?.capabilities) => (kind === "speech" ? c?.speech?.models : c?.transcribe?.engines) || [],
  current(kind, saved, c = window.VideoWorkbench?.capabilities) {
    const rows = this.rows(kind, c), fallback = kind === "speech" ? c?.speech?.defaultModel : c?.transcribe?.defaultEngine;
    return rows.some((r) => r.id === saved && r.available) ? saved : fallback;
  },
};
(function () {
  const id = () => crypto.randomUUID();
  const asset = (v = {}, kind = "image") =>
    typeof v === "string"
      ? { id: id(), kind, url: v, name: "", origin: { kind: "import", legacy: true } }
      : {
          ...v,
          id: v.id || id(),
          kind: v.kind || kind,
          name: v.name || "",
          url: v.url || v.image || "",
          references: v.refs || v.references || [],
          // Every asset carries where it came from (contracts.d.ts AssetOrigin); one without = saved before M2.
          origin: v.origin || { kind: "import", legacy: true },
        };
  const character = (v = {}) => {
    const { fav, garments, ...rest } = v;
    return {
      ...rest,
      id: v.id || id(),
      name: String(v.name || ""),
      description: String(v.description || v.descr || ""),
      tags: Array.isArray(v.tags)
        ? v.tags
        : String(v.tags || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
      references: v.references || v.refs || [],
      wardrobe: garments || v.wardrobe || [],
      accessories: v.accessories || [],
      favorite: !!(fav ?? v.favorite),
      inLibrary: !!v.inLibrary,
      voice: v.voice || null,
    };
  };
  const project = (v = {}) => ({
    ...v,
    id: v.id || id(),
    title: String(v.title || v.name || ""),
    assets: Array.isArray(v.assets)
      ? v.assets.map((x) => asset(x))
      : Object.entries(v.assets || {}).flatMap(([kind, items]) =>
          items.map((x) => asset(x, kind)),
        ),
    episodes: v.episodes || [],
  });
  const legacyCharacter = (v) => ({
    ...v,
    fav: v.favorite,
    garments: v.wardrobe,
  });
  const legacyProject = (v) => ({
    ...v,
    assets: Object.fromEntries(
      [
        ...new Set([
          "character",
          "scene",
          "prop",
          ...v.assets.map((a) => a.kind),
        ]),
      ].map((k) => [
        k,
        v.assets
          .filter((a) => a.kind === k)
          .map(({ references, ...a }) => ({ ...a, refs: references })),
      ]),
    ),
  });
  window.VideoWorkbenchModels = {
    asset,
    character,
    project,
    legacyCharacter,
    legacyProject,
  };
})();
// Card RV: the video models a job can pick, from /capabilities videoModels (backend/generation-policy.cjs). A host or
// older server without that list = one model with the top-level limits, as before.
(function () {
  const list = (caps) =>
    Array.isArray(caps?.videoModels) && caps.videoModels.length
      ? caps.videoModels
      : [{ id: caps?.models?.video || "", label: caps?.models?.video || "影片模型", provider: "", durations: caps?.videoDurations || [4, 6, 8], ratios: caps?.videoRatios || ["16:9", "9:16"], requiresImage: false, usdPerSec: null, defaultDurationSec: 8, available: caps?.video !== false }];
  // Unknown or old values (a shut-down sora-2, no value) = the default, like the server (generation-policy videoModelOf).
  const get = (caps, id) => list(caps).find((m) => m.id === id) || list(caps)[0];
  // A saved setting naming a model the vendor shut down (capabilities.retiredVideoModels) is moved to the default;
  // returns the one sentence the page shows, or null when nothing changed.
  const replaceRetired = (caps, settings) => {
    const name = settings && caps?.retiredVideoModels?.[settings.model];
    if (!name) return null;
    const next = get(caps);
    settings.model = next.id;
    return name + " 已停止服務，已改用 " + next.label;
  };
  const usd = (m, seconds, count = 1) => (Number.isFinite(m?.usdPerSec) ? m.usdPerSec * seconds * count : null);
  const priceText = (m, seconds, count = 1, caps = window.VideoWorkbench?.capabilities) => {
    const v = usd(m, seconds, count);
    const t = v === null ? "" : window.VideoWorkbenchMoney(v, caps);
    return v === null ? "依實際用量" : t && m.estimate ? "約 " + t : t;
  };
  window.VideoWorkbenchVideoModels = { list, get, usd, priceText, replaceRetired };
})();
