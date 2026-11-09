// 改圖怎麼挑 — the explainer behind the photo-pro AI panels. Every picture is a real run on one of the operator's own
// tarot cards (2026-11-09, WORKLOG 續1); prices come from the catalog so the page can never quote a stale number.
// Sidebar: AI Models & Costs. Model names and NT$ are read from lib/studio/model-options.ts, never written here.
import Link from "next/link";
import { EDIT_TOOLS, STUDIO_MODEL_OPTIONS, modelsFor, nt } from "@/lib/studio/model-options";

export const metadata = { title: "改圖怎麼挑 · Lobster Factory" };

const SHOT = "/guides/edit";

/** NT$ for one id, from the catalog. */
function price(value: string): string {
  const row = [...STUDIO_MODEL_OPTIONS, ...EDIT_TOOLS].find((m) => m.value === value);
  return row ? `NT$${nt(row.usd).toFixed(2)}` : "—";
}
function labelOf(value: string): string {
  return [...STUDIO_MODEL_OPTIONS, ...EDIT_TOOLS].find((m) => m.value === value)?.label ?? value;
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid var(--card-border)", borderLeft: "4px solid var(--accent)", borderRadius: "0 8px 8px 0",
      background: "var(--bg-subtle)", padding: "12px 14px", margin: "0 0 18px", lineHeight: 1.7 }}>{children}</div>
  );
}
function Shot({ src, alt, tag, tone, caption }: { src: string; alt: string; tag?: string; tone?: "good" | "bad"; caption: React.ReactNode }) {
  return (
    <figure style={{ margin: 0, minWidth: 0 }}>
      {tag ? (
        <span style={{ display: "inline-block", fontSize: 11.5, padding: "1px 8px", borderRadius: 999, marginBottom: 6,
          border: "1px solid currentColor", color: tone === "bad" ? "var(--danger, var(--text-primary))" : "var(--accent-text)" }}>{tag}</span>
      ) : null}
      <img src={src} alt={alt} style={{ display: "block", width: "100%", borderRadius: 8, border: "1px solid var(--card-border)" }} />
      <figcaption style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6, lineHeight: 1.6 }}>{caption}</figcaption>
    </figure>
  );
}
function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div style={{ overflowX: "auto", margin: "0 0 16px" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr>{head.map((h) => (
            <th key={h} style={{ textAlign: "left", padding: "8px 10px", borderBottom: "1px solid var(--card-border)",
              fontSize: 11.5, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text-muted)" }}>{h}</th>
          ))}</tr>
        </thead>
        <tbody>{rows.map((r, i) => (
          <tr key={i}>{r.map((c, j) => (
            <td key={j} style={{ padding: "8px 10px", borderBottom: "1px solid var(--card-border)", verticalAlign: "top",
              color: j === 0 ? "var(--text-primary)" : "var(--text-secondary)", fontVariantNumeric: j === 1 ? "tabular-nums" : undefined,
              whiteSpace: j === 1 ? "nowrap" : undefined }}>{c}</td>
          ))}</tr>
        ))}</tbody>
      </table>
    </div>
  );
}

export default function EditGuidePage() {
  const fill = modelsFor("fill");
  const edit = modelsFor("edit");
  const two = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, margin: "0 0 14px" } as const;
  const h2 = { fontSize: 19, fontWeight: 800, margin: "34px 0 6px", color: "var(--text-primary)" } as const;
  const h3 = { fontSize: 15, fontWeight: 700, margin: "22px 0 6px", color: "var(--text-primary)" } as const;

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">改圖怎麼挑</span>
        <span className="topbar-env">畫布（專業版）AI 面板 · 2026-11-09 實測</span>
      </div>
      <div style={{ padding: "18px clamp(16px, 4vw, 32px) 64px", maxWidth: 820, lineHeight: 1.8, color: "var(--text-secondary)" }}>
        <p style={{ margin: "0 0 22px", color: "var(--text-muted)", fontSize: 14 }}>
          這一頁的每張圖都是用自家的塔羅牌真的跑出來的，不是示意圖。價格直接讀模型目錄，和
          <Link href="/tools/photo-pro" style={{ color: "var(--accent-text)" }}> 畫布（專業版）</Link> 面板上的數字是同一份。
        </p>

        <h2 style={h2}>一、兩種改圖，先分清楚</h2>
        <Table
          head={["要做的事", "用哪個面板", "會動到哪裡"]}
          rows={[
            ["清掉一個東西、補一塊、加一個物件", "🪄 去除／生成填色", "只有框起來的那一塊"],
            ["整張調順、換氛圍、改風格", "✏️ AI 修圖", "整張重畫"],
          ]}
        />
        <p style={{ color: "var(--text-muted)", margin: "0 0 10px" }}>差別不是價格，是「其他地方會不會被動到」。要保住原圖就用第一種。</p>

        <h2 style={h2}>二、不打字的「照周圍補」</h2>
        <Card>
          <b style={{ color: "var(--accent-text)" }}>把描述欄留空就好，不要自己打「照周圍補」。</b>
          <div style={{ marginTop: 4 }}>
            留空的時候，系統會自動替妳送一段完整的英文指令給模型，意思是「把框起來的地方清掉，照周圍的顏色、紋理、光線、線條接下去，不要加新東西」。
            自己打那四個字，模型就只收到那四個字，看不懂要清掉什麼。
          </div>
        </Card>
        <p style={{ margin: "0 0 12px" }}>同一塊選區（王座下那三隻羊）、同一個模型、同一天，差別只在描述欄：</p>
        <div style={two}>
          <Shot src={`${SHOT}/a1-blank-auto.jpg`} alt="描述留空的結果：三隻羊不見，橘色布幔自然接起來" tag="描述欄留空"
            caption={<>羊清掉了，橘色布幔順著原本的皺褶接上，看不出動過。</>} />
          <Shot src={`${SHOT}/a2-typed-zh.jpg`} alt="自己打字的結果：三隻羊原封不動" tag="自己打「照周圍補」" tone="bad"
            caption={<>羊原封不動。錢照扣，圖沒變。</>} />
        </div>

        <h3 style={h3}>想加東西的時候才打字</h3>
        <p style={{ margin: "0 0 14px" }}>描述欄是用來說「要生成什麼」的。要加酒杯就寫「一個金色高腳酒杯放在扶手上」，中文可以。要清東西、要補背景，留空最準。</p>

        <h3 style={h3}>生成填色的按鈕</h3>
        <Table
          head={["按鈕", "每次", "什麼時候用"]}
          rows={[
            [labelOf("ideogram-4-5-edit-low"), price("ideogram-4-5-edit-low"), "預設就用它。留空照周圍補、打字加東西都最穩，接縫最少。"],
            [labelOf("ideogram-4-5-edit"), price("ideogram-4-5-edit"), "同一個模型的高畫質檔。省的那顆結果不滿意時再按。"],
            [labelOf("flux-fill-pro"), price("flux-fill-pro"), "一定要搭描述用。留空它會自己發明內容，曾把一塊換成不相干的色帶。"],
            [labelOf("openai-26-edit"), price("openai-26-edit"), "長指令、條件很多的時候（「把左邊的杯子換成書，顏色沿用右邊」）。"],
          ]}
        />
        <p style={{ color: "var(--text-muted)", margin: "0 0 10px" }}>
          去除不要的部分只有一顆：{labelOf("bria-eraser")} {price("bria-eraser")}，它只會清掉東西、不會順手加東西。
          （面板實際列出的順序以目錄為準，目前是 {fill.map((m) => m.label).join("、")}。）
        </p>

        <h2 style={h2}>三、給指令的整張改圖</h2>
        <p style={{ margin: "0 0 12px" }}>
          同一張牌、同一句指令：<em>「把整張的光線調柔一點，邊緣修乾淨，維持原本的畫風與配色」</em>。三顆鈕的結果擺在一起看：
        </p>
        <div style={{ margin: "0 0 14px", maxWidth: 420 }}>
          <Shot src={`${SHOT}/b0-source.jpg`} alt="原圖：藍貓國王坐在王座上，梵谷式漩渦背景，下方有標題文字"
            caption={<>原圖。注意兩件事：背景的漩渦筆觸，還有下方的標題字。</>} />
        </div>
        <div style={two}>
          <Shot src={`${SHOT}/b1-klein-4b.jpg`} alt="FLUX 2 Klein 4B 的結果：光線變柔，筆觸變平滑，標題字正確"
            caption={<><b>{labelOf("flux-2-klein-4b")}</b> {price("flux-2-klein-4b")}：光線確實變柔，<b>標題字完整保住</b>。但筆觸被抹平，金箔的厚度不見了。</>} />
          <Shot src={`${SHOT}/b2-kontext-fast.jpg`} alt="FLUX Kontext Fast 的結果：畫風保留得好，但標題字變成亂碼"
            caption={<><b>{labelOf("flux-kontext-fast")}</b> {price("flux-kontext-fast")}：漩渦筆觸和厚塗質感都在，最像原作。但<b>標題字變成 HAT CRILES</b>。</>} />
          <Shot src={`${SHOT}/b3-kontext-pro.jpg`} alt="FLUX Kontext Pro 的結果：畫風保留得好，標題字同樣變形"
            caption={<><b>{labelOf("flux-kontext-pro")}</b> {price("flux-kontext-pro")}：畫風同樣接近原作、細節更乾淨。但<b>標題字變成 KING-BENTACIES</b>。</>} />
        </div>
        <Card>
          <b style={{ color: "var(--accent-text)" }}>整張改圖會把整張重畫，文字幾乎一定會壞。</b>
          <div style={{ marginTop: 4 }}>
            圖上有字（牌名、商品名、浮水印）就別用整張改圖，改用局部填色一塊一塊處理；真的要整張改，先把文字圖層關掉、改完再開回來。
          </div>
        </Card>

        <h3 style={h3}>整張改圖的按鈕</h3>
        <Table
          head={["按鈕", "每次", "什麼時候用"]}
          rows={edit.map((m) => [m.label, `NT$${nt(m.usd).toFixed(2)}`, m.note])}
        />

        <h2 style={h2}>四、三句話記住</h2>
        <ol style={{ margin: "0 0 18px", paddingLeft: "1.3em" }}>
          <li style={{ marginBottom: 6 }}><b>清東西、補背景</b>：框起來 → 描述<b>留空</b> → {labelOf("ideogram-4-5-edit-low")}。</li>
          <li style={{ marginBottom: 6 }}><b>加東西</b>：框起來 → 寫<b>要生成什麼</b> → {labelOf("ideogram-4-5-edit-low")}。</li>
          <li><b>整張調順</b>：圖上沒字才用 → {labelOf("flux-kontext-fast")} 起跳。</li>
        </ol>

        <p style={{ fontSize: 13.5, color: "var(--text-muted)", borderTop: "1px solid var(--card-border)", paddingTop: 14, marginTop: 36 }}>
          價格是 Replicate 2026-11-09 牌價換算新台幣（1 美元 = 32 元），按下去才扣、失敗不扣；每一次的實際金額記在
          <Link href="/ops/costs" style={{ color: "var(--accent-text)" }}> AI Costs</Link>。
          模型規格另見 <Link href="/tools/ai-models?tab=image-specs" style={{ color: "var(--accent-text)" }}>AI Models</Link>。
        </p>
      </div>
    </>
  );
}
