// Card U8.3 (plan §8 #13): the 片頭 form starts from the episode, counts characters, and asks for a picture from the
// episode's words. Pure rules in shared/editor-model.js; the template tables are the real ones (backend/remotion.cjs).
const assert = require("node:assert/strict");
const { titlePrefill, titleCount, titleImagePrompt } = require("../shared/editor-model.js");
const { catalog } = require("../backend/remotion.cjs");

const circle = catalog.find((t) => t.id === "circle-mask-text-slideup-reveal");
const slideup = catalog.find((t) => t.id === "scale-bg-text-slideup");
const episode = { title: "新手畫畫三步", line: "今天一起學畫畫，".repeat(15) };

// 1. empty text fields are filled (title -> headline, first shot's line -> tagline, cut to the field max); a field the user
//    already filled stays; so does one they cleared; fields that are not the title or tagline stay empty.
const filled = titlePrefill({}, circle, episode);
assert.equal(filled.headline, "新手畫畫三步");
assert.ok(episode.line.length > 80, "the line is longer than the tagline max");
assert.equal(filled.tagline.length, circle.fields.find((f) => f.key === "tagline").max, "副標截到欄位 max");
assert.equal(filled.tagline, episode.line.slice(0, 80));
assert.equal(filled.brand, undefined, "品牌名稱不從這一集猜");
assert.equal(filled.imageUrl, undefined, "圖片欄位不是文字欄位");
assert.deepEqual(titlePrefill({ headline: "我自己寫的", tagline: "" }, circle, episode), { headline: "我自己寫的", tagline: "" }, "已填、已清空的不覆蓋");
assert.equal(titlePrefill({}, slideup, episode).text, "新手畫畫三步", "另一個模板的標題欄位也預填");
assert.equal(titlePrefill({ x: 1 }, circle, {}).headline, undefined, "這一集沒有標題／旁白就留空");
assert.equal(titlePrefill({}, circle, { title: "  兩行\n標題 " }).headline, "兩行 標題", "換行壓成一行");

// 2. the counter reads typed/max, and the form's own max is the one the input stops at.
assert.equal(titleCount("新手畫畫三步", 20), "6/20");
assert.equal(titleCount(undefined, 80), "0/80");
assert.equal(titleCount("a".repeat(20), 20), "20/20");

// 3. the picture prompt comes from the scene's own text, else the title, else the episode; never asks for words in the picture.
assert.match(titleImagePrompt({ text2: "海邊日落", headline: "別的" }, "imageUrl2", "x"), /海邊日落$/);
assert.match(titleImagePrompt({ headline: "主標" }, "imageUrl", "x"), /主標$/);
assert.match(titleImagePrompt({}, "imageUrl", "這一集"), /這一集$/);
assert.equal(titleImagePrompt({}, "imageUrl", ""), "", "沒有任何文字就不生成");
assert.match(titleImagePrompt({ text: "a" }, "imageUrl", ""), /不要出現任何文字/);
console.log("PASS u8 title form: prefill, counter, picture prompt");
