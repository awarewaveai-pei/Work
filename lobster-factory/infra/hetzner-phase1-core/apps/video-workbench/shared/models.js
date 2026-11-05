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
      : [{ id: caps?.models?.video || "sora-2", label: caps?.models?.video || "sora-2", provider: "OpenAI", durations: caps?.videoDurations || [4, 8, 12], ratios: caps?.videoRatios || ["16:9", "9:16"], requiresImage: false, usdPerSec: null, defaultDurationSec: 8, available: caps?.video !== false }];
  // Unknown or old values (sora-2 on a server whose default is another OpenAI model) = the default, like the server.
  const get = (caps, id) => list(caps).find((m) => m.id === id) || list(caps)[0];
  const usd = (m, seconds, count = 1) => (Number.isFinite(m?.usdPerSec) ? m.usdPerSec * seconds * count : null);
  const priceText = (m, seconds, count = 1) => {
    const v = usd(m, seconds, count);
    return v === null ? "依實際用量" : "US$" + v.toFixed(2);
  };
  window.VideoWorkbenchVideoModels = { list, get, usd, priceText };
})();
