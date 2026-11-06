// Card M3 (docs/creative-suite-plan-20261102.md §3 invariant 10): engine-neutral outer format around a native
// project. Browser global `ProjectEnvelope`; require() in Node.
(function (root) {
  const ENGINE = "workbench-editor",
    ENGINE_VERSION = "1";
  const isEnvelope = (value) =>
    !!value &&
    typeof value === "object" &&
    value.formatVersion === 1 &&
    typeof value.engine === "string" &&
    value.native &&
    typeof value.native === "object";
  function assetsOf(native) {
    const seen = new Map();
    for (const clip of native.clips || []) {
      const asset = clip?.asset;
      if (!asset || typeof asset.url !== "string") continue;
      const key = asset.id != null ? "id:" + asset.id : "url:" + asset.url;
      if (!seen.has(key))
        seen.set(key, { id: asset.id ?? null, url: asset.url });
    }
    return [...seen.values()];
  }
  // Card FC.2: another engine's project (FilmCraft) is wrapped the same way; unwrap below still refuses it in this editor.
  function wrap(
    native,
    { revision = 0, engine = ENGINE, engineVersion = ENGINE_VERSION } = {},
  ) {
    return {
      formatVersion: 1,
      engine,
      engineVersion,
      nativeProjectRef: null,
      native,
      assets: assetsOf(native),
      timebase: native.timebase,
      output: { ratio: native.ratio, quality: native.quality || "1080p" },
      revision,
    };
  }
  // Bare (pre-M3) projects pass through; an envelope from another engine is refused rather than misread.
  function unwrap(value) {
    if (!isEnvelope(value))
      return { native: value, revision: 0, envelope: false };
    if (value.engine !== ENGINE)
      throw Error("此專案屬於其他編輯引擎：" + value.engine);
    return {
      native: value.native,
      revision: Number.isInteger(value.revision) ? value.revision : 0,
      envelope: true,
    };
  }
  const api = { ENGINE, ENGINE_VERSION, isEnvelope, assetsOf, wrap, unwrap };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ProjectEnvelope = api;
})(typeof globalThis === "object" ? globalThis : this);
