function productSeed() {
  return (
    '<div class="product-flow">' +
    productSteps() +
    productSummary() +
    productBody() +
    "</div>"
  );
}
function productSteps() {
  let a = ["貼上商品網址", "挑素材", "選提案", "確認腳本"];
  return (
    '<div class="product-steps">' +
    a
      .map(
        (x, i) =>
          '<span class="' +
          (i === state.productStep ? "on" : "") +
          '"><b>' +
          (i + 1) +
          "</b>" +
          x +
          "</span>",
      )
      .join("") +
    "</div>"
  );
}
function productSummary() {
  return state.productData
    ? '<div class="product-summary"><div class="product-thumb">▣</div><div><b>' +
        safe(state.productData.title) +
        "</b><small>" +
        safe(state.productData.price) +
        "</small></div><span>已選商品資料</span></div>"
    : "";
}
function productBody() {
  if (state.productStep === 0) return productUrlStep();
  if (state.productStep === 1)
    return productAssetsStep() + productDirectionStep();
  if (state.productStep === 2) return productProposalStep();
  return productScriptStep();
}
function productUrlStep() {
  return (
    '<section class="product-url-card"><h3>貼上商品網址</h3><p class="small-note">讀取公開商品頁的文字與圖片候選；請確認內容，亦可手動輸入。</p><div class="product-url-row"><input class="field" id="productUrl" placeholder="https://…" value="' +
    safe(state.productUrl) +
    '"><button class="box-cta" data-action="parse">解析商品網址</button></div></section><section class="product-section"><h3>手動補商品資料</h3><p class="small-note">網站無法讀取或資料不完整時，可填寫真實資料繼續。</p><input id="manualProductName" class="field" placeholder="商品名稱"><textarea id="manualProductDescription" class="field" placeholder="商品描述、賣點及注意事項"></textarea><button class="box-cta" data-action="product-manual">以手動資料繼續</button></section>'
  );
}
function productAssetsStep() {
  let d = state.productData || {
    title: "商品",
    price: "",
  };
  let imgs = state.productImages;
  return (
    '<section class="product-section"><div class="product-section-title"><div><h3>挑素材</h3><p class="small-note">選擇要放進影片的商品圖片與頁面文字</p></div><span class="small-note">已選 ' +
    state.productSelectedImages.length +
    " / " +
    imgs.length +
    ' 張圖片</span></div><div class="product-image-grid">' +
    imgs
      .map(
        (src, i) =>
          '<button class="product-image-choice ' +
          (state.productSelectedImages.includes(i) ? "selected" : "") +
          '" data-product-image="' +
          i +
          '"><img src="' +
          src +
          '"><i>✓</i><small>商品圖 ' +
          (i + 1) +
          "</small></button>",
      )
      .join("") +
    '<button class="product-image-upload" data-action="product-upload"><b>＋</b>上傳自己的圖</button></div><div class="product-section-title"><div><h3>頁面文字</h3><p class="small-note">只會使用你勾選的文字，不會自動亂編</p></div><span class="small-note">已選 ' +
    state.productSelectedTexts.length +
    " / " +
    state.productTexts.length +
    '</span></div><div class="product-text-list">' +
    state.productTexts
      .map(
        (x, i) =>
          '<label><input type="checkbox" data-product-text="' +
          i +
          '" ' +
          (state.productSelectedTexts.includes(i) ? "checked" : "") +
          "><span>" +
          safe(x) +
          "</span></label>",
      )
      .join("") +
    '</div><div class="product-actions"><button class="minor" data-action="product-reset">重新開始</button><button class="box-cta" data-action="product-scroll-direction">下一步：創意方向　↓</button></div></section>'
  );
}
function productDirectionStep() {
  let d = state.productDirection;
  const choices = (key, values) => '<div class="row">' + values.map((value) => `<button class="minor" data-gen-product-choice="${key}" data-value="${safe(value)}" aria-pressed="${d[key] === value}">${safe(value)}</button>`).join("") + '</div>';
  return (
    '<section class="product-section" data-product-direction><div class="product-section-title"><div><h3>創意方向</h3><p class="small-note">先決定影片要怎麼呈現，再產生可比較的提案。</p></div></div><div class="product-direction-grid"><fieldset><legend>影片呈現</legend>' + choices("visual", ["旁白＋商品示範", "人物面對鏡頭口播", "配樂＋音效，不含人聲", "純畫面，完全無聲"]) + '</fieldset><fieldset><legend>影片目標</legend>' + choices("target", ["吸引點擊", "促進購買", "建立認知"]) + '</fieldset><label>對誰說？<input class="field" data-product-field="question" value="' +
    safe(d.question) +
    '" placeholder="例如：25–35 歲上班族女性"></label><label>核心利益<input class="field" data-product-field="benefit" value="' +
    safe(d.benefit) +
    '" placeholder="消費者最在意的好處"></label><label>希望觀眾採取的行動<input class="field" data-product-field="action" value="' +
    safe(d.action) +
    '" placeholder="例如：立即點擊了解"></label><label>聲音與語氣<input class="field" data-product-field="voice" value="' +
    safe(d.voice) +
    '" placeholder="例如：溫暖親切、語速輕快"></label></div><label class="product-additional">補充說明（選填）<textarea class="field" data-product-field="additional" rows="4" placeholder="補充品牌、受眾、禁用詞或畫面要求">' +
    safe(d.additional) +
    '</textarea></label><div class="product-duration-row"><div><b>影片長度</b><span>' +
    state.productDuration +
    " 秒　· 約 " +
    Math.max(1, Math.round(state.productDuration / 3)) +
    ' 個分鏡</span></div><div class="row">' + (SeedStar.capabilities?.videoDurations || [4, 8, 12]).map((seconds) => `<button class="minor" data-gen-product-duration="${seconds}" aria-pressed="${state.productDuration === seconds}">${seconds} 秒</button>`).join("") + '</div></div><div class="product-actions"><button class="minor" data-action="product-back-assets">‹ 上一步</button><button class="box-cta" data-action="product-generate-proposals">產生影片提案　›</button></div></section>'
  );
}
function productProposalStep() {
  return (
    '<section class="product-section"><div class="product-section-title"><div><h3>選提案</h3><p class="small-note">挑一個最符合品牌方向的拍法，下一步可以再編輯腳本。</p></div><span class="small-note">' +
    state.productProposals.length +
    " 個分鏡 · " +
    state.productDuration +
    ' 秒</span></div><div class="product-proposal-grid">' +
    state.productProposals
      .map(
        (p, i) =>
          '<button class="product-proposal ' +
          (state.productSelectedProposal === i ? "selected" : "") +
          '" data-product-proposal="' +
          i +
          '"><div class="proposal-meta"><span>' +
          safe(p.tag) +
          "</span><small>" +
          state.productDuration +
          " 秒</small></div><h3>" +
          safe(p.title) +
          "</h3><p>" +
          safe(p.opening) +
          "</p><p><b>主打利益：</b>" +
          safe(p.benefit) +
          "</p><p><b>第一個畫面：</b>" +
          safe(p.scene) +
          '</p><p class="small-note">' +
          safe(p.description) +
          "</p><i>✓</i></button>",
      )
      .join("") +
    '</div><div class="product-actions"><button class="minor" data-action="product-back-direction">‹ 修改創意方向</button><button class="box-cta" data-action="product-to-script">確認此提案　›</button></div></section>'
  );
}
function productScriptStep() {
  const p = state.productProposals[state.productSelectedProposal] || { title: "影片腳本" };
  const words = state.productScripts.map(s => s.dialogue || "").join("").replace(/\s/g, "").length;
  return `<section class="product-section product-script"><div class="product-section-title"><h3>確認腳本 · ${safe(p.title)}</h3><span>${state.productScripts.length} 個分鏡 · ${state.productDuration} 秒</span></div><div class="row"><button class="minor" data-product-refine="shorten">縮短至目標秒數</button><button class="minor" data-product-refine="hook">強化開場</button><button class="minor" data-product-refine="natural">口吻更自然</button></div><details><summary>文案依據</summary>${state.productSelectedTexts.map(i => `<p>${safe(state.productTexts[i])}</p>`).join("") || '<p>尚未選取文案；請確認商品事實。</p>'}</details><label>整體畫面風格<textarea class="field" id="productScriptStyle">${safe(state.productScriptStyle)}</textarea></label><div class="product-script-list">${state.productScripts.map((s, i) => `<div class="product-script-card"><div class="product-script-head"><b>${i + 1}</b><label>時間<input class="field" data-product-time="${i}" value="${safe(s.time)}"></label><button data-action="product-remove-script" data-index="${i}" aria-label="刪除分鏡 ${i + 1}">×</button></div><label>畫面<textarea class="field" data-product-script="${i}" rows="3">${safe(s.text)}</textarea></label><label>口白<textarea class="field" data-product-dialogue="${i}" rows="2">${safe(s.dialogue || "")}</textarea></label></div>`).join("")}</div><p class="small-note" id="productDialogueEstimate">口白 ${words} 字 · 估計 ${Math.ceil(words / 4)} 秒（以每秒四字估算）</p><div class="product-actions"><button class="minor" data-action="product-back-proposal">‹ 重新選提案</button><button class="minor" data-action="product-reset">重新解析</button><button class="minor" data-action="product-add-script">＋ 加一個分鏡</button><div class="row"><button class="pill" data-panel="model">✦ ${safe(state.model.product)}</button><button class="pill" data-panel="settings">${safe(state.ratio)} · ${safe(state.quality)} · ${state.productDuration}s</button><button class="pill" data-panel="skill">${safe(state.skill)}</button><button class="pill" data-panel="subtitle">字幕：${safe(state.subtitle)}</button><button class="pill" data-panel="presets">儲存設定</button></div><button class="box-cta" data-action="product-submit" ${state.productScripts.length ? "" : "disabled"}>送出生成</button></div></section>`;
}
let productScriptPending = false;
function productScriptInput() {
  return { product: { title: state.productData?.title, price: state.productData?.price }, texts: state.productSelectedTexts.map(i => state.productTexts[i]), direction: structuredClone(state.productDirection), proposal: structuredClone(state.productProposals[state.productSelectedProposal]), duration: state.productDuration };
}
async function productGenerateScript(refine = "") {
  if (productScriptPending) return;
  const input = productScriptInput();
  if (!input.proposal) { SeedStar.notify("請先選擇提案"); return; }
  if (refine) Object.assign(input, { refine, style: state.productScriptStyle, shots: structuredClone(state.productScripts) });
  const original = JSON.stringify(productScriptInput());
  const draftScripts = JSON.stringify([state.productScriptStyle, state.productScripts]);
  productScriptPending = true;
  const buttons = [...document.querySelectorAll('[data-product-refine],[data-action="product-to-script"]')];
  buttons.forEach(b => b.disabled = true);
  SeedStar.notify(refine ? "正在修改腳本…" : "正在展開提案腳本…");
  try {
    const result = await SeedStar.request("/products/script", input);
    if (original !== JSON.stringify(productScriptInput()) || draftScripts !== JSON.stringify([state.productScriptStyle, state.productScripts])) { SeedStar.notify("內容已變更，保留目前草稿；請重新產生。"); return; }
    if (!Array.isArray(result.shots) || !result.shots.length) throw Error("商品腳本格式不正確");
    state.productScripts = result.shots; state.productScriptStyle = result.style; state.productStep = 3;
    if (state.mode === "product") render();
  } catch (error) { SeedStar.reportError(error); }
  finally { productScriptPending = false; buttons.filter(b => b.isConnected).forEach(b => b.disabled = false); }
}
document.addEventListener("click", event => {
  const button = event.target.closest("[data-product-refine]");
  if (button) productGenerateScript(button.dataset.productRefine);
});
async function productParse() {
  if (productParsePending) return;
  productParsePending = true;
  const button = document.querySelector('[data-action="parse"]'); if (button) { button.disabled = true; button.textContent = "解析中…"; }
  const previousProduct = state.productData;
  try {
    const url = ($("productUrl") || {}).value || state.productUrl;
    const u = new URL(url);
    if (u.protocol !== "https:")
      throw Error("請使用公開 HTTPS 商品網址");
    const result = await SeedStar.request("/products/inspect", {
      url: u.href,
    });
    if (state.productData !== previousProduct || state.productStep !== 0) return;
    state.productUrl = u.href;
    state.productData = result.product;
    state.productImages = result.images || [];
    state.productTexts = result.texts || [];
    state.productSelectedImages = [];
    state.productSelectedTexts = [];
    state.productStep = 1;
    render();
    if (result.note) SeedStar.notify(result.note);
  } catch (e) {
    SeedStar.reportError(e);
  } finally { productParsePending = false; if (button?.isConnected) { button.disabled = false; button.textContent = "解析商品網址"; } }
}
async function productGenerateProposals() {
  productCollect();
  try {
    const result = await SeedStar.request("/products/proposals", {
      ...productScriptInput(),
    });
    if (!Array.isArray(result.proposals)) throw Error("提案格式不正確");
    state.productProposals = result.proposals;
    state.productSelectedProposal = 0;
    state.productScripts = [];
    state.productStep = 2;
    render();
  } catch (e) {
    SeedStar.reportError(e);
  }
}
function productCollect() {
  document.querySelectorAll("[data-product-text]").forEach((x) => {
    let i = +x.dataset.productText;
    if (x.checked && !state.productSelectedTexts.includes(i))
      state.productSelectedTexts.push(i);
    if (!x.checked)
      state.productSelectedTexts = state.productSelectedTexts.filter(
        (n) => n !== i,
      );
  });
  document.querySelectorAll("[data-product-field]").forEach((x) => {
    let k = x.dataset.productField;
    if (k === "duration") state.productDuration = +x.value;
    else state.productDirection[k] = x.value;
  });
}
function productSubmit() {
  productCollect();
  state.productScripts.forEach((s, i) => {
    let x = document.querySelector('[data-product-script="' + i + '"]');
    if (x) s.text = x.value;
  });
  const product = {
    url: state.productUrl,
    product: state.productData,
    images: state.productSelectedImages,
    texts: state.productSelectedTexts,
    direction: state.productDirection,
    duration: state.productDuration,
    proposal: state.productProposals[state.productSelectedProposal],
    scripts: state.productScripts,
    scriptStyle: state.productScriptStyle,
  };
  state.data.product = [state.productScriptStyle, ...state.productScripts.map((s) => s.time + " 畫面：" + s.text + " 口白：" + (s.dialogue || ""))].filter(Boolean).join("\n");
  generatorSubmit({
      type: "video",
      mode: "product",
      ...product,
      prompt: state.data.product,
      settings: { model: state.model.product, ratio: state.ratio, quality: state.quality, duration: state.productDuration, audio: state.audio, watermark: state.watermark, subtitle: state.subtitle, subtitleOptions: structuredClone(state.subtitleOptions), skill: state.skill, skills: structuredClone(state.skills) },
      references: {
        images: state.productSelectedImages.map((i) => ({
          name: "商品參考圖",
          type: "image/png",
          url: state.productImages[i],
        })),
      },
    });
}
function productHandleInput(e) {
  let t = e.target;
  if (t.id === "productScriptStyle") state.productScriptStyle = t.value;
  if (t.dataset.productTime !== undefined && state.productScripts[+t.dataset.productTime]) state.productScripts[+t.dataset.productTime].time = t.value;
  if (t.dataset.productDialogue !== undefined && state.productScripts[+t.dataset.productDialogue]) {
    state.productScripts[+t.dataset.productDialogue].dialogue = t.value;
    const words = state.productScripts.map(s => s.dialogue || "").join("").replace(/\s/g, "").length;
    const estimate = document.getElementById("productDialogueEstimate");
    if (estimate) estimate.textContent = `口白 ${words} 字 · 估計 ${Math.ceil(words / 4)} 秒（以每秒四字估算）`;
  }
  if (t.dataset.productField) {
    let k = t.dataset.productField;
    if (k === "duration") state.productDuration = +t.value;
    else state.productDirection[k] = t.value;
  }
  if (t.dataset.productText) {
    let i = +t.dataset.productText;
    if (t.checked && !state.productSelectedTexts.includes(i))
      state.productSelectedTexts.push(i);
    if (!t.checked)
      state.productSelectedTexts = state.productSelectedTexts.filter(
        (n) => n !== i,
      );
  }
  if (t.dataset.productScript) {
    let i = +t.dataset.productScript;
    if (state.productScripts[i]) state.productScripts[i].text = t.value;
  }
}

let productParsePending = false;
const productImagePending = new Set();
async function productSelectImage(index) {
  if (state.productSelectedImages.includes(index)) { state.productSelectedImages = state.productSelectedImages.filter(i => i !== index); render(); return; }
  if (state.productSelectedImages.length >= 9) { SeedStar.notify("最多選擇 9 張商品圖片"); return; }
  const url = state.productImages[index];
  if (!url || productImagePending.has(url)) return;
  productImagePending.add(url);
  try {
    const asset = /^https:/.test(url) ? await SeedStar.request("/products/image", { url }) : { url };
    if (state.productImages[index] !== url || state.productSelectedImages.length >= 9) return;
    state.productImages[index] = asset.url; state.productSelectedImages.push(index);
    if (state.mode === "product") render();
  } catch (error) { SeedStar.reportError(error); }
  finally { productImagePending.delete(url); }
}
