(function () {
  const id = () => crypto.randomUUID();
  const asset = (v = {}, kind = "image") =>
    typeof v === "string"
      ? { id: id(), kind, url: v, name: "" }
      : {
          ...v,
          id: v.id || id(),
          kind: v.kind || kind,
          name: v.name || "",
          url: v.url || v.image || "",
          references: v.refs || v.references || [],
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
      ? v.assets
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
  window.SeedStarModels = {
    asset,
    character,
    project,
    legacyCharacter,
    legacyProject,
  };
})();
