// Card P2 (handoff §4.3 一般字幕): shared/subtitle-parse.js reads SRT and WebVTT (BOM, CRLF, multi-line 繁中,
// overlap kept, hours optional, VTT header/NOTE/cue settings) and refuses bad input in 繁中; POST /subtitles/export
// merges overlaps and writes through the main system's toSrt / toVtt, and its output parses back to the same cues.
const assert = require("node:assert/strict");
const { parse } = require("../shared/subtitle-parse.js"),
  { mergeOverlaps } = require("../backend/subtitle-export.cjs"),
  { isolatedServer } = require("./isolated-server.cjs");

const BOM = String.fromCharCode(0xfeff);
let passed = 0;
const pass = (label) => {
  passed++;
  console.log("PASS " + label);
};

(async () => {
  // SRT: BOM + CRLF + multi-line 繁中 punctuation + an overlap (kept as two cues, in file order).
  const srt = BOM + "1\r\n00:00:01,000 --> 00:00:03,500\r\n第一行，「引號」！\r\n第二行？……\r\n\r\n2\r\n00:00:03,000 --> 00:00:05,000\r\n重疊的字幕\r\n\r\n3\r\n01:00:00,000 --> 01:00:01,250\r\n一小時後\r\n";
  assert.deepEqual(parse(srt), [
    { startMs: 1000, endMs: 3500, text: "第一行，「引號」！\n第二行？……" },
    { startMs: 3000, endMs: 5000, text: "重疊的字幕" },
    { startMs: 3600000, endMs: 3601250, text: "一小時後" },
  ]);
  pass("SRT：BOM、CRLF、多行繁中標點、時間重疊保留兩段、一小時以上時間");

  const vtt = "WEBVTT - 測試\nKind: captions\nLanguage: zh-TW\n\nNOTE 這是註解\n跨兩行\n\nSTYLE\n::cue { color: red }\n\ncue-1\n00:01.000 --> 00:02.500 align:start position:10%\n<v 講者>你好</v>，<i>世界</i>\n\n00:00:02.000 --> 00:00:04.000\n第二段\n多一行\n";
  assert.deepEqual(parse(vtt), [
    { startMs: 1000, endMs: 2500, text: "你好，世界" },
    { startMs: 2000, endMs: 4000, text: "第二段\n多一行" },
  ]);
  pass("WebVTT：檔頭與中繼資料、NOTE／STYLE 區塊、cue 識別碼、cue 設定、無小時時間、內嵌標記去除");

  const errors = [
    [42, /字幕內容必須是文字/],
    ["", /沒有有效的 SRT／VTT 時間碼/],
    ["1\n00:00:02,000 --> 00:00:01,000\n倒退", /第 1 段字幕結束時間需晚於開始時間/],
    ["1\n00:00:01,000 --> 00:00:02,000\n好\n\n2\n00:00:0x,000 --> 00:00:03,000\n壞", /第 2 段字幕時間格式錯誤/],
    ["1\n00:00:01,000 --> 00:00:02,000\n\n", /第 1 段字幕沒有文字/],
    ["只有文字沒有時間", /第 1 段字幕缺少時間/],
    ["WEBVTTX\n\n00:01.000 --> 00:02.000\n嗨", /WebVTT 檔頭格式錯誤/],
  ];
  for (const [input, message] of errors) assert.throws(() => parse(input), message);
  pass("錯誤輸入回繁中訊息並指出第幾段（非文字、空檔、時間倒退、時間格式、無文字、缺時間、壞檔頭）");

  // Pure merge: split at every boundary, overlapping texts joined in time order, equal neighbours re-joined.
  assert.deepEqual(
    mergeOverlaps([
      { startMs: 0, endMs: 4000, text: "甲" },
      { startMs: 2000, endMs: 6000, text: "乙" },
      { startMs: 8000, endMs: 9000, text: "丙" },
    ]),
    [
      { startMs: 0, endMs: 2000, text: "甲" },
      { startMs: 2000, endMs: 4000, text: "甲\n乙" },
      { startMs: 4000, endMs: 6000, text: "乙" },
      { startMs: 8000, endMs: 9000, text: "丙" },
    ],
  );
  pass("重疊合併：在每個邊界切開，重疊處依時間順序以換行合併，空檔不補");

  const { base, server } = await isolatedServer("vw-p2-subtitles-");
  const post = (body) =>
    fetch(base + "/api/seedstar/subtitles/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json() }));
  const cues = parse(srt);
  for (const format of ["srt", "vtt"]) {
    const r = await post({ format, cues });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    if (format === "srt") assert.match(r.body.content, /^1\n00:00:01,000 --> 00:00:03,000\n第一行，「引號」！\n第二行？……\n/);
    else assert.match(r.body.content, /^WEBVTT\n\n1\n00:00:01\.000 --> 00:00:03\.000\n/);
    const back = parse(r.body.content);
    assert.deepEqual(back, mergeOverlaps(cues));
    assert.deepEqual(back[1], { startMs: 3000, endMs: 3500, text: "第一行，「引號」！\n第二行？……\n重疊的字幕" });
    pass(`/subtitles/export ${format}：經主系統 to${format === "srt" ? "Srt" : "Vtt"} 輸出，重疊合併後再解析回來完全一致（${back.length} 段）`);
  }
  for (const [body, message] of [
    [{ format: "ass", cues }, /字幕格式只支援 srt 或 vtt/],
    [{ format: "srt", cues: [] }, /字幕需有 1 到 2000 段/],
    [{ format: "srt", cues: [{ startMs: 5, endMs: 5, text: "x" }] }, /第 1 段字幕時間無效/],
    [{ format: "srt", cues: [{ startMs: 0, endMs: 5, text: "  " }] }, /第 1 段字幕文字無效/],
  ]) {
    const r = await post(body);
    assert.equal(r.status, 400);
    assert.match(r.body.error.message, message);
  }
  pass("/subtitles/export 拒絕無效格式、空清單、零長度與空白文字（400，繁中訊息）");
  console.log(passed + " passed");
  server.closeAllConnections();
  server.close();
})().catch((error) => {
  console.error("FAIL", error);
  process.exit(1);
});
