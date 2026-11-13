// Every paid action shows its price before the click (operator 2026-11-10). The price comes only from /capabilities
// (prices, toolCosts, videoModels, imageTo3d: all read from next-admin lib/ai/cost-model.ts on the server), never a
// number written here. A button names its feature(s) in data-paid="video.script video.transcribe"; this fills the
// price in when its own label has none. tests/paid-price.cjs holds paid call sites against these declarations.
(function () {
  const caps = () => window.VideoWorkbench?.capabilities;
  // shared/models.js VideoWorkbenchMoney (NT$) at the rate of the capabilities the price came from.
  let from = null;
  const money = (usd) => window.VideoWorkbenchMoney(usd, from);
  // usd 0 = no vendor bill (our own whisper worker): said as 免費, not NT$0.
  const unitText = (p) => (p && p.usd === 0 ? "免費" : p && Number.isFinite(p.usd) && money(p.usd) ? `${p.estimate ? "約 " : ""}${money(p.usd)}／${p.unit}` : "");
  // model = the video model / 3D way the action runs (data-paid-model; a rerun uses its job's), else the default.
  function one(feature, c, model) {
    if (!c) return "";
    from = c;
    if (feature === "video.bg-remove") return unitText({ usd: c.toolCosts?.removeBackground, unit: "張", estimate: true });
    if (feature === "video.motion") { const m = window.VideoWorkbenchVideoModels?.get(c, model); return unitText({ usd: m.usdPerSec, unit: "秒", estimate: m.estimate }); }
    if (feature === "video.3d") {
      const way = model && (c.imageTo3d?.methods || []).find((m) => m.id === model);
      if (way) return Number.isFinite(way.usd) && way.usd > 0 ? `${way.estimate ? "約 " : ""}${money(way.usd)}／個` : "";
      const paid = (c.imageTo3d?.methods || []).map((m) => m.usd).filter((usd) => Number.isFinite(usd) && usd > 0);
      return paid.length ? money(Math.min(...paid)) + " 起／個" : "";
    }
    // A chosen speech model / transcription engine (data-paid-model = its id): that row's own price from the list.
    if (model && feature === "video.tts") return unitText(c.speech?.models?.find((m) => m.id === model)?.price);
    if (model && feature === "video.transcribe") return unitText(c.transcribe?.engines?.find((e) => e.id === model)?.price);
    if (model && feature === "video.music") return unitText(c.music?.models?.find((m) => m.id === model)?.price);
    return unitText(c.prices?.[feature]);
  }
  // "" = no price known yet (capabilities not loaded) or a feature without a price.
  const text = (features, c = caps(), model) => String(features || "").split(/\s+/).filter(Boolean).map((f) => one(f, c, model)).filter(Boolean).join(" + ");
  function mark(root = document) {
    for (const el of root.querySelectorAll("[data-paid]")) {
      const own = el.querySelector(":scope > .paid-price");
      // A label that already states its price (a quote's NT$ amount, or 免費 for usd 0) gets none added.
      if (/NT\$|免費/.test(String(el.textContent).replace(own?.textContent || "", ""))) { own?.remove(); continue; }
      const t = text(el.dataset.paid, caps(), el.dataset.paidModel);
      if (!t) { own?.remove(); continue; }
      if (own?.textContent === " · " + t) continue;
      // pointer-events none: a click still lands on the button itself (handlers test e.target.id).
      const span = own || Object.assign(document.createElement("span"), { className: "paid-price" });
      span.style.pointerEvents = "none";
      span.textContent = " · " + t;
      if (!own) el.append(span);
    }
  }
  window.VideoWorkbenchPrices = { text, mark };
  if (typeof document === "undefined" || typeof MutationObserver === "undefined") return;
  let queued = false;
  const later = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      mark();
      if (!caps() && document.querySelector("[data-paid]")) load();
    });
  };
  let loading;
  const load = () =>
    (loading ||= window.VideoWorkbench?.loadCapabilities?.()
      .then(() => later())
      .catch(() => {}));
  new MutationObserver(later).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  later();
})();
