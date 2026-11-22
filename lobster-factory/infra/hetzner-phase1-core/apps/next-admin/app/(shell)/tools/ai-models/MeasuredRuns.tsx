// 實測紀錄 tab of /tools/ai-models — real paid/free runs of 2026-11-13/14 for video, music and speech/audio vendors.
// Every figure is a recorded run (WORKLOG heading in the 出處 column); no catalog value is read or changed here.
// Within each tool the rows are cheapest first. Region-edit (圖片局部編輯) is on /tools/edit-guide section 十一, not repeated here.
import Link from "next/link";
import { MUSIC_RATES, musicUsd } from "@/lib/ai/cost-model";
import { nt } from "@/lib/studio/model-options";

/** NT$ of one song from the app's own music price table, so a list price here cannot drift from the app. */
const songNt = (id: keyof typeof MUSIC_RATES) => `NT$${nt(musicUsd(id)).toFixed(2)}`;

const LINE = "var(--card-border)";
type Row = { date: string; model: string; asked: string; money: string; result: string; src: string; verdict?: "good" | "bad" | "todo"; plain?: boolean };
type Group = { title: string; intro?: string; rows: Row[]; image?: { src: string; alt: string; caption: string } };

const W9 = "2026-11-13（續9）影音工作台三張卡整合：音樂生成接三模型、圖片局部編輯器補齊、新工具破框貼文動畫";
const W12 = "2026-11-13（續12）ElevenLabs 免費額度接進配音、字幕辨識、音軌分離、去配樂・重配音效";
const W5 = "2026-11-14（續5）破框：入口邊開格、照參考改寫提示詞、頁面畫鎖定遮罩（任務自己的輸入）";

const ART = "agency-os/reports/model-bakeoff/2026-11-article/（key.json、editor-review.md）";

const GROUPS: Group[] = [
  {
    title: "文章生成",
    intro: "2026-11-22 正式站，同一題目同一條件各一篇；操作者選定 GPT-6.2 sol 為文章預設。名次是繁中編輯盲評（12 篇）；第 1–4 名輕修可上，第 9–12 名接近重寫。",
    rows: [
      { date: "2026-11-22", model: "Claude Haiku 5.5", asked: "「職場倦怠」一篇文章，同題目同條件", money: "實扣 NT$0.08", result: "編輯盲評第 8 名。只有常識，沒有東西可帶走；乾淨安全。耗時 24 秒、2,621 字、SEO 59 分、未查證標記 0 處。", src: ART },
      { date: "2026-11-22", model: "GPT-6 luna", asked: "「職場倦怠」一篇文章，同題目同條件", money: "實扣 NT$0.13", result: "編輯盲評第 9 名。安全過頭，免責聲明蓋過內容。耗時 55 秒、4,297 字、SEO 82 分、未查證標記 0 處。", src: ART, verdict: "bad" },
      { date: "2026-11-22", model: "GPT-5.4 nano", asked: "「職場倦怠」一篇文章，同題目同條件", money: "實扣 NT$0.25", result: "編輯盲評第 12 名。用語不像台灣、引用標記滿篇、標題農場味，需重寫。耗時 33 秒、5,298 字、SEO 64 分、未查證標記 1 處。", src: ART, verdict: "bad" },
      { date: "2026-11-22", model: "GPT-5.4 mini", asked: "「職場倦怠」一篇文章，同題目同條件", money: "實扣 NT$0.71", result: "編輯盲評第 11 名。連結原始碼外露、內容重複、缺專線。耗時 23 秒、3,801 字、SEO 68 分、未查證標記 5 處。", src: ART, verdict: "bad" },
      { date: "2026-11-22", model: "GPT-6.1 terra", asked: "「職場倦怠」一篇文章，同題目同條件", money: "實扣 NT$1.02", result: "編輯盲評第 5 名。穩、克制、實用；要刪掉 5 處「待查」字樣。耗時 82 秒、4,328 字、SEO 77 分、未查證標記 6 處。", src: ART },
      { date: "2026-11-22", model: "GPT-6.2 sol（選定為文章預設）", asked: "「職場倦怠」一篇文章，同題目同條件", money: "實扣 NT$1.96", result: "編輯盲評第 2 名。話術具體、查對請假規則；要刪 6 處「年份未核」外露標記。耗時 80 秒、4,338 字、SEO 86 分、未查證標記 0 處。", src: ART, verdict: "good" },
      { date: "2026-11-22", model: "Claude Sonnet 5.5", asked: "「職場倦怠」一篇文章，同題目同條件", money: "實扣 NT$2.16", result: "編輯盲評第 3 名。最貼題、篇幅最剛好；有一處媒體歸屬寫錯。耗時 46 秒、3,576 字、SEO 68 分、未查證標記 0 處。", src: ART, verdict: "good" },
      { date: "2026-11-22", model: "GPT-5.4", asked: "「職場倦怠」一篇文章，同題目同條件", money: "實扣 NT$2.88", result: "編輯盲評第 10 名。假經驗口吻、空泛引用、後段灌水。耗時 84 秒、4,978 字、SEO 73 分、未查證標記 3 處。", src: ART, verdict: "bad" },
      { date: "2026-11-22", model: "GPT-6.2 astra", asked: "「職場倦怠」一篇文章，同題目同條件", money: "實扣 NT$6.68", result: "編輯盲評第 1 名。最像真人編輯寫的，話術可直接用，零杜撰。耗時 105 秒、4,117 字、SEO 82 分、未查證標記 3 處。", src: ART, verdict: "good" },
      { date: "2026-11-22", model: "Claude Opus 5.5（原預設）", asked: "「職場倦怠」一篇文章，同題目同條件", money: "實扣 NT$8.03", result: "編輯盲評第 4 名。最完整、台灣資源最齊；太長、套話多。耗時 119 秒、5,221 字、SEO 86 分、未查證標記 7 處。", src: ART, verdict: "good" },
      { date: "2026-11-22", model: "GPT-5.5", asked: "「職場倦怠」一篇文章，同題目同條件", money: "實扣 NT$8.72", result: "編輯盲評第 7 名。內容好但寫到一半被截斷；門檻數字自創。耗時 164 秒、4,850 字、SEO 77 分、未查證標記 3 處。", src: ART },
      { date: "2026-11-22", model: "Claude Fable 5.1", asked: "「職場倦怠」一篇文章，同題目同條件", money: "實扣 NT$19.56", result: "編輯盲評第 6 名。結構與切題滿分，但杜撰數字與引用最多。耗時 167 秒、5,437 字、SEO 82 分、未查證標記 13 處。", src: ART },
    ],
  },
  {
    title: "影片：破框貼文動畫",
    intro: "同一個流程（IG 貼文、照片當第一格、5 秒、9:16），主角要往下衝出照片。貼文文字列由我們鎖定。",
    rows: [
      { date: "2026-11-13/14", model: "Runway Gen-4 Turbo", asked: "照片裡的主角衝出貼文框，真跑 5 次", money: "實扣 NT$8.00，標價 NT$8.00（一致）",
        result: "5 次主角都沒離開照片。文字列「12.4K／389／127」在第 0／30／60／90／119 格完全相同（有鎖定時）。", src: W5, verdict: "bad" },
      { date: "2026-11-15", model: "Luma Ray 3.2", asked: "同一個流程，從工具頁面送出", money: "實扣 NT$9.60，標價 NT$9.60（一致）", result: "鯊魚出現了，但沒有乾淨衝出照片框，後段變成一層霧蓋過貼文。同一天另用全英文提示詞直接在 Replicate 跑一次：第 30 格衝出照片框，之後模型把貼文下方的文字整塊抹掉（這次扣款沒對帳）。", src: "Replicate 帳單畫面與各次 prediction 回應（WORKLOG 沒寫）", verdict: "bad", plain: true },
      { date: "2026-11-15", model: "Grok Imagine Video", asked: "5 秒、720p、9:16，用有人物的貼文照片", money: "估約 NT$11.20（依模型頁牌價估，實扣沒對帳）", result: "接受有人物的照片。鯊魚的鰭越過照片下緣，蓋到圖示列。", src: "Replicate 帳單畫面與各次 prediction 回應（WORKLOG 沒寫）", verdict: "bad", plain: true },
      { date: "2026-11-15", model: "Seedance 2.0 Fast（不採用：中國模型）", asked: "同一個流程，兩次", money: "第一次沒收費；第二次帳單約 NT$24.00", result: "第一次失敗（E005）：照片裡有看起來像真人的人物。第二次用沒有人的拿鐵照片，5 秒、720p、無聲，鯊魚乾淨地衝出照片框。因為是中國模型，不提供給使用者。", src: "Replicate 帳單畫面與各次 prediction 回應（WORKLOG 沒寫）", verdict: "bad", plain: true },
      { date: "尚未實測", model: "Veo 3.1 Fast", asked: "—", money: "—", result: "還沒跑。", src: W5, verdict: "todo" },
    ],
    image: { src: "/guides/breakout-frames.jpg", alt: "Runway 破框貼文動畫的第 0、30、60、90、119 格", caption: "Runway 第 5 次：第 0／30／60／90／119 格。照片裡的鯊魚一直在照片內，下方文字列每一格都一樣。" },
  },
  {
    title: "音樂生成",
    rows: [
      { date: "2026-11-13", model: "Lyria 3 Clip", asked: "生成一首歌", money: `實扣 ${songNt("lyria-3-clip-preview")}，標價 ${songNt("lyria-3-clip-preview")}（一致）`, result: "成功。", src: W9, verdict: "good" },
      { date: "尚未實測", model: "Lyria 3.5", asked: "—", money: `標價 ${songNt("lyria-3.5")}／首`, result: "還沒跑。", src: W9, verdict: "todo" },
      { date: "2026-11-13", model: "Eleven Music", asked: "生成音樂（免費方案帳號）", money: "實扣 0 點", result: "被拒：402 paid_plan_required。這個模型需要付費的 ElevenLabs 方案，目前不接。", src: W12, verdict: "bad" },
    ],
  },
  {
    title: "語音與音訊：ElevenLabs 免費方案（每月 10,000 點）",
    intro: "每一項都是透過 API 真的呼叫一次，回應全部 200，實扣 NT$0.00（免費額度內）。",
    rows: [
      { date: "2026-11-13", model: "Scribe v2（字幕辨識）", asked: "辨識一段台灣國語", money: "3 點", result: "成功，但回傳簡體字。現在由我們的路由轉成繁體。", src: W12, verdict: "good" },
      { date: "2026-11-13", model: "Text-to-speech（配音）", asked: "把一段文字念出來", money: "4 點", result: "成功。", src: W12, verdict: "good" },
      { date: "2026-11-13", model: "Sound effects（音效）", asked: "依描述生成一個音效", money: "10 點", result: "成功。", src: W12, verdict: "good" },
      { date: "2026-11-13", model: "Voice isolation（人聲分離）", asked: "分離 5 秒音檔的人聲", money: "100 點", result: "成功。5 秒就用掉 100 點，是這四項裡最貴的。", src: W12, verdict: "good" },
    ],
  },
];

const th: React.CSSProperties = { textAlign: "left", padding: "8px 10px", fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", borderBottom: `1px solid ${LINE}`, whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "8px 10px", fontSize: 13, color: "var(--text-primary)", borderBottom: `1px solid ${LINE}`, verticalAlign: "top", lineHeight: 1.6 };

const tone = (v: Row["verdict"]) => (v === "good" ? "var(--accent-text)" : v === "bad" ? "var(--danger)" : "var(--text-muted)");

export default function MeasuredRuns() {
  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>實測紀錄</h2>
          <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>2026-11-13／14／22 真實呼叫</span>
        </div>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0, maxWidth: 900 }}>
          這一頁只放真的跑過的紀錄：哪一天、哪個模型、做了什麼、實際扣多少、標價是多少、結果如何。每個工具內便宜的排前面。
          「出處」是 WORKLOG 的日期標題，到 agency-os/WORKLOG.md 搜那一行就找得到。
          圖片局部編輯器的五顆鈕比較在 <Link href="/tools/edit-guide" style={{ color: "var(--accent-text)" }}>改圖怎麼挑</Link> 第十一節。
        </p>
      </div>

      {GROUPS.map((g) => (
        <section key={g.title} style={{ marginBottom: 28 }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, color: "var(--text-primary)", margin: "0 0 6px" }}>{g.title}</h3>
          {g.intro ? <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 10px", maxWidth: 900 }}>{g.intro}</p> : null}
          <div style={{ overflowX: "auto", background: "var(--card-bg)", border: `1px solid ${LINE}`, borderRadius: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
              <thead><tr>{["日期", "模型", "做了什麼", "實扣／標價", "結果", "出處"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {g.rows.map((r, i) => (
                  <tr key={i}>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{r.date}</td>
                    <td style={{ ...td, fontWeight: 700, color: tone(r.verdict) }}>{r.model}</td>
                    <td style={td}>{r.asked}</td>
                    <td style={{ ...td, fontVariantNumeric: "tabular-nums" }}>{r.money}</td>
                    <td style={td}>{r.result}</td>
                    <td style={{ ...td, fontSize: 12, color: "var(--text-muted)" }}>{r.plain || r.src === ART ? r.src : `WORKLOG ${r.src}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {g.image ? (
            <figure style={{ margin: "12px 0 0" }}>
              <img src={g.image.src} alt={g.image.alt} style={{ display: "block", width: "100%", maxWidth: 900, borderRadius: 8, border: `1px solid ${LINE}` }} />
              <figcaption style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 6 }}>{g.image.caption}</figcaption>
            </figure>
          ) : null}
        </section>
      ))}
    </div>
  );
}
