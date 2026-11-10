// Card ED.0: the editor's project list (spec §3 檔案歸屬: ED.9): the screen tools-editor.js shows with no project open,
// and the 新建剪輯專案 dialog (edAction("new")). edSpineList / edOpen / edCreate stay in tools-editor.js (shared).
// Card ED.9 (spec §1.1): search, count, a card per edit file (thumbnail = first frame, ratio badge, 草稿, length,
// 開啟編輯器 →, name, 更新於, 重新命名, 刪除) and the 屬於 專案 › 第 N 集 line. Every edit file is listed, attached to an episode or not.
let edListQuery = "";
function edListCard(p, home) {
  const main = edMain(p),
    first = p.clips.filter((c) => c.track === main && (c.kind === "image" || c.kind === "video")).sort((a, b) => a.start - b.start)[0],
    thumb = first ? (first.kind === "image" ? first.asset?.previewUrl || first.asset?.url : edMediaFile(first.asset, "thumb.jpg")) : null,
    total = Math.max(0, ...p.clips.map((c) => c.start + c.duration)),
    at = p.updatedAt && !Number.isNaN(Date.parse(p.updatedAt)) ? new Date(p.updatedAt).toLocaleDateString("zh-TW") : "—";
  return `<article class="editor-list-card" data-ed-list-card="${esc(p.id)}"><button type="button" class="editor-list-open" data-ed-action="open:${esc(p.id)}" aria-label="${esc(p.title)} · ${esc(p.ratio)}"><span class="editor-list-thumb" style="aspect-ratio:16/9">${thumb ? `<img src="${esc(thumb)}" alt="" loading="lazy">` : ""}<span class="editor-list-badge">${esc(p.ratio)}</span><span class="editor-list-draft">草稿</span><span class="editor-list-length">${edClockText(total)}</span></span><span class="editor-list-go">開啟編輯器 →</span><b class="editor-list-name">${esc(p.title)}</b></button>${home ? `<span class="editor-list-home">屬於 ${esc(home.project.title)} › 第 ${home.n} 集</span>` : ""}<span class="editor-list-foot"><span class="muted">更新於 ${esc(at)}</span><span><button type="button" class="btn small" data-ed-list="rename:${esc(p.id)}">重新命名</button><button type="button" class="btn small danger" data-ed-list="delete:${esc(p.id)}">刪除</button></span></span></article>`;
}
function edListBody() {
  const homes = new Map(edSpineList().map((x) => [x.file.id, x])),
    q = edListQuery.trim().toLowerCase(),
    hits = ed.projects.filter((p) => !q || p.title.toLowerCase().includes(q));
  return `<p class="note" data-ed-list-count>${hits.length} / ${ed.projects.length} 個剪輯專案</p>${hits.length ? `<div class="editor-list-grid">${hits.map((p) => edListCard(p, homes.get(p.id))).join("")}</div>` : `<p class="note">沒有符合的專案。</p>`}`;
}
function edProjectListScreen(t) {
  if (!ed.projects.length)
    return wfWrap(t, `<h3>剪輯專案</h3><section class="editor-list-empty"><h3>先放一個鏡頭，故事就開始。</h3>${edButton("新建剪輯專案", "new")}</section>`);
  return wfWrap(
    t,
    `<h3>剪輯專案</h3><p class="note">保留原始素材；時間軸、文字與音軌獨立儲存。</p><div class="editor-list-bar"><input class="text-input" type="search" aria-label="搜尋專案" placeholder="搜尋專案" data-ed-list-search value="${esc(edListQuery)}">${edButton("新建剪輯專案", "new")}</div><div data-ed-list-body>${edListBody()}</div>`,
  );
}
// Delete keeps a copy of just that project under its own key first (the pre-frames pattern of edLoadProjects; never the whole list, which would pile up), so it can be restored.
async function edListDelete(id) {
  const p = ed.projects.find((x) => x.id === id);
  if (!p) return;
  const d = edDialog(
    `<form><h3>刪除剪輯專案</h3><p>確定刪除「${esc(p.title)}」？此專案會先備份，需要時可請人救回；素材庫的原始檔不會被刪。</p><div class="row"><button class="btn" type="button" data-ed-list-no>取消</button><button class="btn danger" type="submit">刪除</button></div></form>`,
  );
  d.querySelector("[data-ed-list-no]").onclick = () => d.close();
  d.querySelector("form").onsubmit = async (e) => {
    e.preventDefault();
    d.close();
    try {
      await VideoWorkbench.preferences.set("tools.editor.projects.deleted-" + new Date().toISOString(), [ProjectEnvelope.wrap(edNative(p), { revision: p.revision || 0 })]);
      ed.projects = ed.projects.filter((x) => x.id !== id);
      edSaved.delete(id);
      edRender();
      await edSave();
    } catch (err) {
      VideoWorkbench.reportError(err);
    }
  };
}
function edListRename(id) {
  const p = ed.projects.find((x) => x.id === id);
  if (!p) return;
  const d = edDialog(
    `<form><h3>重新命名</h3><label>專案名稱<input data-ed-list-title class="text-input" aria-label="專案名稱" maxlength="100" value="${esc(p.title)}" required></label><div class="row"><button class="btn" type="button" data-ed-list-no>取消</button><button class="btn primary" type="submit">儲存</button></div></form>`,
  );
  d.querySelector("[data-ed-list-no]").onclick = () => d.close();
  d.querySelector("form").onsubmit = async (e) => {
    e.preventDefault();
    const title = d.querySelector("[data-ed-list-title]").value.trim();
    d.close();
    if (!title || title === p.title) return;
    p.title = title;
    edRender();
    await edSave().catch(() => {});
  };
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-ed-list]");
  if (!b) return;
  const [kind, id] = b.dataset.edList.split(":");
  if (kind === "rename") edListRename(id);
  else if (kind === "delete") edListDelete(id).catch(VideoWorkbench.reportError);
});
document.addEventListener("input", (e) => {
  if (!e.target.matches("[data-ed-list-search]")) return;
  edListQuery = e.target.value;
  document.querySelector("[data-ed-list-body]").innerHTML = VideoWorkbench.sanitize(edListBody());
});
function edNewProjectDialog() {
  // Card ED.1: the reference's 「新建剪輯專案」 -- name + a card per ratio (AwareWave also offers 4:3).
  const d = edDialog(
    `<form><h3>新建剪輯專案</h3><label>專案名稱<input data-ed-create-title class="text-input" aria-label="專案名稱" maxlength="100" value="未命名剪輯專案" required></label><fieldset class="editor-ratio-cards"><legend>畫面比例</legend>${edCreateRatios
      .map(
        ([r, name, use], i) =>
          `<label class="editor-ratio-card"><input type="radio" name="ratio" value="${r}" data-ed-create-ratio ${i ? "" : "checked"}><i style="aspect-ratio:${edRatios[r].join("/")}" aria-hidden="true"></i><b>${r} ${name}</b><small>${edRatios[r].join(" × ")} · ${use}</small></label>`,
      )
      .join("")}</fieldset><div class="row"><button class="btn" type="button" data-ed-create-cancel>取消</button><button class="btn primary" type="submit">建立專案</button></div></form>`,
  );
  d.querySelector("[data-ed-create-cancel]").onclick = () => d.close();
  d.querySelector("form").onsubmit = async (e) => {
    e.preventDefault();
    const title = d.querySelector("[data-ed-create-title]").value,
      ratio = d.querySelector("[data-ed-create-ratio]:checked").value;
    d.close();
    await edCreate(title, ratio);
  };
}
