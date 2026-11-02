const $ = (id) => document.getElementById(id);
let tab = "library",
  fav = false,
  selected = null,
  editMode = false,
  subtab = "basic",
  wardrobeType = "服裝",
  refs = [],
  garments = [],
  accessories = [],
  quickStyle = "預設（寫實）",
  style = "預設（寫實）",
  draft = {
    name: "",
    description: "",
    tags: "",
  },
  voiceCount = 2,
  angles = [],
  my = (() => {
    try {
      return JSON.parse(
        SeedStar.storage.getItem("seedstar.characters") || "[]",
      );
    } catch {
      return [];
    }
  })();
const STYLE = [
  "預設（寫實）",
  "日系電影感",
  "賽博霓虹",
  "清透紀實",
  "復古膠片",
  "卡通動漫",
  "黑白電影",
  "黃金時刻",
  "夢幻粉彩",
];
function art(bg, fg, label) {
  return (
    "data:image/svg+xml;charset=utf-8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 560"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="${bg}"/><stop offset="1" stop-color="#111018"/></linearGradient></defs><rect width="420" height="560" fill="url(#g)"/><circle cx="210" cy="185" r="86" fill="${fg}" opacity=".86"/><path d="M82 560c13-122 76-186 128-186s115 64 128 186" fill="${fg}" opacity=".76"/><path d="M128 171c11-75 154-92 177 8-30-34-54-44-83-34-27-20-60-10-94 26z" fill="#17141c" opacity=".9"/><text x="210" y="505" text-anchor="middle" fill="#fff" font-family="sans-serif" font-size="25" font-weight="700">${label}</text></svg>`,
    )
  );
}

const demo = [
  {
    name: "田中 健一",
    age: 47,
    gender: "男",
    country: "日本",
    description: "平日面對嚴肅，週末為全家人默默操心。",
    intro:
      "出生並成長於大阪近郊，年輕時曾是高中棒球隊的捕手。如今在大型企業擔任業務經理，習慣把照顧家人放在第一位。",
    tags: ["親切", "沉穩", "熱情", "顧家"],
    lines: [
      "「每每天的生活變得更加輕鬆，就是我想要傳達的安心感。」",
      "「想煮出一鍋讓滿屋子都聞得到的牛肉咖哩，一只厚底的鑄鐵鍋絕對少不了。」",
      "「只要看著全家人笑著圍坐在餐桌旁，這一週所有的忙碌就都值得了。」",
    ],
    image: art("#71859a", "#dce6ee", "田中 健一"),
    assets: [
      ["西裝正面", "#d4dbe3"],
      ["西裝背面", "#455568"],
      ["公事包", "#876e59"],
      ["眼鏡", "#68717a"],
      ["手錶", "#9ba8b6"],
      ["識別證", "#e2b94e"],
    ],
  },
  {
    name: "田中 惠美",
    age: 44,
    gender: "女",
    country: "日本",
    description: "清晨四點的揉麵香，是全家醒來的溫暖晨光。",
    intro:
      "惠美在大阪郊區長大，年輕時曾在市內的西洋麵包坊學藝。婚後隨著三個孩子陸續上學，開了一家在家旁的小烘焙坊。",
    tags: ["溫柔", "勤勉", "親切", "堅韌"],
    lines: [
      "「聽這個酥脆的聲音，今天的酸種麵包肯定很棒。」",
      "「剛出爐的紅豆麵包熱軟，是一天最棒的享受。」",
      "「只要看到孩子們大口吃著麵包，所有的早起都值得了。」",
    ],
    image: art("#8a625b", "#e6c6b5", "田中 惠美"),
    assets: [
      ["圍裙", "#efe3ca"],
      ["針織外套", "#9b8a78"],
      ["麵包籃", "#caa37a"],
      ["手錶", "#b19e88"],
      ["托特包", "#e4d5bf"],
      ["麵包", "#d3a15e"],
    ],
  },
  {
    name: "田中 葵",
    age: 16,
    gender: "女",
    country: "日本",
    description: "吹奏部的小號手，心裡裝著東京的天空。",
    intro:
      "葵在大阪近郊長大，身為長女，總習慣了照顧弟妹。她喜歡音樂與攝影，夢想有一天能站上世界最大的舞台。",
    tags: ["責任心強", "極具創意", "聰明沉著", "內敏堅毅"],
    lines: [
      "「管樂組的大夥兒，我們從第四小節再合奏一次吧！」",
      "「早晨剛出爐的熱騰騰麵包，絕對是世界上最棒的！」",
      "「即使再普通，只要在夜空下練習，我就能充滿信念。」",
    ],
    image: art("#4f7890", "#eadbd8", "田中 葵"),
    assets: [
      ["制服正面", "#dbe4ed"],
      ["制服背面", "#26374e"],
      ["社團外套", "#b9c4cf"],
      ["書包", "#33455c"],
      ["相機", "#4a5261"],
      ["樂器盒", "#212b38"],
    ],
  },
  {
    name: "田中 輝太",
    age: 10,
    gender: "男",
    country: "日本",
    description: "跑遍公園草叢的小昆蟲博士。",
    intro:
      "輝太在大阪近郊長大，最喜歡探索公園裡的昆蟲。每次帶著放大鏡出門，都會把新發現記在小筆記本裡。",
    tags: ["好奇", "精力充沛", "樂天", "天真率直"],
    lines: [
      "「快看這棵樹枝，上面停著一隻超大獨角仙！」",
      "「想要找出最酷的昆蟲，一定要帶一本圖鑑！」",
      "「冒險回來後，腦袋裡的麵包香幸福極了！」",
    ],
    image: art("#7b9b63", "#f0c85d", "田中 輝太"),
    assets: [
      ["黃色上衣", "#eac045"],
      ["短褲", "#b7a98e"],
      ["外套", "#28364f"],
      ["望遠鏡", "#49a38d"],
      ["昆蟲盒", "#d2d2ce"],
      ["草帽", "#b79e63"],
    ],
  },
];
demo.forEach((c, i) => {
  c.id = "catalog-" + i;
  const saved = my.find((x) => x.id === c.id);
  if (saved) Object.assign(c, saved);
});
my = my.filter((c) => !c.id?.startsWith("catalog-"));
document.addEventListener("seedstar:changed", () => {
  my = JSON.parse(
    SeedStar.storage.getItem("seedstar.characters") || "[]",
  ).filter((c) => !c.id?.startsWith("catalog-"));
});
function esc(s) {
  return String(s ?? "").replace(
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
}
function toast(s) {
  $("toast").textContent = s;
  $("toast").style.display = "block";
  setTimeout(() => ($("toast").style.display = "none"), 3000);
}
function openModal(title, inner, foot = "", small = false) {
  $("modalTitle").textContent = title;
  $("modalInner").innerHTML = SeedStar.sanitize(inner);
  $("modalFoot").innerHTML = SeedStar.sanitize(foot);
  $("modal").classList.toggle("small", small);
  $("back").classList.add("show");
  document.body.style.overflow = "hidden";
}
function closeModal() {
  $("back").classList.remove("show");
  document.body.style.overflow = "";
}
$("close").onclick = closeModal;
$("back").onclick = (e) => {
  if (e.target === $("back")) closeModal();
};
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});
function render() {
  document
    .querySelectorAll("#topTabs button")
    .forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  $("libraryNotice").classList.toggle("hidden", tab !== "library");
  $("filters").classList.toggle("hidden", tab !== "library");
  $("createBtn").classList.toggle("hidden", tab === "library");
  $("search").placeholder =
    tab === "mine" ? "搜尋我的角色…" : "搜尋名字、性別、國籍、年齡、職業…";
  let items = (tab === "library" ? demo : tab === "mine" ? my : []).filter(
    (c) => {
      let q = $("search").value.toLowerCase();
      return (
        (!q ||
          [c.name, c.description, c.gender, c.country, c.age]
            .join(" ")
            .toLowerCase()
            .includes(q)) &&
        (tab !== "library" ||
          ((!$("gender").value || c.gender === $("gender").value) &&
            (!$("age").value ||
              ($("age").value === "child"
                ? c.age < 13
                : $("age").value === "teen"
                  ? c.age >= 13 && c.age < 18
                  : c.age >= 18)) &&
            (!$("country").value || c.country === $("country").value) &&
            (!fav || c.fav)))
      );
    },
  );
  $("count").textContent =
    tab === "library" ? `${items.length} 位示範角色` : `${items.length} 個角色`;
  $("gallery").innerHTML = SeedStar.sanitize(
    items
      .map(
        (c, i) =>
          `<article class="character" data-act="open" data-i="${i}" tabindex="0"><img src="${esc(c.image)}" alt="${esc(c.name)}" onerror="this.style.display='none'"><div class="cbody"><strong>${esc(c.name)}</strong><p>${esc(c.country || "")} · ${esc(c.age || "")} 歲 · ${esc(c.gender || "")}</p><p>${esc(c.description || "")}</p><div style="display:flex;gap:7px;margin:8px 0"><button class="btn" data-act="listen" data-i="${i}">▷ 聽聲音</button>${tab === "mine" ? `<button class="btn" data-act="edit" data-i="${i}">編輯角色</button>` : `<button class="btn" data-act="fav" data-i="${i}">${c.fav ? "★" : "☆"}</button>`}</div><button class="btn wide" data-act="add" data-i="${i}">＋ 加入素材庫</button></div></article>`,
      )
      .join(""),
  );
  $("empty").classList.toggle(
    "hidden",
    items.length !== 0 || $("search").value !== "",
  );
  if (!items.length && $("search").value)
    $("gallery").innerHTML = SeedStar.sanitize(
      '<p class="muted">沒有符合條件的角色</p>',
    );
  window.visibleItems = items;
}
document.querySelectorAll("#topTabs button").forEach(
  (x) =>
    (x.onclick = () => {
      tab = x.dataset.tab;
      $("search").value = "";
      render();
    }),
);
$("search").oninput = render;
["gender", "age", "country"].forEach((id) => ($(id).onchange = render));
$("favorite").onclick = () => {
  fav = !fav;
  $("favorite").textContent = fav ? "★ 只看收藏" : "☆ 只看收藏";
  render();
};
$("clear").onclick = () => {
  $("gender").value = $("age").value = $("country").value = "";
  fav = false;
  render();
};
$("createBtn").onclick = $("emptyCreate").onclick = quickCreate;
$("gallery").onclick = (e) => {
  let b = e.target.closest("[data-act]");
  if (!b) return;
  let c = window.visibleItems[+b.dataset.i];
  if (!c) return;
  if (b.dataset.act === "open") {
    detailModal(c);
    return;
  }
  if (b.dataset.act === "listen") {
    if (c.voice?.url) new Audio(c.voice.url).play().catch(SeedStar.reportError);
    else {
      SeedStar.speak(c.intro || c.description || c.name);
      toast("系統語音試聽");
    }
  }
  if (b.dataset.act === "fav") {
    c.fav = !c.fav;
    SeedStar.characters.save(c).catch(SeedStar.reportError);
    render();
  }
  if (b.dataset.act === "add") {
    c.inLibrary = true;
    SeedStar.characters.save(c).catch(SeedStar.reportError);
    toast("已加入素材庫，可在生成影片時引用");
  }
  if (b.dataset.act === "edit") {
    selected = c;
    draft = {
      ...c,
    };
    refs = c.references || [];
    garments = c.garments || [];
    accessories = c.accessories || [];
    style = c.style || STYLE[0];
    editMode = true;
    subtab = "basic";
    fullEditor();
  }
};
function closeDetailPage() {
  const root = $("detailRoot");
  if (root) root.remove();
  document.querySelector("main")?.removeAttribute("hidden");
  document.body.classList.remove("detail-open");
  render();
}
function detailModal(c) {
  let root = $("detailRoot");
  if (!root) {
    root = document.createElement("div");
    root.id = "detailRoot";
    document.body.appendChild(root);
  }
  document.querySelector("main").setAttribute("hidden", "");
  document.body.classList.add("detail-open");
  root.innerHTML = SeedStar.sanitize(
    `<div class="detail-page"><div class="detail-page-head"><div><div class="crumb">角色　/　示範角色庫</div><h1>角色詳情</h1></div><button class="btn outline" data-detail="back">← 返回角色庫</button></div><div class="detail-page-grid"><div><div class="detail-page-preview"><img src="${esc(c.image)}" alt="${esc(c.name)}"><span class="play-badge">▷ 角色預覽</span></div></div><div class="detail-page-copy"><h2>${esc(c.name)}</h2><p class="meta">${esc(c.country)} · ${esc(c.age)} 歲 · ${esc(c.gender)}</p><p class="slogan">${esc(c.description)}</p><h3>自我介紹</h3><p>${esc(c.intro || "這是一位可以在影片中直接引用的角色。")}</p><h3>角色台詞</h3><div class="detail-page-lines">${(c.lines || []).map((line) => `<button class="detail-page-line" data-detail="line"><span>▷</span>${esc(line)}</button>`).join("")}</div><div class="detail-page-tags">${(c.tags || []).map((t) => `<span>${esc(t)}</span>`).join("")}</div></div></div><section class="detail-page-assets"><h3>服裝與配件</h3><div class="detail-page-asset-grid">${(c.assets || []).map(([name, color]) => `<div class="detail-page-asset"><div class="detail-page-asset-art" >${esc(name)}</div><small>${esc(name)}</small></div>`).join("")}</div></section><div class="detail-page-footer"><button class="btn" data-detail="favorite">${c.fav ? "★ 已收藏" : "☆ 加入最愛"}</button><button class="btn" data-detail="add">＋ 加入素材庫</button><button class="btn primary" data-detail="generate">✧ 加入並前往生成</button></div></div>`,
  );
  root.onclick = (e) => {
    const b = e.target.closest("[data-detail]");
    if (!b) return;
    const a = b.dataset.detail;
    if (a === "back") closeDetailPage();
    if (a === "line") SeedStar.speak(b.innerText.replace("▷", ""));
    if (a === "favorite") {
      c.fav = !c.fav;
      SeedStar.characters.save(c).catch(SeedStar.reportError);
      detailModal(c);
    }
    if (a === "add") {
      c.inLibrary = true;
      SeedStar.characters.save(c).catch(SeedStar.reportError);
      toast("已加入素材庫，可在生成影片時引用");
    }
    if (a === "generate") {
      c.inLibrary = true;
      SeedStar.characters.save(c).catch(SeedStar.reportError);
      closeDetailPage();
      SeedStar.navigate("generator");
    }
  };
}
function styleButtons(value, fn) {
  return `<div class="styles">${STYLE.map((s) => `<button data-${fn}="${esc(s)}" class="${value === s ? "active" : ""}">◩ ${esc(s)}</button>`).join("")}</div>`;
}
function quickCreate() {
  openModal(
    "建立角色",
    `<div style="text-align:center"><p style="color:var(--accent);font-size:calc(var(--font-size-xl) * 1.04167)">✧</p><b>描述一次，AI 幫你建立角色</b><p class="muted">用一句話描述角色，AI 產生人設與主圖草稿，你再微調。</p></div><textarea id="quickPrompt" class="input" rows="3" maxlength="2000" placeholder="用一句話描述這個角色，例如：二十歲雙馬尾少女，冷靜寡言"></textarea><p style="text-align:center" class="muted">風格</p>${styleButtons(quickStyle, "quickstyle")}<p class="muted">此風格會引導 AI 生成主參考圖、角色表與延伸角度素材；選「預設（寫實）」則使用寫實風格。</p><button class="btn" id="quickQuestions">✧ 問我幾個問題</button><div style="text-align:center;margin:14px 0"><button id="quickGenerate" class="btn primary">✧ 生成角色草稿（約 7 點）</button></div><div class="pills" style="justify-content:center"><button data-start="upload">↑ 上傳照片當基準</button><button data-start="library">▧ 用一張素材當基準</button><button data-start="manual">✎ 手動建立</button></div>`,
    "",
    true,
  );
  $("modalInner").onclick = async (e) => {
    let b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.quickstyle) {
      quickStyle = b.dataset.quickstyle;
      quickCreate();
    } else if (b.id === "quickGenerate") {
      let prompt = $("quickPrompt").value.trim();
      if (!prompt) return toast("請先描述角色");
      try {
        const result = await SeedStar.request("/characters/draft", {
          prompt,
          style: quickStyle,
        });
        draft = {
          ...result,
          tags: Array.isArray(result.tags)
            ? result.tags.join(",")
            : result.tags || "",
          style: quickStyle,
        };
      } catch (e) {
        SeedStar.reportError(e);
        return;
      }
      style = quickStyle;
      refs = [];
      garments = [];
      accessories = [];
      editMode = false;
      subtab = "basic";
      fullEditor();
    } else if (b.id === "quickQuestions")
      SeedStar.request("/characters/questions", {
        prompt: $("quickPrompt").value,
      })
        .then((r) => {
          const p = document.createElement("p");
          p.textContent = r.questions;
          $("modalInner").append(p);
        })
        .catch(SeedStar.reportError);
    else if (b.dataset.start) {
      draft = {
        name: "",
        description: "",
        tags: "",
        style: quickStyle,
      };
      style = quickStyle;
      refs = [];
      garments = [];
      accessories = [];
      editMode = false;
      subtab = "basic";
      fullEditor();
      if (b.dataset.start === "upload") startUpload("refs");
      if (b.dataset.start === "library")
        requestCharacterAction("素材庫引用需串接現有素材 API");
    }
  };
}
function persist() {
  SeedStar.storage.setItem("seedstar.characters", JSON.stringify(my));
}
function currentValues() {
  let n = $("charName"),
    d = $("charDescription"),
    t = $("charTags");
  if (n) draft.name = n.value;
  if (d) draft.description = d.value;
  if (t) draft.tags = t.value;
}
function fullEditor() {
  let nav = `<div class="tabs2"><button data-sub="basic" class="${subtab === "basic" ? "active" : ""}">基本設定</button><button data-sub="wardrobe" class="${subtab === "wardrobe" ? "active" : ""}">服裝與配件 ${garments.length + accessories.length}/20</button><button data-sub="extend" class="${subtab === "extend" ? "active" : ""}">延伸生成</button></div>`;
  let main =
    subtab === "basic"
      ? `<label>名稱 <span class="muted">0/120</span></label><input id="charName" class="input" maxlength="120" value="${esc(draft.name)}" placeholder="例如：女主角 小美"><label>角色設定 <span class="muted">0/2000</span></label><textarea id="charDescription" class="input" rows="5" maxlength="2000" placeholder="外觀、個性、服裝等，會用於生成">${esc(draft.description)}</textarea><label>風格</label>${styleButtons(style, "style")}<p class="muted">此風格會引導 AI 生成主參考圖、角色表與延伸角度素材；選「預設（寫實）」則使用寫實風格。<br>已有主圖時，角色表與延伸素材也會參考主圖外觀，若主圖風格不同，生成結果可能偏向主圖。</p><label>標籤</label><input id="charTags" class="input" value="${esc(draft.tags)}" placeholder="以逗號分隔，例如：女主角, 現代, 長髮">`
      : subtab === "wardrobe"
        ? `<p class="muted">獨立保存的服裝與配件，不會改變角色主圖或臉部參考。</p><div class="seg" style="width:max-content"><button data-type="服裝" class="${wardrobeType === "服裝" ? "active" : ""}">服裝</button><button data-type="配件" class="${wardrobeType === "配件" ? "active" : ""}">配件</button></div><div class="thumbs">${(wardrobeType === "服裝" ? garments : accessories).map((src, i) => `<div class="thumb"><img src="${src}"><button data-remove-wardrobe="${i}">×</button></div>`).join("")}<div class="drop" style="width:132px;min-height:175px" data-upload="wardrobe">↑<br>上傳圖片</div></div><div class="box" style="margin-top:20px"><label>描述要生成的物件（白底）</label><textarea id="wardrobePrompt" class="input" rows="3" placeholder="例如：深藍色金邊制服外套，正面平鋪"></textarea><div style="text-align:right"><button class="btn primary" id="wardrobeGenerate">✧ AI 生成白底圖 · 5 點</button></div></div>`
        : `<div class="extensions"><button class="ext" data-extension="ai"><b>✧　AI 生成設定圖　›</b><small>用文字描述，AI 產生人設與參考圖</small></button><button class="ext" data-extension="angles"><b>▦　角色表(多角度・表情)　›</b><small>以主圖為基準，一次生成多角度／表情參考圖</small></button><button class="ext" data-extension="sheet"><b>▤　角色設定圖　›</b><small>生成一張可下載的角色介紹海報（含資料欄文字）</small></button><button class="ext" data-extension="voice"><b>◉　角色聲音　›</b><small>生成並選定角色的聲音，引用角色時可一起帶入</small></button><button class="ext" data-extension="test"><b>▷　試鏡(測試能否生成影片)　›</b><small>花少量點數實測這個角色能否順利生成影片</small></button></div>`;
  let left = `<div class="leftPane"><div class="muted">參考圖 <span style="float:right">${refs.length}/8</span></div><div class="drop big" data-upload="refs">${refs.length ? `<img class="photostage" src="${refs[0]}">` : "↑<br>上傳"}</div><div class="thumbs">${refs.map((src, i) => `<div class="thumb"><img src="${src}"><button data-remove-ref="${i}">×</button></div>`).join("")}<button class="btn" data-upload="refs">↑ 上傳</button><button class="btn" data-library="1">▧ 從素材庫選取</button></div><div class="box" style="margin-top:15px"><span class="muted">生成一致性</span><p class="smalltext">無遮擋直接引用</p></div></div>`;
  openModal(
    editMode ? "編輯角色" : "建立角色",
    `<div class="create-grid">${left}<div class="rightPane">${nav}${main}</div></div>`,
    `<button class="btn" id="deleteChar" style="margin-right:auto;${!editMode ? "display:none" : ""}">刪除</button><button class="btn" id="lockAppearance" style="${!editMode ? "display:none" : ""}">♙ 鎖定外觀</button><button class="btn" id="cancel">取消</button><button class="btn primary" id="save">儲存</button>`,
  );
  $("modalInner").onclick = async (e) => {
    let b = e.target.closest("button,[data-upload]");
    if (!b) return;
    if (b.dataset.sub) {
      currentValues();
      subtab = b.dataset.sub;
      fullEditor();
    } else if (b.dataset.style) {
      currentValues();
      style = b.dataset.style;
      fullEditor();
    } else if (b.dataset.type) {
      wardrobeType = b.dataset.type;
      fullEditor();
    } else if (b.dataset.upload) {
      startUpload(b.dataset.upload);
    } else if (b.dataset.library)
      requestCharacterAction("從素材庫選取需串接你的素材庫 API");
    else if (b.dataset.removeRef !== undefined) {
      refs.splice(+b.dataset.removeRef, 1);
      fullEditor();
    } else if (b.dataset.removeWardrobe !== undefined) {
      (wardrobeType === "服裝" ? garments : accessories).splice(
        +b.dataset.removeWardrobe,
        1,
      );
      fullEditor();
    } else if (b.dataset.extension) extension(b.dataset.extension);
    else if (b.id === "wardrobeGenerate")
      requestCharacterAction("白底圖生成需串接 AI 圖像模型 API");
  };
  $("modalFoot").onclick = (e) => {
    let b = e.target.closest("button");
    if (!b) return;
    if (b.id === "cancel") closeModal();
    else if (b.id === "save") {
      currentValues();
      if (!draft.name.trim()) return toast("請填寫角色名稱");
      let char = {
        ...draft,
        id: editMode ? selected.id : draft.id || crypto.randomUUID(),
        style,
        references: [...refs],
        garments: [...garments],
        accessories: [...accessories],
        image: refs[0] || "",
        gender: "",
        country: "",
        age: "",
      };
      if (editMode) {
        const i = my.findIndex((c) => c.id === char.id);
        if (i >= 0) my[i] = char;
        else my.push(char);
      } else my.push(char);
      persist();
      tab = "mine";
      closeModal();
      render();
      toast("角色已儲存到本機角色庫");
    } else if (b.id === "deleteChar") {
      if (confirm("確定刪除這個角色？")) {
        my = my.filter((c) => c.id !== selected.id);
        persist();
        closeModal();
        render();
      }
    } else if (b.id === "lockAppearance")
      ((selected.locked = !selected.locked),
        SeedStar.characters
          .save(selected)
          .then(() => toast(selected.locked ? "外觀已鎖定" : "外觀已解鎖"))
          .catch(SeedStar.reportError));
  };
}
function startUpload(kind) {
  window.uploadKind = kind;
  $("filePick").multiple = kind === "refs";
  $("filePick").click();
}
$("filePick").onchange = async (e) => {
  let files = [...e.target.files];
  let target =
      window.uploadKind === "refs"
        ? refs
        : wardrobeType === "服裝"
          ? garments
          : accessories,
    limit = window.uploadKind === "refs" ? 8 : 20;
  for (let f of files.slice(0, Math.max(0, limit - target.length))) {
    if (!f.type.startsWith("image/")) continue;
    try {
      target.push((await SeedStar.uploadAsset(f)).url);
      fullEditor();
    } catch (e) {
      SeedStar.reportError(e);
    }
  }
  e.target.value = "";
};
function extension(kind) {
  if (kind === "voice") return voiceModal();
  if (kind === "sheet") return sheetModal();
  if (kind === "ai") return extendedAI();
  if (kind === "angles") return anglesPanel();
  if (kind === "test") return testPanel();
}
function returnEditor() {
  subtab = "extend";
  fullEditor();
}
function extendedAI() {
  openModal(
    "AI 生成設定圖",
    `<p class="smalltext">用文字描述，AI 產生人設與參考圖</p><textarea id="aiPrompt" class="input" rows="4" placeholder="用一句話描述這個角色，例如：二十歲雙馬尾少女，冷靜寡言"></textarea><div style="margin-top:14px"><button class="btn" id="ask">問我幾個問題</button> <button class="btn" id="generateRole">AI 產生人設（API 計費）</button></div><p><button class="btn primary" id="generateMain">生成主圖（API 計費）</button></p>`,
    `<button class="btn" id="backEdit">返回編輯</button>`,
  );
  $("modalInner").onclick = async (e) => {
    const prompt = $("aiPrompt")?.value?.trim();
    if (!prompt) return toast("請先輸入角色描述");
    if (e.target.id === "ask") {
      try {
        const r = await SeedStar.request("/characters/questions", { prompt });
        const p = document.createElement("p");
        p.textContent = r.questions;
        $("modalInner").append(p);
      } catch (e) {
        SeedStar.reportError(e);
      }
    } else if (e.target.id === "generateRole") {
      try {
        const r = await SeedStar.request("/characters/draft", { prompt });
        draft = {
          ...draft,
          ...r,
          tags: Array.isArray(r.tags) ? r.tags.join(",") : r.tags,
        };
        returnEditor();
      } catch (e) {
        SeedStar.reportError(e);
      }
    } else if (e.target.id === "generateMain")
      requestCharacterAction("角色主圖");
  };
  $("modalFoot").onclick = returnEditor;
}
function anglesPanel() {
  let choices = ["正面", "¾ 側", "側面", "背面", "微笑", "生氣"];
  openModal(
    "角色表（多角度・表情）",
    `<p class="smalltext">以主圖為基準，一次生成多個角度或表情（每張單獨計費）。</p><div class="pills">${choices.map((a) => `<button data-angle="${a}" class="${angles.includes(a) ? "active" : ""}">${a}</button>`).join("")}</div><p><button class="btn primary" id="generateAngles">▧ 生成角色表（${angles.length} 張 · API 計費）</button></p>`,
    `<button class="btn" id="backEdit">返回編輯</button>`,
  );
  $("modalInner").onclick = async (e) => {
    if (e.target.dataset.angle) {
      let a = e.target.dataset.angle;
      angles = angles.includes(a)
        ? angles.filter((x) => x !== a)
        : [...angles, a];
      anglesPanel();
    } else if (e.target.id === "generateAngles")
      requestCharacterAction("角色表");
  };
  $("modalFoot").onclick = returnEditor;
}
function voiceModal() {
  openModal(
    "角色聲音",
    `<b>目前的角色聲音</b><p class="smalltext">可從素材庫選擇，或生成幾個候選聲音試聽，選一個存為角色聲音；也可以從素材庫選擇一段音訊。<br>之後在生成頁選這個角色時，可以把它的照片和聲音一起帶入（聲音會放進參考資訊）。</p><div class="noticeLine"><b>生成候選聲音</b><p class="smalltext">描述想要的聲音並輸入一句試聽台詞，AI 語音服務會唸出來。可以一次生成幾個候選，聽完選一個作為角色聲音。</p><label>聲音描述（選填）</label><input id="voiceDesc" class="input" placeholder="例如：低沉沙啞的中年男聲，語速偏慢"><label>試聽台詞</label><textarea class="input" id="voiceLine" rows="3">大家好，我是Jenny Hsu，很高興認識你，接下來的故事就交給我吧！</textarea><p><label><input type="checkbox" id="useAppearance" disabled title="目前語音服務不支援從照片推測聲線" style="width:auto"> 改用角色參考圖推測聲線（勾選後不套用文字聲音描述）</label></p><div class="pills">一次生成　${[1, 2, 3].map((n) => `<button data-voice-count="${n}" class="${voiceCount === n ? "active" : ""}">${n}</button>`).join("")}</div><p style="text-align:right"><button class="btn primary" id="generateVoice">✧ 生成 ${voiceCount} 個候選 · API 計費</button></p></div>`,
    `<button class="btn" id="audioLibrary">▱ 從素材庫選擇音訊</button><button class="btn" id="backEdit">關閉</button>`,
    true,
  );
  $("modalInner").onclick = async (e) => {
    let b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.voiceCount) {
      voiceCount = +b.dataset.voiceCount;
      voiceModal();
    } else if (b.id === "generateVoice") requestCharacterAction("角色聲音");
  };
  $("modalFoot").onclick = (e) => {
    if (e.target.id === "audioLibrary")
      requestCharacterAction("音訊素材庫尚未連接");
    else returnEditor();
  };
}
function sheetModal() {
  let fields = [
    ["外文名／假名", "例如：Yuki / ゆき"],
    ["標語", "例如：在平凡中閃閃發光"],
    ["年齡", ""],
    ["生日", ""],
    ["身高", ""],
    ["性格", ""],
    ["喜歡", ""],
    ["特技", ""],
    ["夢想", ""],
  ];
  openModal(
    "角色設定圖",
    `<p class="smalltext">填好角色資料後，一鍵生成完整設定圖——由擅長文字的模型（GPT Image 2 / Nano Banana Pro）以你的參考圖為基準，一次畫出多角度圖板與資料欄文字。</p><p class="smalltext">✧ 使用 Image 2.5 生成（這是圖片文字）</p><div class="formgrid">${fields.map(([a, p]) => `<div><label>${a}</label><input class="input" ${a === "生日" ? 'type="date"' : ""} maxlength="500" placeholder="${p}"></div>`).join("")}</div>`,
    `<button class="btn" id="backEdit">關閉</button><button class="btn primary" id="sheetGenerate">▧ 生成設定圖（API 計費）</button>`,
  );
  $("modalFoot").onclick = (e) => {
    if (e.target.id === "sheetGenerate") requestCharacterAction("生成設定圖");
    else returnEditor();
  };
}
function testPanel() {
  openModal(
    "試鏡(測試能否生成影片)",
    `<p class="smalltext">花少量點數實測這個角色能否順利生成影片</p><input id="testPrompt" class="input" placeholder="給一句指令，例如：轉頭微笑並看向鏡頭"><p><button class="btn">免費預檢</button> <button class="btn primary" id="testGenerate">生成 4 秒試鏡（API 計費）</button></p>`,
    `<button class="btn" id="backEdit">返回編輯</button>`,
  );
  $("modalInner").onclick = async (e) => {
    if (e.target.id === "testGenerate") requestCharacterAction("試鏡");
    else if (e.target.tagName === "BUTTON")
      toast(
        refs.length
          ? "參考圖已就緒，實際生成仍由模型判斷。"
          : "尚未加入參考圖，請先上傳。",
      );
  };
  $("modalFoot").onclick = returnEditor;
}
render();
async function requestCharacterAction(label) {
  if (/素材庫/.test(label))
    return pickSharedAsset(/音訊/.test(label) ? "audio" : "image");
  try {
    const type = /聲音|音訊/.test(label)
      ? "audio"
      : /試鏡|影片/.test(label)
        ? "video"
        : "image";
    const prompt =
      document.querySelector(
        "#voiceLine,#aiPrompt,#quickPrompt,#wardrobePrompt,#testPrompt",
      )?.value || draft.description;
    const sheet = [...document.querySelectorAll("#modalInner .formgrid input")]
      .map((x) => x.previousElementSibling?.textContent + ": " + x.value)
      .join("\n");
    const variants = /角色表/.test(label)
      ? angles
      : type === "audio"
        ? Array.from({ length: voiceCount }, (_, i) => "候選 " + (i + 1))
        : [""];
    if (!variants.length) throw Error("請先選擇至少一個角度或表情");
    draft.id ||= crypto.randomUUID();
    const character = { ...draft, references: [...refs] },
      originalId = draft.id;
    for (const variant of variants) {
      const job = await SeedStar.generations.create({
        type,
        operation:
          type === "audio"
            ? "character-voice"
            : type === "video"
              ? "character-test"
              : "character-image",
        duration: 4,
        character,
        references:
          type === "video"
            ? {
                images: refs
                  .slice(0, 1)
                  .map((url) => ({ url, type: "image/png" })),
              }
            : undefined,
        instructions:
          ($("voiceDesc")?.value || "自然繁體中文口吻") + " " + variant,
        prompt:
          type === "audio"
            ? prompt
            : [
                prompt,
                "風格：" + style,
                variant && "角度或表情：" + variant,
                /設定圖/.test(label)
                  ? "完整角色介紹圖板，包含多角度與以下文字資料：\n" + sheet
                  : "",
              ]
                .filter(Boolean)
                .join("\n"),
      });
      SeedStar.showJob(job, {
        applyLabel:
          type === "audio"
            ? "設為角色聲音"
            : type === "image"
              ? "加入角色參考圖"
              : undefined,
        apply:
          type === "video"
            ? undefined
            : (v) => {
                if (draft.id !== originalId) {
                  toast("請返回原角色後從素材庫套用");
                  return false;
                }
                if (type === "audio")
                  draft.voice = {
                    url: v.result.url,
                    name: "AI 生成聲音",
                    type: "audio/mpeg",
                  };
                else if (!refs.includes(v.result.url) && refs.length < 8)
                  refs.push(v.result.url);
                returnEditor();
                toast("已套用，請儲存角色");
              },
      });
    }
  } catch (e) {
    SeedStar.reportError(e);
  }
}
async function pickSharedAsset(kind = "image") {
  try {
    const chosen = await SeedStar.pickAssets({
      kind,
    });
    if (!chosen[0]) return;
    if (kind === "audio") {
      draft.voice = chosen[0];
      returnEditor();
    } else {
      refs.push(chosen[0].url);
      fullEditor();
    }
  } catch (e) {
    SeedStar.reportError(e);
  }
}
