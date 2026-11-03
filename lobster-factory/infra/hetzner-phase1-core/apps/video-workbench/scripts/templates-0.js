const thumbs = [
  "../assets/image-7.jpeg",
  "../assets/image-8.jpeg",
  "../assets/image-9.jpeg",
  "../assets/image-10.jpeg",
  "../assets/image-11.jpeg",
  "../assets/image-12.jpeg",
  "../assets/image-13.jpeg",
  "../assets/image-14.jpeg",
];
const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
const cats = [
  "全部作品",
  "角色創作",
  "產品介紹",
  "創意迷因",
  "寵物主題",
  "教育生活",
  "動作跳舞",
  "建物環境",
  "最新",
  "熱門",
  "最多讚",
];
// The model actually called (backend/generation-policy.cjs via /capabilities, loaded in templates-boot.js).
const videoModel = () => VideoWorkbench.capabilities?.models?.video || "sora-2";
const presets = [
  {
    id: "bear",
    name: "我要離職了",
    category: "創意迷因",
    ratio: "16:9",
    seconds: 29,
    replace: 4,
    author: "alanfeng",
    date: "10-29-26",
    price: 280,
    tag: ["舞台表演", "吉祥物入鏡", "趣味短片"],
    img: thumbs[0],
    prompt:
      "把畫面中的主角人物替換為 @image1，參考 @image2、@image3、@image4。",
  },
  {
    id: "house",
    name: "房屋系列",
    category: "建物環境",
    ratio: "9:16",
    seconds: 30,
    replace: 12,
    author: "alanfeng",
    date: "10-29-26",
    price: 280,
    tag: ["建築", "房屋", "夜景"],
    img: thumbs[1],
    prompt: "保持原影片的鏡頭運動和建築結構，替換指定參考素材。",
  },
  {
    id: "music",
    name: "名畫人物玩音樂",
    category: "創意迷因",
    ratio: "16:9",
    seconds: 30,
    replace: 4,
    author: "alanfeng",
    date: "10-20-26",
    price: 280,
    tag: ["畫廊", "藝術家", "音樂"],
    img: thumbs[2],
    prompt: "把原片人物換成 @image1，保留音樂表演動作。",
  },
  {
    id: "skate",
    name: "滑板・跑車・極限運動",
    category: "動作跳舞",
    ratio: "9:16",
    seconds: 15,
    replace: 7,
    author: "Crista",
    date: "10-29-26",
    price: 280,
    tag: ["滑板", "跑車", "極限運動"],
    img: thumbs[3],
    prompt: "保持滑板與跑車的運動節奏，依照參考圖替換主角或配件。",
  },
  {
    id: "dress",
    name: "換裝模式啟動...",
    category: "角色創作",
    ratio: "9:16",
    seconds: 12,
    replace: 4,
    author: "Crista",
    date: "10-29-26",
    price: 173,
    tag: ["變裝", "換裝轉場", "快速變裝"],
    img: thumbs[7],
    prompt:
      "重作原影片 @video1，將畫面中的主要人物或主體改為 @image1，參考 @image2，參考 @image3，參考 @image4",
  },
  {
    id: "pets",
    name: "你我...甲乙丙丁",
    category: "寵物主題",
    ratio: "9:16",
    seconds: 14,
    replace: 2,
    author: "Crista",
    date: "10-29-26",
    price: 280,
    tag: ["貓咪", "小狗", "爵士鼓", "可愛"],
    img: thumbs[6],
    prompt: "",
  },
];
const state = {
  tab: "模板牆",
  cat: "全部作品",
  search: "",
  sort: "newest",
  template: null,
  favorites: new Set(),
  likes: new Set(),
  mine: [],
  replacements: {},
  resolution: "480p",
  source: "",
  credit: 90,
};
const restored = JSON.parse(
  VideoWorkbench.storage.getItem("workspace.templates") || "null",
);
if (restored) {
  state.mine = Array.isArray(restored.mine) ? restored.mine : [];
  state.favorites = new Set(restored.favorites || []);
  state.likes = new Set(restored.likes || []);
}
const seeds = {
  dress: [
    "參考圖1 @image1",
    "參考圖2 @image2",
    "參考圖3 @image3",
    "參考圖4 @image4",
  ],
  pets: ["原片 @video1", "參考圖1 @image1", "參考圖2 @image2"],
};
function toast(s) {
  $("toast").textContent = s;
  $("toast").hidden = false;
  clearTimeout(window.tt);
  window.tt = setTimeout(() => ($("toast").hidden = true), 3600);
}
function switchTab(t) {
  state.tab = t;
  state.template = null;
  render();
}
function available() {
  let arr =
    state.tab === "我的模板"
      ? state.mine
      : state.tab === "我的收藏"
        ? presets.filter((x) => state.favorites.has(x.id))
        : presets;
  if (
    state.cat !== "全部作品" &&
    !["最新", "熱門", "最多讚"].includes(state.cat)
  )
    arr = arr.filter((x) => x.category === state.cat);
  if (state.search.trim())
    arr = arr.filter((x) =>
      (x.name + " " + x.tag.join(" ") + " " + x.author)
        .toLowerCase()
        .includes(state.search.trim().toLowerCase()),
    );
  if (state.sort === "popular")
    arr = [...arr].sort((a, b) => (b.uses || 0) - (a.uses || 0));
  if (state.sort === "liked")
    arr = [...arr].sort((a, b) => (b.likes || 0) - (a.likes || 0));
  if (state.sort === "newest")
    arr = [...arr].sort((a, b) =>
      String(b.date || "").localeCompare(String(a.date || "")),
    );
  return arr;
}
function render() {
  VideoWorkbench.storage.setItem(
    "workspace.templates",
    JSON.stringify({
      mine: state.mine,
      favorites: [...state.favorites],
      likes: [...state.likes],
    }),
  );
  if (state.template) {
    renderDetail();
    return;
  }
  const arr = available();
  $("root").innerHTML = VideoWorkbench.sanitize(
    `<div class="top"><span>AWAREWAVE · 模板牆</span><span>◎ 繁　♧　✦ ${state.credit} PTS</span></div><main class="wrap"><div class="eyebrow">生成模板 · TEMPLATES</div><h1 class="headline">借用一支影片的<span class="gradient">完整配方</span>，換上你的素材</h1><p class="lede">每個模板都來自一支真實生成過的影片，保留它的提示詞、參考素材與參數。<br>把作者開放的素材換成你自己的，就能生成同款影片。</p><div class="toolrow"><div class="tabs">${["模板牆", "我的模板", "我的收藏"].map((t) => `<button class="tab ${state.tab === t ? "sel" : ""}" data-tab="${t}">${t}</button>`).join("")}</div><div class="row"><input class="search" id="search" placeholder="⌕ 搜尋模板名稱、說明或標籤" value="${esc(state.search)}"><button class="primary" id="create">＋ 建立模板</button></div></div><div class="sorts"><span class="muted">排序</span>${[
      ["newest", "最新"],
      ["popular", "最多使用"],
      ["liked", "最多讚"],
    ]
      .map(
        ([k, label]) =>
          `<button class="sort ${state.sort === k ? "sel" : ""}" data-sort="${k}">${label}</button>`,
      )
      .join(
        "",
      )}</div><div class="filters">${cats.map((c) => `<button class="pill ${state.cat === c ? "sel" : ""}" data-cat="${c}">${c}</button>`).join("")}</div>${arr.length ? `<div class="cards">${arr.map((t) => `<article class="card" data-id="${t.id}"><div class="cover"><img src="${t.img}" alt="${esc(t.name)} 參考截圖"><span class="bubble">${t.ratio} · ${t.seconds} 秒</span><span class="bubble right">可替換 ${t.replace} 項</span></div><div class="cardbody"><h3>${esc(t.name)}</h3><div>${t.tag.map((x) => `<span class="tag">#${esc(x)}</span>`).join("")}</div><div class="cardfoot">◉ ${esc(t.author)}</div><div class="cardfoot">${t.uses || 0} 次使用 · ${esc(t.date)}</div><div class="cardactions"><button class="secondary" data-fav="${t.id}">${state.favorites.has(t.id) ? "♥" : "♡"} 收藏</button><span class="muted">◉ ${t.id === "dress" ? 1 : 2}</span></div></div></article>`).join("")}</div>` : `<div class="empty"><h2>${state.tab === "我的模板" ? "還沒有模板" : state.tab === "我的收藏" ? "還沒有收藏" : "沒有符合條件的模板"}</h2><p>可以建立自己的模板，或回到模板牆尋找作品。</p><button class="primary" id="emptyCreate">＋ 建立模板</button></div>`}</main>`,
  );
  $("root").onclick = (e) => {
    const b = e.target.closest("button"),
      card = e.target.closest("[data-id]");
    if (b?.dataset.tab) {
      state.tab = b.dataset.tab;
      render();
    } else if (b?.dataset.sort) {
      state.sort = b.dataset.sort;
      render();
    } else if (b?.dataset.cat) {
      state.cat = b.dataset.cat;
      render();
    } else if (b?.dataset.fav) {
      const id = b.dataset.fav;
      state.favorites.has(id)
        ? state.favorites.delete(id)
        : state.favorites.add(id);
      render();
    } else if (b?.id === "create" || b?.id === "emptyCreate") {
      createDialog();
    } else if (card) {
      state.template = presets
        .concat(state.mine)
        .find((x) => x.id === card.dataset.id);
      state.replacements = {};
      state.resolution = "480p";
      render();
    }
  };
  $("search").oninput = (e) => {
    const s = e.target.selectionStart;
    state.search = e.target.value;
    render();
    $("search").focus();
    $("search").setSelectionRange(s, s);
  };
}
function renderDetail() {
  let t = state.template;
  let assets =
    seeds[t.id] ||
    Array.from(
      {
        length: Math.min(t.replace, 12),
      },
      (_, i) => `參考圖${i + 1} @image${i + 1}`,
    );
  let prompt = t.prompt || "此模板提示詞不公開";
  let restricted = !t.prompt;
  $("root").innerHTML = VideoWorkbench.sanitize(
    `<div class="top"><span>AWAREWAVE · 模板牆</span><span>◎ 繁　♧　✦ ${state.credit} PTS</span></div><main class="detail"><button class="back" id="back">‹ 返回模板牆</button><div class="detailgrid"><div><div class="poster"><img src="${t.img}" alt="${esc(t.name)} 示意圖（來自參考截圖）"></div><h1 class="detailname">${esc(t.name)}</h1>'<p class="muted">${t.tag.map((x) => "#" + x).join("　")}</p></div><div><div class="section"><div class="row" style="justify-content:space-between"><h3>提示詞</h3><span class="muted">${restricted ? "已隱藏" : "可修改"}</span></div>${restricted ? `<div class="notice">此模板提示詞不公開</div>` : `<textarea id="prompt" class="prompt">${esc(prompt)}</textarea><div class="muted">提示詞中的 @image1 等代號，對應下方素材。</div>`}</div><div class="section"><h3>素材</h3><p class="muted">把開放的素材換成你自己的；沒有更換的會沿用模板原本的素材。</p><div class="assets">${assets
      .map((a, i) => {
        let key = "a" + i;
        let replacement = state.replacements[key];
        return `<div class="asset"><img src="${replacement?.url || t.img}" alt="${esc(a)}"><div class="label">${esc(a)}</div><div class="row"><button data-replace="${i}">替換</button></div></div>`;
      })
      .join(
        "",
      )}</div></div><div class="section"><h3>參數</h3><div class="fields"><div><label>模型</label><select id="modelSelect">${[videoModel()].map((model) => `<option selected>${esc(model)}</option>`).join("")}</select></div><div><label>解析度</label><select id="resolution">${["720p"].map((r) => `<option ${r === state.resolution ? "selected" : ""}>${r}</option>`).join("")}</select></div></div></div><div class="section"><p class="muted">帶入後可檢查提示詞與素材，再依 API 用量計費生成。</p><button class="primary" id="generate" style="width:100%">▷ 帶入生成頁</button></div></div></div></main>`,
  );
  $("root").onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    let a = b.dataset;
    if (b.id === "back") {
      state.template = null;
      render();
    } else if (b.id === "share") {
      navigator.clipboard?.writeText(location.href).then(
        () => toast("已複製頁面網址"),
        () => toast("無法複製連結"),
      );
    } else if (b.id === "report") {
      toast("檢舉功能需要正式後端");
    } else if (b.id === "like") {
      state.likes.has(t.id) ? state.likes.delete(t.id) : state.likes.add(t.id);
      render();
    } else if (b.id === "favDetail") {
      state.favorites.has(t.id)
        ? state.favorites.delete(t.id)
        : state.favorites.add(t.id);
      render();
    } else if (a.replace !== undefined) {
      selectFile(+a.replace);
    } else if (b.id === "generate") {
      useTemplate(t);
    }
  };
  $("resolution").onchange = (e) => (state.resolution = e.target.value);
  if ($("modelSelect"))
    $("modelSelect").onchange = (e) => {
      t.model = e.target.value;
      toast("模型已更新");
    };
  if ($("prompt"))
    $("prompt").oninput = (e) => {
      t.prompt = e.target.value;
    };
}
async function useTemplate(t) {
  const prompt = ($("prompt")?.value || t.prompt || "").trim();
  if (!prompt) {
    toast("此模板沒有可用提示詞");
    return;
  }
  try {
    const bridge = VideoWorkbench.generator;
    if (bridge?.import) {
      const result = await bridge.import({
        target: "reference",
        title: t.name,
        image:
          Object.values(state.replacements)[0]?.url ||
          new URL(t.img, location.href).pathname,
        imagePrompt: prompt,
        videoPrompt: prompt,
        duration: t.seconds,
        model: videoModel(),
      });
      if (result?.ok) {
        VideoWorkbench.navigate("generator");
        toast("已帶入生成影片頁，可繼續修改後送出");
        return;
      }
      toast(result?.message || "帶入生成頁失敗");
      return;
    }
  } catch (e) {
    toast("無法帶入生成頁：" + e.message);
    return;
  }
  toast("模板已套用；請回到生成影片頁完成送出");
}
async function selectFile(i) {
  try {
    const rows = await VideoWorkbench.pickAssets({
      kind: "image",
    });
    if (rows[0]) {
      state.replacements["a" + i] = rows[0];
      renderDetail();
    }
  } catch (e) {
    VideoWorkbench.reportError(e);
  }
}
function createDialog() {
  $("overlay").hidden = false;
  $("dialogContent").innerHTML = VideoWorkbench.sanitize(
    `<h2>建立模板</h2><p class="muted">新增自己的模板，需有已完成影片和參考素材才能正式發佈。</p><label>模板名稱</label><input id="templateName" maxlength="100" placeholder="輸入模板標題"><label>說明</label><textarea id="templateDescription" rows="3" placeholder="模板說明"></textarea><label>分類</label><select id="templateCategory">${cats
      .slice(1, 8)
      .map((x) => `<option>${x}</option>`)
      .join(
        "",
      )}</select><div class="row" style="justify-content:flex-end"><button class="secondary" id="cancelCreate">取消</button><button class="primary" id="saveCreate">建立草稿</button></div>`,
  );
  $("dialogContent").onclick = (e) => {
    if (e.target.id === "cancelCreate") $("overlay").hidden = true;
    if (e.target.id === "saveCreate") {
      let name = $("templateName").value.trim();
      if (!name) {
        toast("請輸入模板名稱");
        return;
      }
      const item = {
        ...presets[0],
        id: "own" + Date.now(),
        name,
        category: $("templateCategory").value,
        author: "我",
        img: thumbs[0],
        tag: [],
        prompt: $("templateDescription").value.trim(),
        description: $("templateDescription").value.trim(),
        price: 0,
        replace: 0,
      };
      state.mine.push(item);
      state.tab = "我的模板";
      state.cat = "全部作品";
      state.search = "";
      $("overlay").hidden = true;
      render();
      toast("已建立本機模板草稿（未發佈）");
    }
  };
}
$("overlay").onclick = (e) => {
  if (e.target.id === "overlay") $("overlay").hidden = true;
};
render();
