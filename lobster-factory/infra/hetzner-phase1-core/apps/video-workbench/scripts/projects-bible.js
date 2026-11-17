"use strict";
// Card U9 (docs/video-unify-plan-20261116.md §4 U9, D12): the 製作聖經 of a project and the Story Bible chain of the
// main system (next-admin /api/video/story-bibles, the same chain 腳本's Story Bible reads) are one record.
//   存成核准版本  the project's characters / scenes / props -> the series' next revision, then approved (owner/admin;
//                otherwise it stays a draft and says so). Never sends a projectId: that path takes short-drama projects only.
//   套用核准版本  the series' latest approved revision -> the project's items (reference pictures imported here once).
//   一致性比對    step 3: each shot picture against its character's approved reference, priced before it runs.
// The mapping both ways is next-admin lib/content/video/story-bible-production.ts, run by this server (backend/story-bible.cjs).
// Only the projects page's own fields change here (assets, storyBibleSeries); no shot picture is written.
window.ProjectBible = (() => {
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (k) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[k]);
  const org = () => window.VideoWorkbench?.capabilities?.mainSystem?.organizationId || "";
  let chain = { org: "", items: null, loading: null };
  const checks = new Map(); // episode id -> { results | error | busy }

  // GET answers series_id asc, revision desc: the first row of a series is its newest.
  async function load(force = false) {
    const o = org();
    if (!o) return [];
    if (!force && chain.org === o && chain.items) return chain.items;
    if (!force && chain.org === o && chain.loading) return chain.loading;
    chain = { org: o, items: null, loading: null };
    chain.loading = fetch("/api/video/story-bibles?organizationId=" + encodeURIComponent(o), { credentials: "same-origin", cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw Error(j.error || "讀不到 Story Bible 版本");
        return (chain.items = j.items || []);
      })
      .finally(() => (chain.loading = null));
    return chain.loading;
  }
  const newest = (items, series, status) => (items || []).find((r) => r.series_id === series && (!status || r.status === status));
  const approvedSeries = (items) => [...new Set((items || []).filter((r) => r.status === "approved").map((r) => r.series_id))];

  function section(p) {
    const items = chain.org === org() ? chain.items : null,
      series = p.storyBibleSeries || "",
      approved = series && newest(items, series, "approved"),
      line = !items ? "讀取版本中…" : series ? `系列 ${esc(series)} · ${approved ? "核准版 r" + approved.revision : "還沒有核准版"}` : "還沒連到腳本頁的 Story Bible。存成核准版本會建立一個新系列。",
      apply = series
        ? `<button class="btn small outline" data-action="bibleApply" data-value="${esc(series)}">套用核准版本</button>`
        : approvedSeries(items).map((s) => `<button class="btn small outline" data-action="bibleApply" data-value="${esc(s)}">套用 ${esc(s)}</button>`).join("");
    return `<div class="entity-group" data-bible-chain><div class="entity-header">▤　核准版本</div><p class="tiny">${line}</p><div class="row"><button class="btn small outline" data-action="bibleSave">存成核准版本</button>${apply}</div><p class="tiny">跟腳本頁的 Story Bible 是同一份；雙方各自不認得的欄位會原樣保留。</p></div>`;
  }
  function checkLines(e) {
    const c = checks.get(e.id);
    if (!c) return "";
    if (c.busy) return `<p class="tiny">比對中…</p>`;
    if (c.error) return `<p class="tiny">${esc(c.error)}</p>`;
    return c.results.map((r) => `<p class="tiny">鏡頭 ${esc(r.sceneIndex)}：${r.consistent === true ? "像同一個角色" : r.consistent === false ? "不像" : "無法判斷"}${r.note ? "（" + esc(r.note) + "）" : ""}</p>`).join("");
  }
  // After each draw of the workbench: the chain block in the 製作聖經 column, the check results in step 3.
  function mount(p, e) {
    const root = document.getElementById("workbench");
    if (!org() || !p || !root) return;
    const aside = root.querySelector("aside.bible"), step = root.querySelector('[data-step="3"]');
    if (aside && !aside.querySelector("[data-bible-chain]")) aside.querySelector('[data-action="settings"]')?.insertAdjacentHTML("beforebegin", window.VideoWorkbench.sanitize(section(p)));
    if (step && e) step.insertAdjacentHTML("beforeend", window.VideoWorkbench.sanitize(checkLines(e)));
    if (chain.org !== org() || !chain.items) load().then(() => { const a = root.querySelector("[data-bible-chain]"); if (a) a.outerHTML = window.VideoWorkbench.sanitize(section(p)); }, () => {});
  }

  const post = async (url, body) => {
    const r = await fetch(url, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, j };
  };
  const assetsOf = (p) => ({ character: p.assets?.character || [], scene: p.assets?.scene || [], prop: p.assets?.prop || [] });
  const seriesFor = (p) => p.storyBibleSeries || "series_" + String(p.id).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 48);

  async function saveApproved(p, ui) {
    const seriesId = seriesFor(p), items = await load(true),
      base = newest(items, seriesId)?.document_json || null;
    const made = await window.VideoWorkbench.request("/bible/draft", { base, production: assetsOf(p), seriesId, title: p.title });
    if (made.missing?.length) return ui.notify(`有 ${made.missing.length} 張參考圖還沒登記到主系統，請稍後再存。`);
    const saved = await post("/api/video/story-bibles", { organizationId: org(), storyBible: made.document });
    if (!saved.ok) return ui.notify("存不進 Story Bible：" + ((saved.j.findings || []).map((f) => f.path + " " + f.message).join("；") || saved.j.error || saved.status));
    // The item ids now pair with these Bible ids (the next save and 套用 match by them).
    for (const kind of ["character", "scene", "prop"]) for (const item of p.assets?.[kind] || []) if (made.keys[item.id]) item.key = made.keys[item.id];
    p.storyBibleSeries = seriesId;
    ui.save();
    const approved = await post("/api/video/story-bibles/" + encodeURIComponent(saved.j.item.id) + "/approve", {});
    await load(true).catch(() => {});
    ui.render();
    ui.notify(approved.ok ? `已存成核准版本 r${saved.j.item.revision}，腳本頁可以選用。` : `已存成草稿 r${saved.j.item.revision}；${approved.status === 403 ? "要由 owner／admin 核准後腳本頁才看得到。" : "核准失敗：" + (approved.j.error || approved.status)}`);
  }

  async function applyApproved(p, series, ui) {
    const row = newest(await load(true), series, "approved");
    if (!row) return ui.notify("這個系列還沒有核准版本。");
    const got = await window.VideoWorkbench.request("/bible/apply", { document: row.document_json, production: assetsOf(p) });
    p.assets = { ...(p.assets || {}), character: got.production.character, scene: got.production.scene, prop: got.production.prop };
    p.storyBibleSeries = series;
    ui.save();
    ui.render();
    ui.notify(`已套用 ${series} r${row.revision}` + (got.skipped ? `；${got.skipped} 張參考圖讀不到，沒有帶入。` : "。"));
  }

  // Resolve references from the approved document; local edits must never become the approved comparison baseline.
  async function check(p, e, ui) {
    const approved = p.storyBibleSeries && newest(await load(true), p.storyBibleSeries, "approved");
    if (!approved) return ui.notify("先存成或套用核准版本，才有可以比對的定裝照。");
    const { production } = await window.VideoWorkbench.request("/bible/apply", { document: approved.document_json, production: {} });
    const references = new Map((production.character || []).map((c) => [c.key, c.refs?.[0]]));
    const cast = new Map((p.assets?.character || []).map((c) => [c.id, c]));
    const want = e.shots.map((s, i) => {
      const ref = (s.characterIds || []).map((id) => references.get(cast.get(id)?.key)).find(Boolean);
      return s.image && ref ? { sceneIndex: i + 1, ref, image: s.image } : null;
    }).filter(Boolean);
    if (!want.length) return ui.notify("沒有可比對的鏡頭：要有畫面，並綁定有參考圖的角色。");
    const { urls } = await window.VideoWorkbench.request("/bible/public-urls", { urls: want.flatMap((w) => [w.ref, w.image]) });
    const pairs = want.filter((w) => urls[w.ref] && urls[w.image]).map((w) => ({ sceneIndex: w.sceneIndex, referenceImageUrl: urls[w.ref], generatedImageUrl: urls[w.image] }));
    if (!pairs.length) return ui.notify("鏡頭畫面還沒登記到主系統，請稍後再比對。");
    const quote = await post("/api/video/story-bibles/visual-consistency-check", { pairs, quote: true });
    if (!quote.ok) return ui.notify("比對報價失敗：" + (quote.j.error || quote.status));
    const price = window.VideoWorkbenchPrices.unit({ usd: quote.j.usd, unit: "次", estimate: true });
    if (!window.confirm(`比對 ${quote.j.pairs} 個鏡頭與核准版的角色參考圖，${price || "會產生費用"}。確定比對？`)) return;
    checks.set(e.id, { busy: true });
    ui.render();
    const run = await post("/api/video/story-bibles/visual-consistency-check", { pairs });
    checks.set(e.id, run.ok ? { results: run.j.results || [] } : { error: "比對失敗：" + (run.j.error || run.status) });
    ui.render();
  }

  // ui = { save, render, notify } of the projects page.
  function act(action, p, e, value, ui) {
    const run = action === "bibleSave" ? saveApproved(p, ui) : action === "bibleApply" ? applyApproved(p, value, ui) : check(p, e, ui);
    return run.catch((error) => ui.notify(error.message || String(error)));
  }
  return { section, mount, act };
})();
