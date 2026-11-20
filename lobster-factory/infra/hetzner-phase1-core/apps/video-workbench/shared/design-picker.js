// Card R3: the one way to pick a banner-tool card (我的設計) as a 橫幅字卡 opener's picture. The editor's 片頭 pane
// (scripts/editor-panes/text.js) and the 編輯片頭 dialog (shared/bookends.js) both draw it and act through it, so there is
// one list (backend GET /designs = this organization's designs only), one pick (POST /designs/use: a JPEG at the project's
// size), one card grid and one banner-tool link. Callers own their state and their click wiring: `attrs` names the
// attributes each control carries (load / banner / pick:<id>).
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.DesignPicker = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  // A design's shape against the project's ratio ("16:9"); unknown size = not marked.
  function crops(d, ratio) {
    const [w, h] = String(ratio).split(":").map(Number);
    return d.width > 0 && d.height > 0 && w > 0 && h > 0 && Math.abs(d.width / d.height / (w / h) - 1) > 0.02;
  }
  // The designs, each with its size: as next-admin recorded it, else read from the picture (older designs). Never throws:
  // a failed list is { items: [], error }.
  async function load(V, ImageCtor = typeof Image === "function" ? Image : null) {
    try {
      const { designs } = await V.request("/designs", undefined, "GET");
      const items = await Promise.all((designs || []).map((d) => d.width > 0 && d.height > 0 || !ImageCtor ? d : new Promise((done) => {
        const img = new ImageCtor();
        img.onload = () => done({ ...d, width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => done(d);
        img.src = d.url;
      })));
      return { items };
    } catch (e) {
      return { items: [], error: e.message || "讀不到我的設計" };
    }
  }
  // The picked design as a picture reference { id, url, name } (url = a local /generated JPEG at the ratio's size).
  async function use(V, id, ratio) {
    const got = await V.request("/designs/use", { id, ratio });
    return { id: got.id, url: got.url, name: got.name };
  }
  // The banner tool for this video: its ratio, its title, the centred opener layout, and the organization it saves into.
  function bannerUrl(V, ratio, title) {
    const org = V.capabilities?.mainSystem?.organizationId;
    return "/tools/banner?" + new URLSearchParams({ ratio, title: String(title || ""), template: "opener-center", ...(org ? { org } : {}) });
  }
  // The field: what is picked, 從我的設計挑 / 開橫幅工具做一張, and once loaded the grid (picture cards, aria-pressed, and
  // when the design's shape differs from the project's: the whole card shows over a blurred copy, never cut).
  function html({ label, list, picked, ratio, esc, attrs }) {
    const head = `<p class="note">${esc(label)}（從我的設計挑；字卡上的字就是片頭的字，不另加標題）</p>${picked ? `<img class="ed-intro-cover" src="${esc(picked.url)}" alt="${esc(picked.name || "設計")}">` : ""}`,
      buttons = `<div class="flow-choices" role="group" aria-label="橫幅字卡來源"><button type="button" class="btn small" ${attrs.load}>${list ? "重新整理我的設計" : "從我的設計挑"}</button><button type="button" class="btn small" ${attrs.banner}>開橫幅工具做一張</button></div>`;
    if (!list) return head + buttons;
    if (list.error) return head + buttons + `<p class="note">${esc(list.error)}</p>`;
    if (!list.items.length) return head + buttons + '<p class="note">我的設計還沒有圖片，先用「開橫幅工具做一張」，存到我的設計後回來按「重新整理我的設計」。</p>';
    return head + buttons + `<div class="ed-intro-grid" role="group" aria-label="我的設計">${list.items.map((d) => {
      const on = picked?.id === d.id;
      return `<button type="button" class="ed-intro-card ${on ? "selected" : ""}" ${attrs.pick(d.id)} aria-pressed="${on}"><img src="${esc(d.url)}" alt="" loading="lazy"><span>${esc(d.name)}</span>${crops(d, ratio) ? "<small>比例不同，會加模糊底</small>" : ""}</button>`;
    }).join("")}</div>`;
  }
  return { crops, load, use, bannerUrl, html };
});
