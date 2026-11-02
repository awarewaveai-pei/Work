# 應用工具核對與驗證 — 2026-11-01

本輪已在官方頁實際開啟 15 項工具及選入素材後的表單。逐項紀錄見 [官方核對紀錄](tools-reference-audit-20261101.md)。沒有按官方付費生成／分析／匯出，不能宣稱所有付費結果已驗收，也不能宣稱與官方完全相同。

## 本機驗證

- tools-workflows.cjs：條件表單、深度設定草稿、真實手動直式裁切、逐行字幕與翻譯契約、真實燒錄、配音語速／音調／音量後製、音樂配置與原創歌詞契約、短片分析／校對／含字幕裁切輸出、無字幕先辨識及純手動輸出、CTA 七樣式／九宮格／鍵盤調整／去白底透明像素與合成、零框選圖片編輯。
- tools-editor.cjs：專案建立與持久保存、五軌、八分頁、分割／復原／重做、文字、融接與真正 720×900 MP4／AAC 匯出。
- voice-mix.cjs：檢查輸出音訊同時包含原片 440Hz 與旁白 660Hz，確認沒有蓋掉原音軌。
- backend.cjs：供應商契約、任務下載重試、媒體檔保存、FFmpeg 工具、無效請求及跨來源拒絕。
- generation-flows.cjs：導演、專案分鏡、角色配音、字幕草稿與區域指令／移動／縮放／遮罩回歸。
- sidebar-overlays.cjs：桌面／手機 11 個導覽入口在浮層開啟後仍能點擊，切頁正確關閉浮層。
- popover-ratios.cjs：選單完成／關閉／Escape／外部點擊，4:5／4:3 與實際圖片尺寸。
- cta-effects.cjs：CTA 出現時段、靜態／淡入／彈出與實際影片影格。
- 分鏡靈感六份保護檔與既有 SHA256 基準完全一致。保持 AwareWave 主系統主題來源。

供應商呼叫使用 mock；媒體輸出使用真正 FFmpeg。沒有將 mock 成功當成付費供應商實機驗收。

## 跨模型審查

依既有 claude-compat／claude-review 流程：Claude CLI、唯讀 Read/Grep/Glob、停用審查子程序 hooks／MCP，不讀取金鑰或使用者資料。此資料夾沒有 Git，使用凍結原始碼及 SHA256 清單審查；不冒稱產生 Git ORACLE gate artifact。

第一輪找到空字幕分析、還原字幕缺 id、濾鏡丟失 alpha、轉場淡出時間、文字旋轉、語速兼容性、旁白覆蓋原音軌等問題。已修正；複查 approve，最後字幕數量上限調整亦 approve。下方保留審查原文，方便核對。

### 第一輪原文

```json
{"verdict":"request_changes","findings":[{"severity":"major","file":"scripts/tools-short.js","line":8,"issue":"toolSubtitleParse throws '字幕檔沒有有效的 SRT／VTT 時間碼' when it gets no cues. Line 8 calls it with values.subtitleText||'' before deciding whether to transcribe, so analyzing without an imported SRT always fails and never reaches /transcriptions. Line 20 has the same problem: settings.shortCues||toolSubtitleParse(settings.subtitleText||'') throws for clips added by hand or not yet analyzed, even when shortCaption is off, so those clips can't be exported.","fix":"Parse only when the text is non-empty: String(text||'').trim() ? toolSubtitleParse(text) : []. Do this on both lines. The live tree already has this fix."},{"severity":"major","file":"scripts/generator-results.js","line":14,"issue":"Restoring a subtitle-burn job passes input.settings.cues straight through as subtitleCues. Those cues only have start, end and text, with no id. After a restore, translation always fails: the backend rejects cues whose id is not a string ('字幕翻譯資料無效'). Translation lookups by cue.id and the active-row highlight also break.","fix":"Give each restored cue a fresh id: cues.map(c => ({...c, id: crypto.randomUUID()})). The live tree already does this."},{"severity":"major","file":"backend/editor-export.cjs","line":82,"issue":"The color presets built on eq (鮮豔, 復古, 電影感, 底片, 憂鬱, 清新, 賽博霓虹, 黑色電影, 美食, 人像, 冷冽) run after format=rgba. FFmpeg's eq filter only accepts planar YUV or gray without alpha, so the graph converts to yuv420p and drops the alpha channel. Everything after it then silently fails: the transparent padding on V2 overlays and transparent PNG stickers turn opaque, and masks, opacity and the geq transitions (融接, wipes, 圓形裁切) stop working. With a transition, the incoming clip appears as a fully opaque hard cut half a transition early.","fix":"Keep alpha around the color step. Either split, run alphaextract on one branch and eq on the other, then alphamerge. Or apply the color filter before pad/format=rgba on V1 and use the alphaextract/alphamerge route for V2. Add a test that combines a filter with a mask or transition."},{"severity":"minor","file":"backend/editor-export.cjs","line":97,"issue":"The 淡入淡出 fade-out starts at clip.duration - d/2 and ignores preRoll. When the same clip also has a non-fade incoming transition, its timeline is shifted by preRoll, so the fade finishes preRoll seconds early and leaves a black gap before the next clip.","fix":"Use st = preRoll + clip.duration - leave.duration/2."},{"severity":"minor","file":"backend/editor-export.cjs","line":114,"issue":"Text rotation goes into the ASS Angle field unchanged. ASS angles turn counter-clockwise, but the editor preview (CSS rotate) and the video rotate filter turn clockwise, so exported text rotates the opposite way from the preview.","fix":"Write -clip.rotation into the ASS Angle (or use \\frz)."},{"severity":"minor","file":"backend/api.cjs","line":245,"issue":"Voice speed is sent as the TTS 'speed' parameter, but the default model is gpt-4o-mini-tts. As far as I know, OpenAI says speed doesn't work with that model, so the 語速 setting may do nothing. The tests only checked pitch and gain, not speed.","fix":"Apply speed locally with atempo inside adjustVoice, or only send it for models that support it."},{"severity":"minor","file":"backend/media.cjs","line":55,"issue":"voice-overlay maps only the generated voice track (-map 1:a:0), so the original audio of the source video (dialogue or music) is dropped from the output. The UI says the voice is laid in as background music or narration.","fix":"Mix the original track with the voice using amix, or state clearly in the UI that the original audio will be replaced."}],"summary":"Overall the change is solid: backend validation, stale-reply guards (request counters, fingerprints, edProject checks), filtergraph escaping, and the subtitle and editor paths all look careful. Four bugs in the snapshot block approval. Short-clip analysis and export fail when no SRT is imported. Translation always fails after a subtitle-burn job is restored, because the restored cues have no ids. The eq-based editor color filters drop alpha, which breaks masks, opacity, V2 transparency and transitions. Two smaller transition and text-rotation export mismatches also need fixes. The live tree already fixes the first two. Paid provider outputs were not checked."}
```


### 修正後複查原文

```json
{"verdict":"approve","findings":[],"summary":"I checked all seven prior findings against the final verify-source snapshot and the fix diff. All seven are fixed, and I found no remaining concrete bugs in how the changed files work together. (1) tools-short.js:33-35 and :137-140 only call toolSubtitleParse when the trimmed text is non-empty, so analysis without an SRT goes on to transcription, and clips added by hand or not yet analyzed can still export. (2) generator-results.js:14 gives every restored subtitle-burn cue a new id with crypto.randomUUID(). (3) editor-export.cjs: when a filter or grain is set, the rgba stream is split. One branch goes through alphaextract, the other through the eq/colorbalance/noise chain and format=rgb24, and the two are joined with alphamerge. Rotation, masks, opacity, the geq transitions and alpha fades run afterwards on a stream that still has alpha. Grain now runs in the color branch, and the 模糊 background path feeds the same chain. (4) The 淡入淡出 fade-out now starts at preRoll + clip.duration - leave.duration/2. (5) The ASS Style Angle is now -clip.rotation. (6) api.cjs no longer sends speed to the TTS provider. It calls adjustVoice whenever speed is not 1. adjustVoice checks speed is between 0.25 and 4 and applies it as two atempo=sqrt(speed) stages, so each stage stays within 0.5 to 2. api.cjs:194 already rejects null, empty and out-of-range voiceSpeed values first. (7) For video sources, media.cjs voice-overlay uses inspectMedia to check for an original audio track. If there is one, it mixes [0:a:0][1:a:0] with amix (duration=first, normalize=0). Silent videos and still images keep the old 1:a:0 + apad path. The -vf on the directly mapped video stream works alongside the audio-only -filter_complex. All of this comes from reading the code: I didn't run anything, and the editor render tests you mentioned are still in progress."}
```


### 字幕數量限制複查原文

{"verdict":"approve","findings":[],"summary":"The new clip limit has no correctness or security regressions. validateProject now rejects projects with more than 64 non-text clips (kind !== 'text') or more than 2000 text clips (lines 42-44). The overall 2064 cap is redundant because the two per-kind caps already imply it, but it does no harm. Only non-text clips become ffmpeg `-i` inputs and per-layer filtergraph chains (lines 213-238 and 267-414), and that count keeps the old cap of 64, so the command line and filter_complex can't grow more than before. All visible text clips go into one temporary ASS file used by a single `ass=` filter (lines 415-491), so 2000 text clips add only one filtergraph node. The ASS file is removed in the finally block. Each text clip is still checked: text must be a string of at most 4000 chars; `\\`, `{` and `}` are escaped; color must be a strict hex value; fontSize, x/y and rotation must be finite and in range; animation must come from a fixed list. Style and Dialogue indices come from internal counters, not user input, so they can't be used to inject ASS content. The 2000-text limit matches the existing 2000-cue limit in subtitle-burn.cjs. Total input size stays bounded by the 80MB request body limit in api.cjs body(). Clip ids are still checked for format and duplicates, and total duration is still capped at 3600s. An all-text project still works: the black lavfi base gives a video stream, and anullsrc alone feeds amix. One behavior is unchanged from the approved snapshot: a null entry in the clips array passes the optional-chaining count filters, then throws a TypeError on `c.track` inside map. The request still fails, just with a generic message rather than a crash or bypass."}


### 最終原始碼 SHA256

```json
[
  {
    "file": "backend/api.cjs",
    "sha256": "d1a266c6c381913550f475c6e3b4bad98272bdfd9349a4bc9a6f7fb0ce38b7d0"
  },
  {
    "file": "backend/editor-export.cjs",
    "sha256": "e1b4f0d46eb7fd4daecb43340adca40e58a563c62d5001c9749eede8f910d2d6"
  },
  {
    "file": "backend/generation-policy.cjs",
    "sha256": "31ba35ee0af8ce11643fd5a4069a7ebdcd873e47fdfef80c7ffacd7fe4d883ff"
  },
  {
    "file": "backend/media-inspect.cjs",
    "sha256": "857818808444e0cad20e26c26c47f450a4c2453d2796d0ff7d5cea1309ae47d7"
  },
  {
    "file": "backend/media.cjs",
    "sha256": "6e119d329c07fb13b32007316525c824b47924df21ebef1eaf8297a320f1561e"
  },
  {
    "file": "backend/subtitle-burn.cjs",
    "sha256": "15a239e22cdbc384544580775aa7fe91bad08f981dd06fe3a7ffd018ad08d4af"
  },
  {
    "file": "scripts/generator-results.js",
    "sha256": "e9c26510380eeb3e52b7e01671a5d10dd47e4a17004153a9d218a7aed38df8c5"
  },
  {
    "file": "scripts/package.cjs",
    "sha256": "cd93f2c6b1eb2f259aea15037e16b0acdef90437ff855d9ca8fc5b0aea8ac6ae"
  },
  {
    "file": "scripts/tool-processing.js",
    "sha256": "196a6435f22f779b61b3ff6ab4ed46f30328c7df0ee93d9ae470367a6cb20558"
  },
  {
    "file": "scripts/tools-0.js",
    "sha256": "7e3a770de7c6ac1f2d292daeeecd3edb6b0bfd2a04ce0399065b70727dcf1840"
  },
  {
    "file": "scripts/tools-boot.js",
    "sha256": "693a106ad0c7acfeb5b423bf838b66de6ff18ee5bbdbd68099adc1f5e7b31213"
  },
  {
    "file": "scripts/tools-editor.js",
    "sha256": "0eef98c67cbe6b080f3285608bec67966289096a5e63b577173d17141658d380"
  },
  {
    "file": "scripts/tools-overlays.js",
    "sha256": "2acc2b1d505a3097a494ec201a4b638d3acb7a0a6e2af176c52224851aab8b19"
  },
  {
    "file": "scripts/tools-short.js",
    "sha256": "f6921b00dc3f3195bd96a2e2f37876c2edd6e5e768dbef61c63a72e47cd87000"
  },
  {
    "file": "scripts/tools-subtitles.js",
    "sha256": "057418d3f5dc78f013777333dbcf0c8d200e26dbdc58e9a7d719b8d3dd082c68"
  },
  {
    "file": "scripts/tools-voice-music.js",
    "sha256": "1df10b5268c410208aeb6efe6b4afeaee1012fedb16cceb9d514fd886ab7b64f"
  },
  {
    "file": "scripts/tools-workflows.js",
    "sha256": "9b627b819642bd0cf69076cb88f29fc46798046d0a08df22f3e56d82cd73e8e3"
  },
  {
    "file": "shared/jobs-view.js",
    "sha256": "fd8f9d91010f5fb1db54292ae4a886997ab485573046eda771ad42e5c4b7183e"
  },
  {
    "file": "shared/runtime.js",
    "sha256": "ac700cd284fff4d4fe686af989ddfa9ed768c7d09015b84518aa4c88da54061d"
  },
  {
    "file": "styles/tools.css",
    "sha256": "b2ed1cc6421a8b26a2744dc8d1f56736adfb7f37818c7b979e11b286737a6092"
  }
]
```
