// Card ED.0: the editor's project list (spec §3 檔案歸屬: ED.9): the screen tools-editor.js shows with no project open,
// and the 新建剪輯專案 dialog (edAction("new")). edSpineList / edOpen / edCreate stay in tools-editor.js (shared).
function edProjectListScreen(t) {
  return wfWrap(
    t,
    `<h3>剪輯專案</h3><p class="note">保留原始素材；時間軸、文字與音軌獨立儲存。</p>${edButton("新建剪輯專案", "new")}<div class="flow-choices">${edSpineList()
      .map(({ project, n, file }) => `<span>${edButton(file.title + " · " + file.ratio, "open:" + file.id)} <span class="muted">屬於 ${esc(project.title)} › 第 ${n} 集</span></span>`)
      .join("")}</div>`,
  );
}
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
