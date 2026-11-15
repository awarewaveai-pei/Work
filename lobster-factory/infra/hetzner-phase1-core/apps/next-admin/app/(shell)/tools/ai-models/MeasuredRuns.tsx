// 實測紀錄 tab of /tools/ai-models — real paid/free runs of 2026-11-13/14 for video, music and speech/audio vendors.
// Every figure is a recorded run (WORKLOG heading in the 出處 column); no catalog value is read or changed here.
// Within each tool the rows are cheapest first. Region-edit (圖片局部編輯) is on /tools/edit-guide section 十一, not repeated here.
import Link from "next/link";
import { MUSIC_RATES, musicUsd } from "@/lib/ai/cost-model";
import { nt } from "@/lib/studio/model-options";

/** NT$ of one song from the app's own music price table, so a list price here cannot drift from the app. */
const songNt = (id: keyof typeof MUSIC_RATES) => `NT$${nt(musicUsd(id)).toFixed(2)}`;

const LINE = "var(--card-border)";
type Row = { date: string; model: string; asked: string; money: string; result: string; src: string; verdict?: "good" | "bad" | "todo" };
type Group = { title: string; intro?: string; rows: Row[]; image?: { src: string; alt: string; caption: string } };

const W9 = "2026-11-13（續9）影音工作台三張卡整合：音樂生成接三模型、圖片局部編輯器補齊、新工具破框貼文動畫";
const W12 = "2026-11-13（續12）ElevenLabs 免費額度接進配音、字幕辨識、音軌分離、去配樂・重配音效";
const W5 = "2026-11-14（續5）破框：入口邊開格、照參考改寫提示詞、頁面畫鎖定遮罩（任務自己的輸入）";

const GROUPS: Group[] = [
  {
    title: "影片：破框貼文動畫",
    intro: "同一個流程（IG 貼文、照片當第一格、5 秒、9:16），主角要往下衝出照片。貼文文字列由我們鎖定。",
    rows: [
      { date: "2026-11-13/14", model: "Runway Gen-4 Turbo", asked: "照片裡的主角衝出貼文框，真跑 5 次", money: "實扣 NT$8.00，標價 NT$8.00（一致）",
        result: "5 次主角都沒離開照片。文字列「12.4K／389／127」在第 0／30／60／90／119 格完全相同（有鎖定時）。", src: W5, verdict: "bad" },
      { date: "2026-11-15", model: "Luma Ray 3.2", asked: "同一個流程，主角衝出照片", money: "實扣 NT$9.60，標價 NT$9.60（一致）", result: "主角走到照片邊緣，之後以半透明的霧狀蓋住下方貼文，不是乾淨地衝出去。主角蓋上去之前，文字都鎖住。", src: W5, verdict: "bad" },
      { date: "尚未實測", model: "Veo 3.1 Fast", asked: "—", money: "—", result: "還沒跑。", src: W5, verdict: "todo" },
      { date: "（日期未記）", model: "Seedance 2.0 Fast（不採用：中國模型）", asked: "同一個流程，兩張照片各一次", money: "Replicate 沒回報費用", result: "有人的照片被拒絕；沒有人的照片，主角乾淨地衝出照片。因為是中國模型，不提供給使用者。", src: "破框 session 回報（WORKLOG 還沒寫）", verdict: "bad" },
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
          <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>2026-11-13／14 真實呼叫</span>
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
                    <td style={{ ...td, fontSize: 12, color: "var(--text-muted)" }}>WORKLOG {r.src}</td>
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
