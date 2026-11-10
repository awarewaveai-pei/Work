// Card ED.0: the 「音訊」 left pane (spec §3 檔案歸屬: ED.6). Registered with edRegisterPane in tools-editor.js.
function edLoudnessPane(p) {
  return `<h4>響度目標</h4>${edChoices("響度目標", "loudness", p.output.loudness, EditorModel.LOUDNESS.presets, (v) => v + " LUFS")}<p class="note">目前 ${p.output.loudness} LUFS。輸出時先量整段混音，再線性調到目標（誤差 ±1 LU），真峰值壓在 −1 dBTP 以下。−23 廣播、−16 一般網路、−14 串流平台。</p>`;
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
  return `<div class="row editor-peak" data-ed-peak role="meter" aria-label="主輸出峰值" aria-valuemin="-60" aria-valuemax="0" aria-valuenow="-60"><span class="editor-peak-bar" style="display:inline-block;width:160px;height:8px;border:1px solid currentColor;position:relative"><i data-ed-peak-fill style="position:absolute;left:0;top:0;bottom:0;width:0;background:#4ade80"></i></span><span data-ed-peak-text>峰值 — dBFS</span><span class="note">播放時顯示；超過 −1 dB 會在輸出時自動壓低</span></div>`;
}
edRegisterPane("audio", {
  title: "音訊",
  icon: "♪",
  render: (p, c) => `<h3>音訊</h3>${edButton("選擇音訊", "library:audio")}${edButton("上傳音訊", "upload:audio")}<p class="note">每條音訊軌可獨立安排時間、音量、淡入淡出與音量均衡；音量＝片段音量 × 軌道音量（0 為靜音）。</p>${edLoudnessPane(p)}${edPeakMeter()}${c && ["video", "audio"].includes(c.kind) ? edKeysPane(p, c) : ""}`,
  actions: {
    // Mutating: one undo step, then the shared commit (same order as the old edAction tail).
    "loudness:": async (action, p) => {
      edCheckpoint();
      p.output = { ...p.output, loudness: Number(action.slice(9)) };
      await edCommit(p);
    },
    "key-add": async (action, p, c) => {
      edCheckpoint();
      if (c) {
        const frame = edFrame(p) - c.startFrame,
          gain = Number(document.querySelector("[data-ed-key-gain]")?.value ?? 1);
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
