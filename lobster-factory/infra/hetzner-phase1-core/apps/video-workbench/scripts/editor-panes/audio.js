// Card ED.6: the 「音訊」 left pane (spec §1.3 音訊, §3 檔案歸屬). Registered with edRegisterPane in tools-editor.js.
// 配樂／音效／台詞旁白／環境音／未分類 list audio by its usage tag (asset.tags; a voice job's output counts as 台詞), never
// by file name; AI 旁白 is the speech form. The built-in library is the one list file /assets/audio-library.json
// ({ genres, items: [{ id, title, usage, genre, bpm, sec, vocal, use, file, source, license, added }] }); the files are
// served as /library/<file> from the folder every org shares (backend/library.cjs, filled by
// scripts/import-audio-library.cjs). Changing the library = changing that list and folder only.
// 音訊設定 is project data (p.audioSettings: { snap, duck, loop }, absent = all off, so an old project is unchanged);
// it works through the existing clip fields: duck (card ED.3), plain copies for the loop, the track volume.
const edAudUsages = ["music", "sfx", "dialogue", "ambience"],
  edAudCats = [
    ["music", "配樂"],
    ["sfx", "音效"],
    ["dialogue", "台詞旁白"],
    ["ambience", "環境音"],
    ["none", "未分類"],
    ["ai", "AI 旁白"],
  ],
  edAudBuiltin = ["music", "sfx", "ambience"],
  edAudSources = [
    ["library", "我的素材庫"],
    ["session", "本次上傳"],
    ["favs", "收藏"],
    ["builtin", "內建"],
  ],
  edAudSorts = ["人氣", "最新", "名稱", "最短", "最長"],
  edAudUi = {
    cat: "music",
    src: "builtin",
    target: "A2",
    genre: "全部",
    sort: "人氣",
    items: null, // the user's audio assets
    voiceJobs: new Set(), // asset ids made by a voice job (they count as 台詞 without a tag)
    favs: new Set(),
    catalog: null,
    loading: false,
    playing: null, // url being auditioned
    vo: {
      text: "",
      style: "",
      model: "",
      voice: "",
      speed: 100,
      pitch: 0,
      gain: 100,
    },
  },
  edAudPlayer = new Audio();
edAudPlayer.onended = edAudPlayer.onerror = () => {
  edAudUi.playing = null;
  if (tool === "edit" && ed.pane === "音訊") edRedraw();
};
async function edAudLoad() {
  edAudUi.items = null;
  const [rows, jobs, favs, catalog] = await Promise.all([
    VideoWorkbench.assets.list(),
    VideoWorkbench.generations.list(),
    VideoWorkbench.preferences.get("tools.editor.assetFavorites", []),
    edAudUi.catalog ||
      fetch("/assets/audio-library.json", { cache: "no-store" }).then((r) =>
        r.ok ? r.json() : Promise.reject(Error("內建曲庫清單讀取失敗")),
      ),
  ]);
  edAudUi.items = rows.filter((a) => VideoWorkbench.mediaKind(a) === "audio");
  edAudUi.voiceJobs = new Set(
    jobs
      .filter((j) => j.input?.operation === "voice")
      .map((j) => "job-" + j.id),
  );
  edAudUi.favs = new Set(Array.isArray(favs) ? favs : []);
  edAudUi.catalog = {
    genres: catalog.genres || {},
    items: Array.isArray(catalog.items) ? catalog.items : [],
  };
  if (tool === "edit" && ed.pane === "音訊") edRedraw();
}
const edAudUsage = (a) =>
  (a.tags || []).find((t) => edAudUsages.includes(t)) ||
  (edAudUi.voiceJobs.has(a.id) ? "dialogue" : "none");
const edAudUrl = (it) => "/library/" + it.file;
// How often the user's open projects use a built-in file (使用次數; 人氣 sorts by it).
const edAudUses = (url) =>
  ed.projects.reduce(
    (n, p) => n + p.clips.filter((c) => c.asset?.url === url).length,
    0,
  );
const edAudClock = (s) => {
  const v = Math.round(Math.max(0, Number(s) || 0));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`;
};
// Target track: 配樂 A2 / 旁白 A1; a project without that track uses its first audio track (created when none is left).
const edAudTrack = (p, id = edAudUi.target) =>
  edTrack(p, id)?.kind === "audio" ? id : edTrackFor(p, "audio");
const edAudMusic = (p) =>
  edTrack(p, "A2")?.kind === "audio"
    ? "A2"
    : p.tracks.find((t) => t.kind === "audio" && t.id !== EditorModel.NARRATION)
        ?.id || null;
const edAudSettings = (p) => ({
  snap: false,
  duck: false,
  loop: false,
  ...(p.audioSettings || {}),
});
const edAudMainEnd = (p) =>
  Math.max(
    0,
    ...p.clips
      .filter((c) => c.track === edMain(p))
      .map((c) => c.startFrame + c.durationFrames),
  );
// 新增音訊對齊最近切點: the main track's cut nearest the playhead (0 and every clip edge).
function edAudSnap(p, frame) {
  const cuts = [
    0,
    ...p.clips
      .filter((c) => c.track === edMain(p))
      .flatMap((c) => [c.startFrame, c.startFrame + c.durationFrames]),
  ];
  return cuts.reduce(
    (best, x) => (Math.abs(x - frame) < Math.abs(best - frame) ? x : best),
    0,
  );
}
// 循環延伸至影片結尾: copies of the music track's last clip up to the main track's end, the last one cut to fit. Copies
// carry loopOf, so turning the setting off (or extending again) removes exactly them. Pure: returns the new clip list,
// or throws before anything changes when the export could not take that many clips.
const edAudMediaMax = 64; // non-text clips one export accepts (backend/editor-export.cjs validateProject)
function edAudLoopClips(p, clips) {
  const rows = clips.filter((c) => !c.loopOf),
    track = edAudMusic(p),
    end = Math.max(0, ...rows.filter((c) => c.track === edMain(p)).map((c) => c.startFrame + c.durationFrames)),
    last = rows.filter((c) => c.track === track && c.kind === "audio").sort((a, b) => a.startFrame - b.startFrame).at(-1),
    copies = [];
  for (let at = last ? last.startFrame + last.durationFrames : end; at < end; ) {
    const copy = edTime(p, { ...structuredClone(last), id: crypto.randomUUID(), loopOf: last.id }, { startFrame: at, durationFrames: Math.min(last.durationFrames, end - at) });
    copy.fadeIn = Math.min(copy.fadeIn || 0, copy.duration / 2);
    copy.fadeOut = Math.min(copy.fadeOut || 0, copy.duration / 2);
    // A shortened last copy keeps only the volume keys inside it.
    copy.volumeKeys = EditorModel.volumeKeys((copy.volumeKeys || []).filter((k) => k.frame <= copy.durationFrames), copy.durationFrames);
    if (!copy.volumeKeys.length) delete copy.volumeKeys;
    delete copy.slot;
    delete copy.jobId;
    edValidate(copy);
    copies.push(copy);
    at += copy.durationFrames;
    if (rows.filter((c) => c.kind !== "text").length + copies.length > edAudMediaMax)
      throw Error(`循環延伸會超過匯出上限（影片、圖片、音訊共 ${edAudMediaMax} 段）；請換較長的配樂或先縮短影片`);
  }
  return [...rows, ...copies];
}
// The loop copies no longer reach the main track's end (the video changed after 循環延伸).
function edAudLoopStale(p) {
  const music = p.clips.filter((c) => c.track === edAudMusic(p) && c.kind === "audio");
  return music.length > 0 && Math.max(...music.map((c) => c.startFrame + c.durationFrames)) !== edAudMainEnd(p);
}
// 建議配樂 BPM: one beat per median shot, folded into 70–140.
function edAudBpm(p) {
  const shots = edMainVisual(p)
    .map((c) => c.duration)
    .filter((d) => d > 0)
    .sort((a, b) => a - b);
  if (shots.length < 2) return null;
  const shot = shots[Math.floor(shots.length / 2)];
  let bpm = 60 / shot;
  while (bpm < 70) bpm *= 2;
  while (bpm > 140) bpm /= 2;
  return { bpm: Math.round(bpm), shot };
}
// ＋ / AI 旁白 套用: the asset goes to the target track at the playhead (snapped to a cut when 對齊切點 is on), or the
// first free time after it on that track. One undo step. Returns the clip, or null when nothing was added (the project
// changed while the file was read), so a caller acts only on an add that happened.
async function edAudAdd(p, asset, trackId) {
  const a = await edProbe(asset);
  if (edProject() !== p) return null;
  const s = edAudSettings(p),
    track = edAudTrack(p, trackId),
    looping = s.loop && track === edAudMusic(p),
    seconds = Math.min(3600, a.duration),
    from = s.snap ? edAudSnap(p, edFrame(p)) : edFrame(p),
    // With 循環 on, the old copies are about to be rebuilt after the new clip: they do not block its place.
    skip = new Set(looping ? p.clips.filter((c) => c.loopOf).map((c) => c.id) : []),
    start = edFreeStart(p, [{ track, offset: 0, durationFrames: Timebase.toFrames(seconds, p.timebase) }], from, skip),
    c = edTime(p, edSpineClip(p, a, track), { startFrame: start, duration: seconds, sourceStart: 0 });
  if (s.duck && track !== EditorModel.NARRATION) c.duck = true;
  const clips = looping ? edAudLoopClips(p, [...p.clips, c]) : [...p.clips, c];
  edCheckpoint();
  if (!p.assets.some((x) => x.id === a.id)) p.assets.push(a);
  p.clips = clips;
  ed.selected = c.id;
  ed.picks.clear();
  await edCommit(p);
  return c;
}
// A built-in item is added, then saved to the library once (存進素材庫, stable id, tagged with its usage): an add that
// fails (e.g. a loop over the export limit) leaves the library unchanged.
async function edAudAddBuiltin(p, it) {
  const asset = {
    id: "builtin-" + it.id,
    name: it.title,
    url: edAudUrl(it),
    kind: "audio",
    type: "audio/mpeg",
    tags: [it.usage],
  };
  if (!(await edAudAdd(p, asset))) return;
  if (!(edAudUi.items || []).some((a) => a.id === asset.id)) {
    await VideoWorkbench.assets.save(asset);
    edAudUi.items = [...(edAudUi.items || []), asset];
  }
}
function edAudPlayButton(url, name) {
  const on = edAudUi.playing === url;
  return `<button type="button" class="btn small editor-icon-btn${on ? " selected" : ""}" data-ed-action="aud-play:${esc(url)}" aria-pressed="${on}" aria-label="${on ? "停止試聽" : "試聽"} ${esc(name)}" title="${on ? "停止" : "試聽"}">${on ? "■" : "▶"}</button>`;
}
function edAudBuiltinList() {
  const cat = edAudUi.cat,
    all = (edAudUi.catalog?.items || []).filter((it) => it.usage === cat),
    genres = edAudUi.catalog?.genres || {},
    counts = new Map();
  for (const it of all)
    if (it.genre) counts.set(it.genre, (counts.get(it.genre) || 0) + 1);
  const genre = counts.has(edAudUi.genre) ? edAudUi.genre : "全部",
    rows = all.filter((it) => genre === "全部" || it.genre === genre),
    by = {
      人氣: (a, b) =>
        edAudUses(edAudUrl(b)) - edAudUses(edAudUrl(a)) ||
        a.title.localeCompare(b.title, "zh-Hant"),
      最新: (a, b) =>
        String(b.added || "").localeCompare(String(a.added || "")) ||
        all.indexOf(b) - all.indexOf(a),
      名稱: (a, b) => a.title.localeCompare(b.title, "zh-Hant"),
      最短: (a, b) => a.sec - b.sec,
      最長: (a, b) => b.sec - a.sec,
    }[edAudUi.sort];
  if (!all.length)
    return `<div class="ed-aud-empty"><p class="note">內建${cat === "music" ? "配樂" : cat === "sfx" ? "音效" : "環境音"}還沒有曲子。可以按下方「${cat === "music" ? "上傳自己的音樂" : "上傳音訊"}」用自己的檔案。</p></div>`;
  const genreButtons = counts.size
    ? `<div class="flow-choices" role="group" aria-label="曲風">${[
        ["全部", all.length],
        ...counts,
      ]
        .map(
          ([g, n]) =>
            `<button type="button" class="btn small ${g === genre ? "selected" : ""}" data-ed-action="aud-genre:${esc(g)}" aria-pressed="${g === genre}">${esc(g === "全部" ? "全部" : genres[g] || g)} ${n}</button>`,
        )
        .join("")}</div>`
    : "";
  return `${genreButtons}${edChoices("排序", "aud-sort", edAudUi.sort, edAudSorts)}<ul class="ed-aud-list">${[
    ...rows,
  ]
    .sort(by)
    .map((it) => {
      const meta = [
        it.genre ? genres[it.genre] || it.genre : "",
        it.bpm ? it.bpm + " BPM" : "",
        edAudClock(it.sec),
        it.vocal === "wordless"
          ? "無詞人聲"
          : it.usage === "music"
            ? "純音樂"
            : "",
        "使用 " + edAudUses(edAudUrl(it)) + " 次",
      ].filter(Boolean);
      return `<li class="ed-aud-item" data-ed-aud-item="${esc(it.id)}"><div class="ed-aud-body"><b>${esc(it.title)}</b><span class="note">${esc(meta.join(" · "))}</span>${it.use ? `<span class="note">${esc(it.use)}</span>` : ""}</div>${edAudPlayButton(edAudUrl(it), it.title)}<button type="button" class="btn small editor-icon-btn" data-ed-action="aud-builtin:${esc(it.id)}" aria-label="加入「${esc(it.title)}」" title="存進素材庫並加到播放頭">＋</button></li>`;
    })
    .join("")}</ul>`;
}
function edAudLibraryList() {
  if (!edAudUi.items) return '<p class="note">載入音訊中…</p>';
  const session = typeof edAssets === "object" ? edAssets.session : new Set(),
    rows = edAudUi.items.filter(
      (a) =>
        edAudUsage(a) === edAudUi.cat &&
        (edAudUi.src !== "session" || session.has(a.id)) &&
        (edAudUi.src !== "favs" || edAudUi.favs.has(a.id)),
    );
  if (!rows.length)
    return `<p class="note">${edAudUi.src === "session" ? "這次還沒有上傳音訊。" : edAudUi.src === "favs" ? "還沒有收藏的音訊，按 ☆ 收藏。" : "這個分類還沒有音訊。"}</p>`;
  return `<ul class="ed-aud-list">${rows
    .map((a) => {
      const name = a.name || "音訊",
        fav = edAudUi.favs.has(a.id),
        // 未分類: tag it here; it moves to that category (the tag is asset data, so the 素材 pane keeps it).
        tag =
          edAudUi.cat === "none"
            ? `<div class="flow-choices" role="group" aria-label="歸類 ${esc(name)}">${edAudCats
                .slice(0, 4)
                .map(
                  ([u, label]) =>
                    `<button type="button" class="btn small" data-ed-action="aud-tag:${u}:${esc(a.id)}">${label}</button>`,
                )
                .join("")}</div>`
            : "";
      return `<li class="ed-aud-item"><div class="ed-aud-body"><b>${esc(name)}</b>${Number.isFinite(a.duration) ? `<span class="note">${edAudClock(a.duration)}</span>` : ""}${tag}</div>${edAudPlayButton(a.previewUrl || a.url, name)}<button type="button" class="btn small editor-icon-btn${fav ? " selected" : ""}" data-ed-action="aud-fav:${esc(a.id)}" aria-pressed="${fav}" aria-label="${fav ? "取消收藏" : "加入最愛"} ${esc(name)}">${fav ? "★" : "☆"}</button><button type="button" class="btn small editor-icon-btn" data-ed-action="aud-add:${esc(a.id)}" aria-label="加入「${esc(name)}」" title="加到播放頭">＋</button></li>`;
    })
    .join("")}</ul>`;
}
function edAudSettingsPane(p) {
  const s = edAudSettings(p),
    target =
      edTrack(p, edAudUi.target)?.kind === "audio"
        ? edTrack(p, edAudUi.target)
        : null,
    bpm = edAudBpm(p),
    toggle = (key, label, note) =>
      `<button type="button" class="btn small ${s[key] ? "selected" : ""}" data-ed-action="aud-set:${key}" aria-pressed="${s[key]}">${label}</button>${note ? `<span class="note">${note}</span>` : ""}`;
  const body =
    (target
      ? edNumber(
          "track-db:" + target.id,
          `整體音量（${edTrackLabel(p, target)}，dB）`,
          Number(EditorModel.volumeToDb(target.volume).toFixed(1)),
          { min: EditorModel.DB.min, max: 12, step: 0.5 },
        )
      : `<p class="note">專案還沒有${edAudUi.target === "A1" ? "旁白 A1" : "配樂 A2"}軌；加入音訊後可調整音量。</p>`) +
    `<div class="ed-aud-set">${toggle("snap", "新增音訊對齊最近切點")}${toggle("duck", "旁白時配樂降低 12 dB", "旁白 A1 有聲音時，配樂軌的片段降低 12 dB")}${toggle("loop", "循環延伸至影片結尾", "重複配樂最後一段到主視訊結尾")}${s.loop && edAudLoopStale(p) ? edButton("重新延伸到結尾", "aud-loop-refresh") + '<span class="note">影片長度改過，循環還沒跟上</span>' : ""}</div>` +
    `<h4>響度正規化</h4>${edLoudnessPane(p)}` +
    `<p class="note" data-ed-aud-bpm>${bpm ? `建議配樂 BPM：約 ${bpm.bpm}（鏡頭中位長度 ${bpm.shot.toFixed(1)} 秒）` : "建議配樂 BPM：主視訊至少兩段鏡頭才能估算"}</p>`;
  return edGroup(
    "音訊設定",
    [s.snap && "對齊", s.duck && "降低", s.loop && "循環"]
      .filter(Boolean)
      .join("、"),
    body,
  );
}
function edLoudnessPane(p) {
  return `${edChoices("響度目標", "loudness", p.output.loudness, EditorModel.LOUDNESS.presets, (v) => v + " LUFS")}<p class="note">目前 ${p.output.loudness} LUFS。輸出時先量整段混音，再線性調到目標（誤差 ±1 LU），真峰值壓在 −1 dBTP 以下。−23 廣播、−16 一般網路、−14 串流平台。</p>`;
}
function edKeysPane(p, c) {
  const keys = c.volumeKeys || [],
    fps = Timebase.fps(p.timebase);
  return `<h4>音量關鍵影格（${esc(c.asset?.name || "片段")}）</h4><p class="note">有關鍵影格時取代片段音量，兩點之間線性變化；0 為靜音。</p>${keys
    .map(
      (k, i) =>
        `<div class="row">第 ${k.frame} 格（${(k.frame / fps).toFixed(2)} 秒）· 音量 ${k.gain}${edButton("刪除", "key-delete:" + i)}</div>`,
    )
    .join(
      "",
    )}<label>關鍵影格音量<input class="text-input" aria-label="關鍵影格音量" data-ed-key-gain type="number" min="0" max="4" step="0.1" value="1"></label>${edButton("在播放頭加入關鍵影格", "key-add")}`;
}
function edPeakMeter() {
  return `<div class="row editor-peak" data-ed-peak role="meter" aria-label="主輸出峰值" aria-valuemin="-60" aria-valuemax="0" aria-valuenow="-60"><span class="editor-peak-bar"><i data-ed-peak-fill></i></span><span data-ed-peak-text>峰值 — dBFS</span><span class="note">播放時顯示；超過 −1 dB 會在輸出時自動壓低</span></div>`;
}
// AI 旁白: the speech vendors are /capabilities speech.models (backend/speech.cjs, free first); the button shows the
// chosen row's price before the click (shared/paid-price.js: 免費 when it costs nothing). The result goes to 旁白 A1.
function edAudVoiceModel() {
  const models = VideoWorkbench.capabilities?.speech?.models || [],
    vo = edAudUi.vo;
  return (
    models.find((m) => m.id === vo.model && m.available) ||
    models.find(
      (m) => m.id === VideoWorkbench.capabilities?.speech?.defaultModel,
    ) ||
    models.find((m) => m.available) ||
    null
  );
}
function edAudVoicePane() {
  const models = VideoWorkbench.capabilities?.speech?.models;
  if (!models) return '<p class="note">讀取配音服務中…</p>';
  const vo = edAudUi.vo,
    m = edAudVoiceModel(),
    voice =
      m &&
      (m.voices.some((v) => v.id === vo.voice) ? vo.voice : m.defaultVoice),
    field = (key, label, attrs) =>
      `<label>${label}<input class="text-input" type="number" aria-label="${label}" data-ed-vo="${key}" value="${esc(vo[key])}" ${attrs}></label>`;
  return `<div class="ed-aud-vo"><label>旁白內容<textarea class="text-input" rows="4" maxlength="500" aria-label="旁白內容" data-ed-vo="text" placeholder="輸入要念的旁白">${esc(vo.text)}</textarea></label><label>聲音描述<input class="text-input" aria-label="聲音描述" data-ed-vo="style" maxlength="200" placeholder="例：溫暖、放慢、像在說故事" value="${esc(vo.style)}"></label><h4>配音服務</h4><div class="flow-choices" role="group" aria-label="配音服務">${models
    .map(
      (x) =>
        `<button type="button" class="btn small ${x.id === m?.id ? "selected" : ""}" data-ed-action="aud-vo-model:${esc(x.id)}" aria-pressed="${x.id === m?.id}" title="${esc(x.note || "")}" ${x.available ? "" : "disabled"}>${esc(x.label)}${x.available ? "" : "（未啟用）"}</button>`,
    )
    .join(
      "",
    )}</div>${m ? `<p class="note">${esc(m.note || "")}</p><h4>聲線</h4><div class="flow-choices ed-aud-voices" role="group" aria-label="聲線">${m.voices.map((v) => `<button type="button" class="btn small ${v.id === voice ? "selected" : ""}" data-ed-action="aud-vo-voice:${esc(v.id)}" aria-pressed="${v.id === voice}">${esc(v.label)}</button>`).join("")}</div>` : '<p class="note">沒有可用的配音服務。</p>'}${field("speed", "語速（%）", 'min="50" max="200" step="5"')}${field("pitch", "音高（半音）", 'min="-12" max="12" step="1"')}${field("gain", "音量（%）", 'min="10" max="200" step="5"')}<button type="button" class="btn small primary" data-ed-action="aud-vo-generate" data-paid="video.tts" data-paid-model="${esc(m?.id || "")}" ${m ? "" : "disabled"}>產生旁白</button><p class="note">完成後按「加到旁白 A1」放到播放頭。</p></div>`;
}
function edAudPane(p, c) {
  const cat = edAudUi.cat,
    builtin = edAudBuiltin.includes(cat),
    src = !builtin && edAudUi.src === "builtin" ? "library" : edAudUi.src,
    tabs = `<div class="ed-aud-cats" role="group" aria-label="音訊分類">${edAudCats.map(([id, label]) => `<button type="button" class="btn small ${id === cat ? "selected" : ""}" data-ed-action="aud-cat:${id}" aria-pressed="${id === cat}">${label}</button>`).join("")}</div>`,
    target = `<div class="flow-choices" role="group" aria-label="目標軌">${[
      ["A2", "配樂 A2"],
      ["A1", "旁白 A1"],
    ]
      .map(
        ([id, label]) =>
          `<button type="button" class="btn small ${id === edAudUi.target ? "selected" : ""}" data-ed-action="aud-target:${id}" aria-pressed="${id === edAudUi.target}">${label}</button>`,
      )
      .join("")}</div>`;
  if (!edAudUi.catalog && !edAudUi.loading) {
    edAudUi.loading = true;
    edAudLoad()
      .catch(VideoWorkbench.reportError)
      .finally(() => (edAudUi.loading = false));
  }
  const body =
    cat === "ai"
      ? edAudVoicePane()
      : `<div class="flow-choices" role="group" aria-label="音訊來源">${edAudSources
          .filter(([id]) => id !== "builtin" || builtin)
          .map(
            ([id, label]) =>
              `<button type="button" class="btn small ${id === src ? "selected" : ""}" data-ed-action="aud-src:${id}" aria-pressed="${id === src}">${label}</button>`,
          )
          .join(
            "",
          )}</div>${src === "builtin" ? (edAudUi.catalog ? edAudBuiltinList() : '<p class="note">載入內建曲庫中…</p>') : edAudLibraryList()}${edButton(cat === "music" ? "上傳自己的音樂" : "上傳音訊", "aud-upload")}<p class="note">分類依音訊的用途標籤，不看檔名；沒有標籤的在「未分類」。＋＝加到目標軌的播放頭。</p>`;
  return `<h3>音訊</h3>${tabs}<p class="note">目標軌</p>${target}${body}<hr>${edAudSettingsPane(p)}${edPeakMeter()}${c && ["video", "audio"].includes(c.kind) ? edKeysPane(p, c) : ""}`;
}
edRegisterPane("audio", {
  title: "音訊",
  icon: "♪",
  render: edAudPane,
  // A fresh visit re-reads the library (uploads and voice jobs made elsewhere since); the list file stays read.
  open: () => {
    edAudUi.items = null;
    if (edAudUi.catalog) edAudLoad().catch(VideoWorkbench.reportError);
  },
  actions: {
    "aud-cat:": async (action) => {
      edAudUi.cat = action.slice(8);
      edAudUi.target = ["dialogue", "ai"].includes(edAudUi.cat) ? "A1" : "A2";
      edAudUi.src = edAudBuiltin.includes(edAudUi.cat) ? "builtin" : "library";
      edAudUi.genre = "全部";
      edRedraw();
    },
    "aud-src:": async (action) => {
      edAudUi.src = action.slice(8);
      edRedraw();
    },
    "aud-target:": async (action) => {
      edAudUi.target = action.slice(11);
      edRedraw();
    },
    "aud-genre:": async (action) => {
      edAudUi.genre = action.slice(10);
      edRedraw();
    },
    "aud-sort:": async (action) => {
      edAudUi.sort = action.slice(9);
      edRedraw();
    },
    "aud-play:": async (action) => {
      const url = action.slice(9);
      edAudPlayer.pause();
      if (edAudUi.playing === url) edAudUi.playing = null;
      else {
        edAudUi.playing = url;
        edAudPlayer.src = VideoWorkbench.safeUrl(url);
        edAudPlayer.play().catch(() => (edAudUi.playing = null));
      }
      edRedraw();
    },
    "aud-builtin:": async (action, p) => {
      const it = edAudUi.catalog?.items.find((x) => x.id === action.slice(12));
      if (it) await edAudAddBuiltin(p, it);
    },
    "aud-add:": async (action, p) => {
      const a = (edAudUi.items || []).find((x) => x.id === action.slice(8));
      if (a) await edAudAdd(p, a);
    },
    // Same preference as the 素材 pane's ☆ (read fresh, so neither pane overwrites the other's change).
    "aud-fav:": async (action) => {
      const id = action.slice(8),
        favs = new Set(
          await VideoWorkbench.preferences.get(
            "tools.editor.assetFavorites",
            [],
          ),
        );
      if (favs.has(id)) favs.delete(id);
      else favs.add(id);
      await VideoWorkbench.preferences.set("tools.editor.assetFavorites", [
        ...favs,
      ]);
      edAudUi.favs = favs;
      if (typeof edAssets === "object") edAssets.favs = new Set(favs);
      edRedraw();
    },
    "aud-tag:": async (action) => {
      const [usage, ...rest] = action.slice(8).split(":"),
        a = (edAudUi.items || []).find((x) => x.id === rest.join(":"));
      if (!a || !edAudUsages.includes(usage)) return;
      await VideoWorkbench.assets.save({
        ...a,
        tags: [
          ...(a.tags || []).filter((t) => !edAudUsages.includes(t)),
          usage,
        ],
      });
      await edAudLoad();
    },
    // Upload in a category = tagged with it; each file goes to the target track at the playhead.
    "aud-upload": async (action, p) => {
      const input = document.createElement("input"),
        usage = edAudUsages.includes(edAudUi.cat) ? edAudUi.cat : null;
      input.type = "file";
      input.multiple = true;
      input.accept = "audio/*";
      input.onchange = async () => {
        for (const file of input.files || []) {
          try {
            let a = await VideoWorkbench.uploadAsset(file);
            if (usage)
              await VideoWorkbench.assets.save(
                (a = { ...a, tags: [...(a.tags || []), usage] }),
              );
            if (typeof edAssets === "object") edAssets.session.add(a.id);
            if (edProject() === p) await edAudAdd(p, a);
          } catch (e) {
            VideoWorkbench.reportError(e);
          }
        }
        if (edAudUi.src === "builtin") edAudUi.src = "session";
        await edAudLoad().catch(VideoWorkbench.reportError);
      };
      input.click();
    },
    "aud-set:": async (action, p) => {
      const key = action.slice(8);
      if (!["snap", "duck", "loop"].includes(key)) return;
      const s = edAudSettings(p);
      s[key] = !s[key];
      // Computed first: a loop the export could not take throws here, before the undo step and any change.
      const clips = key !== "loop" ? p.clips : s.loop ? edAudLoopClips(p, p.clips) : p.clips.filter((c) => !c.loopOf);
      edCheckpoint();
      p.audioSettings = s;
      p.clips = clips;
      // 旁白時降低: every clip on the music track follows the setting (the inspector can still change one clip).
      if (key === "duck")
        for (const c of p.clips.filter((x) => x.kind === "audio" && x.track === edAudMusic(p))) {
          if (s.duck) c.duck = true;
          else delete c.duck;
        }
      await edCommit(p);
    },
    // The video changed after 循環延伸: rebuild the copies to the new end.
    "aud-loop-refresh": async (action, p) => {
      const clips = edAudLoopClips(p, p.clips);
      edCheckpoint();
      p.clips = clips;
      await edCommit(p);
    },
    "aud-vo-model:": async (action) => {
      edAudUi.vo.model = action.slice(13);
      edAudUi.vo.voice = "";
      edRedraw();
    },
    "aud-vo-voice:": async (action) => {
      edAudUi.vo.voice = action.slice(13);
      edRedraw();
    },
    "aud-vo-generate": async (action, p) => {
      const vo = edAudUi.vo,
        m = edAudVoiceModel(),
        text = vo.text.trim();
      if (!m) throw Error("沒有可用的配音服務");
      if (!text) throw Error("請先輸入旁白內容");
      const speed = Math.min(200, Math.max(50, Number(vo.speed) || 100)),
        pitch = Math.min(12, Math.max(-12, Math.round(Number(vo.pitch) || 0))),
        gain = Math.min(200, Math.max(10, Number(vo.gain) || 100));
      // paid: video.tts
      const job = await VideoWorkbench.generations.create({
        type: "audio",
        operation: "voice",
        prompt: text,
        ...(vo.style.trim() ? { instructions: vo.style.trim() } : {}),
        speechModel: m.id,
        voice: m.voices.some((v) => v.id === vo.voice)
          ? vo.voice
          : m.defaultVoice,
        settings: {
          voiceSpeed: speed / 100,
          voicePitch: pitch,
          voiceGain: Math.round(20 * Math.log10(gain / 100) * 10) / 10,
        },
      });
      VideoWorkbench.showJob(job, {
        apply: async (v) => {
          if (v.status !== "succeeded") return false;
          if (edProject() !== p) throw Error("請先回到原本的剪輯專案");
          edAudUi.voiceJobs.add("job-" + v.id);
          await edAudAdd(p, VideoWorkbench.jobAsset(v), EditorModel.NARRATION);
        },
        applyLabel: "加到旁白 A1",
      });
    },
    // Mutating: one undo step, then the shared commit (same order as the old edAction tail).
    "loudness:": async (action, p) => {
      edCheckpoint();
      edSetLoudness(p, Number(action.slice(9)));
      await edCommit(p);
    },
    "key-add": async (action, p, c) => {
      edCheckpoint();
      if (c) {
        const frame = edFrame(p) - c.startFrame,
          gain = Number(
            document.querySelector("[data-ed-key-gain]")?.value ?? 1,
          );
        if (frame < 0 || frame > c.durationFrames)
          throw Error("播放頭需位於片段內");
        c.volumeKeys = EditorModel.volumeKeys(
          [
            ...(c.volumeKeys || []).filter((k) => k.frame !== frame),
            { frame, gain },
          ],
          c.durationFrames,
        );
      }
      await edCommit(p);
    },
    "key-delete:": async (action, p, c) => {
      edCheckpoint();
      if (c) {
        c.volumeKeys = (c.volumeKeys || []).filter(
          (_, i) => i !== Number(action.slice(11)),
        );
        if (!c.volumeKeys.length) delete c.volumeKeys;
      }
      await edCommit(p);
    },
  },
});
// AI 旁白 fields keep their text without a repaint (the caret stays).
document.addEventListener("input", (e) => {
  const key = e.target.dataset?.edVo;
  if (key && key in edAudUi.vo) edAudUi.vo[key] = e.target.value;
});
