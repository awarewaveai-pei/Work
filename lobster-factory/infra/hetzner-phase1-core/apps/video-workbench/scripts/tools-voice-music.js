const toolVoiceSamples = {
  溫馨關心: "你今天辛苦了，先休息一下，我們慢慢說。",
  驚訝疑問: "真的嗎？這個結果比我想像的還要精彩！",
  興奮宣布: "好消息！我們期待的新計畫，今天正式開始了！",
  生氣質問: "為什麼沒有先告訴我？我們需要把事情說清楚。",
  溫柔安撫: "別擔心，我會在這裡陪你，一步一步來。",
  廣告熱情: "準備好探索新的可能了嗎？現在就來了解更多！",
};
const toolSoundSamples = {
  雨聲: "柔和的雨點落在窗邊，沒有音樂與人聲",
  雷鳴: "遠方一聲低沉雷鳴，慢慢消退",
  風聲: "風吹過樹葉的沙沙聲",
  海浪: "海浪輕輕拍打沙灘",
  溪流: "清澈溪水流過小石頭",
  鳥鳴: "清晨森林的鳥鳴",
  腳步聲: "人在木地板上緩慢行走",
  開關門: "木門輕輕打開再關上",
  玻璃碎裂: "玻璃杯落地碎裂的短促聲音",
  爆炸: "遠處低沉的電影爆炸音效",
  敲擊: "木頭被規律敲擊三下",
  城市街景: "城市街道的環境聲",
  森林: "森林裡的風聲與自然環境音",
  咖啡廳: "咖啡廳安靜的背景環境聲",
  機械運轉: "穩定的機械運轉聲",
  人群: "遠處人群交談的環境聲",
};
function toolVoiceScreen(t) {
  wfDefaults({
    voiceMode: "純聲音",
    voiceScriptMode: "台詞",
    voiceSourceKind: "影片",
    voiceDuration: "5 秒",
    voicePreferences: false,
    voiceAdvanced: false,
    voiceGender: [],
    voiceAge: [],
    voiceTone: [],
    voiceMood: [],
    voiceSpeed: 1,
    voicePitch: 0,
    voiceGain: 0,
    voiceId: "coral",
    voiceAsMusic: false,
  });
  const pure = values.voiceMode === "純聲音",
    effect = values.voiceScriptMode === "音效";
  const source = pure
    ? ""
    : `<label>素材種類</label>${wfChoice("voiceSourceKind", ["影片", "圖片"])}${wfSource("src", values.voiceSourceKind === "圖片" ? "image" : "video")}`;
  const preferences = !effect
    ? `${wfButton("聲音設定（選填）", "voice-preferences")}<div ${values.voicePreferences ? "" : "hidden"}><label>性別</label>${wfChoice("voiceGender", ["男聲", "女聲", "中性"], true)}<label>年齡</label>${wfChoice("voiceAge", ["兒童", "少年", "青年", "中年", "長者"], true)}<label>音色／風格</label>${wfChoice("voiceTone", ["低沉磁性", "溫柔", "明亮清亮", "沙啞", "沉穩播報", "旁白解說", "耳語"], true)}<label>情緒</label>${wfChoice("voiceMood", ["平靜", "溫暖", "開心", "悲傷", "緊張", "興奮"], true)}${wfField("voiceDescription", "補充聲音描述（選填）")}${wfSelect("voiceId", "已接入聲線", ["coral", "alloy", "echo", "fable", "onyx", "nova", "shimmer"])}</div>`
    : "";
  const form = `<label>${effect ? "音效描述" : "台詞內容"}</label>${wfChoice("voiceScriptMode", ["台詞", "音效"])}${wfArea(effect ? "voiceSfxText" : "voiceText", effect ? "音效描述" : "台詞內容", 500)}<p class="note" id="voiceCount">${String(values[effect ? "voiceSfxText" : "voiceText"] || "").length}/500</p><div class="flow-choices">${Object.keys(
    effect ? toolSoundSamples : toolVoiceSamples,
  )
    .map((name) => wfButton(name, "voice-sample:" + name))
    .join(
      "",
    )}</div>${preferences}<label>目標長度</label>${wfChoice("voiceDuration", ["3 秒", "5 秒", "10 秒", "15 秒", "30 秒", "60 秒", "120 秒"])}<p class="note">依台詞估算及調整語速；台詞較長時可能超出目標，會保留完整台詞。</p>${wfButton("進階 · 語速／音調／音量", "voice-advanced")}<div ${values.voiceAdvanced ? "" : "hidden"}>${wfField("voiceSpeed", "語速（倍）", "number", 'min="0.25" max="4" step="0.05"')}${wfField("voicePitch", "音調（半音）", "number", 'min="-12" max="12" step="1"')}${wfField("voiceGain", "音量（dB）", "number", 'min="-30" max="12" step="1"')}</div>${!pure ? wfCheck("voiceAsMusic", "當作配樂／旁白（鋪入音軌，不重新對口型）") : ""}<p class="note">${effect ? "音效生成尚未接入；不會將音效描述送到語音朗讀。" : !pure && !values.voiceAsMusic ? "照片／影片對嘴尚未接入；可選擇直接鋪入生成的旁白。" : "使用已接入語音服務，依 API 用量計費。"}</p>${wfButton(pure ? "產生聲音" : "開始配音", "voice-generate", effect || (!pure && (!files.src || !values.voiceAsMusic)))}`;
  return wfWrap(
    t,
    `${wfChoice("voiceMode", ["純聲音", "影片／圖片配音"])}${pure ? `<section class="side flow-wide">${form}</section>` : `<div class="two-col flow-layout">${source}<aside class="side">${form}</aside></div>`}`,
  );
}
let toolVoicePending = false;
async function toolVoiceAction(action, button) {
  if (tool !== "voice") return;
  if (action === "voice-preferences" || action === "voice-advanced") {
    const key =
      action === "voice-preferences" ? "voicePreferences" : "voiceAdvanced";
    values[key] = !values[key];
    saveDraft();
    render();
  }
  if (action?.startsWith("voice-sample:")) {
    const name = action.slice(13),
      effect = values.voiceScriptMode === "音效";
    values[effect ? "voiceSfxText" : "voiceText"] =
      (effect ? toolSoundSamples : toolVoiceSamples)[name] || "";
    saveDraft();
    render();
  }
  if (action !== "voice-generate" || toolVoicePending) return;
  const settings = structuredClone(values),
    source = structuredClone(files.src),
    text = String(settings.voiceText || "").trim();
  if (!text || text.length > 500) throw Error("請輸入 1–500 字台詞");
  if (settings.voiceScriptMode === "音效") throw Error("音效生成尚未接入");
  if (settings.voiceMode !== "純聲音" && (!source || !settings.voiceAsMusic))
    throw Error("請選取素材並開啟直接鋪入音軌；對嘴服務尚未接入");
  const speed = Number(settings.voiceSpeed),
    pitch = Number(settings.voicePitch),
    gain = Number(settings.voiceGain);
  if (
    !Number.isFinite(speed) ||
    speed < 0.25 ||
    speed > 4 ||
    !Number.isFinite(pitch) ||
    Math.abs(pitch) > 12 ||
    !Number.isFinite(gain) ||
    gain < -30 ||
    gain > 12
  )
    throw Error("語速、音調或音量超出範圍");
  const instructions = [
    "請以自然口語朗讀，不要省略或增加台詞。",
    ...["voiceGender", "voiceAge", "voiceTone", "voiceMood"].map((key) =>
      (settings[key] || []).join("、"),
    ),
    settings.voiceDescription || "",
    `目標長度約 ${parseInt(settings.voiceDuration)} 秒，保留完整台詞。`,
  ]
    .filter(Boolean)
    .join("\n");
  toolVoicePending = true;
  button.disabled = true;
  try {
    const audio = await SeedStar.generations.create({
      type: "audio",
      operation: "voice",
      prompt: text,
      voice: settings.voiceId,
      instructions,
      settings: { voiceSpeed: speed, voicePitch: pitch, voiceGain: gain },
    });
    if (settings.voiceMode === "純聲音") {
      SeedStar.showJob(audio);
      return;
    }
    SeedStar.showJob(audio, {
      applyLabel: "把此配音合成至素材",
      apply: async (done) => {
        const duration = await new Promise((resolve, reject) => {
          const media = new Audio(),
            timeout = setTimeout(() => {
              media.src = "";
              reject(Error("無法讀取配音長度，請先下載音檔確認"));
            }, 10000);
          media.onloadedmetadata = () => {
            clearTimeout(timeout);
            const seconds = media.duration;
            media.src = "";
            Number.isFinite(seconds) && seconds > 0
              ? resolve(seconds)
              : reject(Error("配音長度無效"));
          };
          media.onerror = () => {
            clearTimeout(timeout);
            reject(Error("無法讀取配音音檔"));
          };
          media.src = done.result.url;
        });
        const image = String(source.type).startsWith("image/");
        if (
          duration > 120 ||
          (!image && duration > Number(source.duration || 0) + 0.2)
        )
          throw Error(
            "配音比可合成片長更長；可下載完整配音，或縮短台詞後再合成。",
          );
        const job = await SeedStar.generations.create({
          type: "video",
          operation: "voice-overlay",
          references: { src: source, audio: { url: done.result.url } },
          settings: {
            image,
            duration: Math.min(
              120,
              Math.max(duration, parseInt(settings.voiceDuration) || 5),
            ),
          },
        });
        SeedStar.showJob(job);
      },
    });
  } finally {
    toolVoicePending = false;
    if (button.isConnected) button.disabled = false;
  }
}
const toolMusicGenres = [
  "流行 Pop",
  "輕柔 Lo-Fi",
  "電影配樂 Cinematic",
  "電子舞曲 EDM",
  "搖滾 Rock",
  "爵士 Jazz",
  "賽博朋克 Synthwave",
  "環境氛圍 Ambient",
  "嘻哈 Hip-Hop",
  "古典交響 Classical",
  "節奏藍調 R&B",
  "民謠 Folk",
  "純原聲 Acoustic",
  "重金屬 Metal",
];
const toolMusicMoods = [
  "輕快愉悅 Uplifting",
  "史詩壯麗 Epic",
  "憂傷深沉 Melancholic",
  "暗黑緊張 Dark",
  "放鬆療癒 Chill",
  "虛靈夢幻 Ethereal",
  "浪漫溫馨 Romantic",
  "激昂強烈 Aggressive",
  "復古懷舊 Nostalgic",
  "奇幻俏皮 Whimsical",
];
const toolMusicInstruments = [
  "平台鋼琴",
  "木吉他",
  "電吉他",
  "弦樂重奏",
  "銅管號角",
  "復古合成器",
  "808 重低音",
  "真實鼓組",
  "人聲合唱墊",
  "八音盒／鋼片琴",
  "豎琴",
  "黑膠唱片噪聲",
];
function toolMusicCompile() {
  return [
    values.musicStyleDescription,
    (values.musicGenres || []).join(", "),
    (values.musicMoods || []).join(", "),
    `${values.musicBpm} BPM`,
    values.musicKey === "自動／預設調性" ? "" : values.musicKey,
    "配器：" + (values.musicInstruments || []).join(", "),
    values.musicInstrumental
      ? "instrumental, no vocals"
      : (values.musicVocals || []).join(", "),
    values.musicStructure,
    values.musicNegative ? "排除：" + values.musicNegative : "",
  ]
    .filter(Boolean)
    .join("\n");
}
function toolMusicScreen(t) {
  wfDefaults({
    musicMode: "簡易模式",
    musicGenres: ["電影配樂 Cinematic"],
    musicMoods: ["史詩壯麗 Epic"],
    musicInstrumental: true,
    musicBpm: 120,
    musicKey: "自動／預設調性",
    musicInstruments: ["弦樂重奏", "銅管號角"],
    musicVocals: ["柔美女聲"],
    musicModel: "Lyria 3.5",
    musicLyricsLanguage: "繁體中文",
    musicLyricsAssist: false,
  });
  const custom = values.musicMode === "自訂配置";
  const form = custom
    ? `${wfField("musicTitle", "曲目標題（選填）")}${wfArea("musicStyleDescription", "風格描述（選填）", 700)}${wfCheck("musicInstrumental", "純器樂（無人聲）")}<label>音樂曲風</label>${wfChoice("musicGenres", toolMusicGenres, true)}<label>情緒氛圍</label>${wfChoice("musicMoods", toolMusicMoods, true)}${wfField("musicBpm", "節奏速度（BPM）", "number", 'min="40" max="240"')}<div class="flow-choices">${[75, 100, 120, 128, 160].map((bpm) => wfButton(bpm + " BPM", "music-bpm:" + bpm)).join("")}</div>${wfSelect("musicKey", "調性與調式", ["自動／預設調性", "C Major", "C Minor", "C# Minor", "D Major", "D Minor", "Eb Major", "E Major", "E Minor", "F Major", "F Minor", "F# Minor", "G Major", "G Minor", "Ab Major", "A Major", "A Minor", "Bb Major", "B Minor"])}<label>主要配器</label>${wfChoice("musicInstruments", toolMusicInstruments, true)}${!values.musicInstrumental ? "<label>人聲風格</label>" + wfChoice("musicVocals", ["柔美女聲", "渾厚男聲", "虛靈合唱", "親近耳語", "靈魂高亢", "電子聲碼器", "律動說唱"], true) : ""}${wfArea("musicStructure", "曲式結構與段落（選填）")}<div class="flow-choices">${["Intro", "Verse", "Chorus", "Bridge", "Drop", "Instrumental", "Outro", "Fade Out"].map((name) => wfButton("[" + name + "]", "music-section:" + name)).join("")}</div>${wfField("musicNegative", "排除元素／負向提示詞")}<details open><summary>即時提示詞編譯預覽</summary><pre data-music-compiled>${esc(toolMusicCompile())}</pre></details>`
    : `${wfArea("musicPrompt", "音樂提示詞／風格描述", 500)}<label>風格靈感</label><div class="flow-choices">${["輕柔 Lo-Fi", "史詩電影交響", "現代電子舞曲", "溫暖爵士", "輕快流行", "木吉他民謠", "賽博朋克", "冥想氛圍"].map((name) => wfButton(name, "music-preset:" + name)).join("")}</div>`;
  return wfWrap(
    t,
    `<section class="side flow-wide"><h3>從參考音樂開始（選填）</h3><div class="row">${btn("從素材庫選取音訊", "library:musicref")}${btn("上傳參考音訊", "upload:musicref")}</div>${files.musicref ? `<audio src="${esc(files.musicref.previewUrl || files.musicref.url)}" controls></audio><p>${esc(files.musicref.name)}</p>` : ""}<p class="note">音樂分析與生成服務尚未配置；可先完成並保存提示詞與素材。</p>${wfChoice("musicMode", ["簡易模式", "自訂配置"])}${form}${wfSelect("musicModel", "預備接入模型", ["Lyria 3.5", "Lyria Clip Preview"])}<h3>歌詞（選填）</h3>${wfArea("musicLyrics", "歌詞", 10000)}${wfButton("AI 寫歌詞", "music-lyrics-assist")}${values.musicLyricsAssist ? `${wfArea("musicLyricsTheme", "想寫什麼樣的歌？", 1000)}${wfSelect("musicLyricsLanguage", "歌詞語言", ["繁體中文", "簡體中文", "English", "日本語", "한국어", "ภาษาไทย"])}${wfButton("寫歌詞（文字 API 用量計費）", "music-lyrics-generate")}` : ""}<div class="row">${wfButton("下載音樂設定", "music-download")}${wfButton("尚未接入音樂生成服務", "music-generate", true)}</div></section>`,
  );
}
let toolMusicLyricsPending = false;
async function toolMusicAction(action, button) {
  if (tool !== "music") return;
  if (action?.startsWith("music-preset:")) {
    const name = action.slice(13);
    values.musicPrompt = name + "，清楚的段落與自然的音樂層次，適合影片配樂。";
    saveDraft();
    render();
  }
  if (action?.startsWith("music-bpm:")) {
    values.musicBpm = Number(action.slice(10));
    saveDraft();
    render();
  }
  if (action?.startsWith("music-section:")) {
    values.musicStructure = [
      values.musicStructure || "",
      "[" + action.slice(14) + "]",
    ]
      .filter(Boolean)
      .join("\n");
    saveDraft();
    render();
  }
  if (action === "music-lyrics-assist") {
    values.musicLyricsAssist = !values.musicLyricsAssist;
    saveDraft();
    render();
  }
  if (action === "music-download")
    SeedStar.download("music-settings.json", {
      ...values,
      compiledPrompt: toolMusicCompile(),
      reference: files.musicref || null,
    });
  if (action === "music-lyrics-generate" && !toolMusicLyricsPending) {
    const theme = String(values.musicLyricsTheme || "").trim(),
      language = values.musicLyricsLanguage,
      previous = values.musicLyrics;
    if (!theme) throw Error("請先描述歌詞主題");
    toolMusicLyricsPending = true;
    button.disabled = true;
    try {
      const response = await SeedStar.request("/tools/music/lyrics", {
        theme,
        language,
        style: toolMusicCompile(),
      });
      if (
        values.musicLyrics !== previous ||
        values.musicLyricsTheme !== theme
      ) {
        SeedStar.notify("內容已變更，保留目前歌詞，請重新產生。");
        return;
      }
      values.musicLyrics = response.lyrics;
      saveDraft();
      if (tool === "music") render();
    } finally {
      toolMusicLyricsPending = false;
      if (button.isConnected) button.disabled = false;
    }
  }
}
document.addEventListener("input", (event) => {
  if (tool === "music" && event.target.dataset.key) {
    values[event.target.dataset.key] = event.target.value;
    const compiled = document.querySelector("[data-music-compiled]");
    if (compiled) compiled.textContent = toolMusicCompile();
  }
});
