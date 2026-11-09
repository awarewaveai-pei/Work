// 改圖怎麼挑 — the explainer behind the photo-pro AI panels, in reading order: decide → operate → the traps, one figure
// per claim. Every picture is a real run on one of the operator's own tarot cards (2026-11-09, WORKLOG 續1).
// Sidebar: AI Models & Costs. Model names and NT$ are read from lib/studio/model-options.ts, never written here.
import Link from "next/link";
import { EDIT_TOOLS, STUDIO_MODEL_OPTIONS, modelsFor, nt } from "@/lib/studio/model-options";

export const metadata = { title: "改圖怎麼挑 · Lobster Factory" };

const SHOT = "/guides/edit";
const ROWS = [...STUDIO_MODEL_OPTIONS, ...EDIT_TOOLS];
const find = (value: string) => ROWS.find((m) => m.value === value);
const price = (value: string) => `NT$${nt(find(value)?.usd ?? 0).toFixed(2)}`;
const labelOf = (value: string) => find(value)?.label ?? value;

const LINE = "var(--card-border)";
const h2 = { fontSize: 19, fontWeight: 800, margin: "40px 0 10px", color: "var(--text-primary)" } as const;
const h3 = { fontSize: 15, fontWeight: 700, margin: "24px 0 8px", color: "var(--text-primary)" } as const;

function Table({ head, rows, firstCol }: { head: string[]; rows: React.ReactNode[][]; firstCol?: number }) {
  return (
    <div style={{ overflowX: "auto", maxWidth: "100%", margin: "0 0 14px" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 420 }}>
        <thead><tr>{head.map((h, i) => (
          <th key={h} style={{ textAlign: "left", padding: "7px 10px", borderBottom: `1px solid ${LINE}`, fontSize: 11.5,
            letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text-muted)", width: i === 0 ? firstCol : undefined }}>{h}</th>
        ))}</tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={i}>{r.map((c, j) => (
            <td key={j} style={{ padding: "7px 10px", borderBottom: `1px solid ${LINE}`, verticalAlign: "top",
              color: j === 0 ? "var(--text-primary)" : "var(--text-secondary)", fontWeight: j === 0 ? 600 : 400,
              fontVariantNumeric: j === 1 ? "tabular-nums" : undefined, whiteSpace: j === 1 ? "nowrap" : undefined }}>{c}</td>
          ))}</tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ border: `1px solid ${LINE}`, borderLeft: "4px solid var(--accent)", borderRadius: "0 8px 8px 0",
      background: "var(--bg-subtle)", padding: "11px 14px", margin: "0 0 16px", lineHeight: 1.7 }}>{children}</div>
  );
}

function Figs({ items, min = 230 }: { items: { src: string; alt: string; cap: React.ReactNode }[]; min?: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}px, 100%), 1fr))`, gap: 14, margin: "0 0 16px" }}>
      {items.map((f) => (
        <figure key={f.src} style={{ margin: 0, minWidth: 0 }}>
          <img src={f.src} alt={f.alt} style={{ display: "block", width: "100%", borderRadius: 8, border: `1px solid ${LINE}` }} />
          <figcaption style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 6, lineHeight: 1.6 }}>{f.cap}</figcaption>
        </figure>
      ))}
    </div>
  );
}

export default function EditGuidePage() {
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">改圖怎麼挑</span>
        <span className="topbar-env">畫布（專業版）AI 面板 · 2026-11-09 實測</span>
      </div>
      <div style={{ padding: "18px clamp(16px, 4vw, 32px) 64px", maxWidth: 820, lineHeight: 1.75, color: "var(--text-secondary)" }}>

        <h2 style={{ ...h2, marginTop: 4 }}>一、我要做什麼</h2>
        <Table
          head={["想做的事", "怎麼做", "按哪顆"]}
          firstCol={150}
          rows={[
            ["清掉一個東西", <>框住它 → 描述<b>留空</b></>, <>{labelOf("ideogram-4-5-edit-low")}　{price("ideogram-4-5-edit-low")}</>],
            ["清掉，而且要最省", <>框住它 → <b>寫明</b>「移除⋯⋯，延續後面的⋯⋯」</>, <>{labelOf("flux-2-klein-4b")}　{price("flux-2-klein-4b")}</>],
            ["加一個東西", <>框住要放的位置 → <b>寫</b>要生成什麼</>, <>{labelOf("ideogram-4-5-edit-low")}　{price("ideogram-4-5-edit-low")}</>],
            ["整張調順、換氛圍", <>不用框 → 寫一句要怎麼改</>, <>{labelOf("flux-kontext-fast")}　{price("flux-kontext-fast")}</>],
          ]}
        />
        <Note>
          局部填色<b>只動妳框起來的那一塊</b>，其他地方一個像素都不會變。整張改圖會<b>重畫整張</b>，圖上的字幾乎一定會壞。
        </Note>

        <h2 style={h2}>二、三個步驟</h2>
        <ol style={{ margin: "0 0 16px", paddingLeft: "1.3em" }}>
          <li style={{ marginBottom: 6 }}><b>框</b>：用矩形選取工具，或按 Q 用筆刷塗（塗黑 → 再按 Q → Shift+Ctrl+I 反轉）。</li>
          <li style={{ marginBottom: 6 }}><b>寫或不寫</b>：加東西一定要寫；清東西用 Ideogram 可以留空，其他模型要寫。</li>
          <li><b>按模型</b>：按下去就扣點，價格印在鈕上。不滿意再按一次，每次結果都不一樣。</li>
        </ol>

        <h2 style={h2}>三、按鈕一覽</h2>
        <h3 style={h3}>🪄 生成填色（只重畫框內）</h3>
        <Table head={["按鈕", "每次", "什麼時候用"]} rows={modelsFor("fill").map((m) => [m.label, `NT$${nt(m.usd).toFixed(2)}`, m.note])} />
        <h3 style={h3}>✏️ AI 修圖（重畫整張）</h3>
        <Table head={["按鈕", "每次", "什麼時候用"]} rows={modelsFor("edit").map((m) => [m.label, `NT$${nt(m.usd).toFixed(2)}`, m.note])} />
        <p style={{ margin: "0 0 10px", color: "var(--text-muted)", fontSize: 14 }}>
          另外兩個面板各只有一組：<b>去除不要的部分</b> {labelOf("bria-eraser")} {price("bria-eraser")}（只清掉，不會順手加東西）；
          <b>擴圖</b> {labelOf("flux-fill-pro")} {price("flux-fill-pro")} 與 {labelOf("bria-expand")} {price("bria-expand")}（後者尺寸精準、不走樣）。
        </p>

        <h2 style={h2}>四、三個會踩到的坑</h2>

        <h3 style={h3}>1. 框多大就清多大，而且每次結果不同</h3>
        <p style={{ margin: "0 0 10px" }}>
          描述留空的意思是「把<b>框裡的東西</b>清掉，照周圍補回來」。框太小，露在外面的半隻會留著；框太大，本來想留的也會一起消失。
          同一張牌、同一個框、同一個模型，連跑兩次：
        </p>
        <Figs items={[
          { src: `${SHOT}/c0-frame.jpg`, alt: "原圖，框住整組動物", cap: <>原圖，框住整組動物。</> },
          { src: `${SHOT}/c1-animals-gone.jpg`, alt: "第一次：動物消失，布幔王座完整", cap: <>第一次：動物消失，布幔和座面完好。</> },
          { src: `${SHOT}/c2-all-gone.jpg`, alt: "第二次：框內全部被清掉", cap: <>第二次：框裡<b>全部</b>清掉，連座面都沒了。</> },
        ]} />
        <p style={{ margin: "0 0 10px", color: "var(--text-muted)" }}>兩次都照指令做了，指令就是「把框裡清掉」。所以框要剛好包住要刪的東西。</p>

        <h3 style={h3}>2. 最便宜的兩顆很好用，但描述不能留空</h3>
        <p style={{ margin: "0 0 10px" }}>
          {labelOf("flux-2-klein-4b")} 和 {labelOf("flux-kontext-fast")} 沒有遮罩功能；面板是靠「只送選區周圍一塊、只把選區貼回來」讓它們也能做局部填色。
          代價是它們不知道該動哪裡，<b>留空就什麼都不會改</b>。寫清楚之後，同一個框：
        </p>
        <Figs min={250} items={[
          { src: `${SHOT}/d1-klein.jpg`, alt: "Klein 4B 的結果", cap: <><b>{labelOf("flux-2-klein-4b")}</b> {price("flux-2-klein-4b")}：乾淨，連跑兩次一致。</> },
          { src: `${SHOT}/d2-kontext-fast.jpg`, alt: "Kontext Fast 的結果", cap: <><b>{labelOf("flux-kontext-fast")}</b> {price("flux-kontext-fast")}：乾淨，筆觸最貼近原畫。</> },
        ]} />

        <h3 style={h3}>3. 整張改圖會把圖上的字弄壞</h3>
        <p style={{ margin: "0 0 10px" }}>同一句「把光線調柔、邊緣修乾淨、維持畫風」：</p>
        <Figs items={[
          { src: `${SHOT}/b1-klein-4b.jpg`, alt: "Klein 4B 整張改圖", cap: <><b>{labelOf("flux-2-klein-4b")}</b>：字完整，但筆觸被抹平。</> },
          { src: `${SHOT}/b2-kontext-fast.jpg`, alt: "Kontext Fast 整張改圖", cap: <><b>{labelOf("flux-kontext-fast")}</b>：畫風最像，字變成 HAT CRILES。</> },
          { src: `${SHOT}/b3-kontext-pro.jpg`, alt: "Kontext Pro 整張改圖", cap: <><b>{labelOf("flux-kontext-pro")}</b>：細節最好，字變成 KING-BENTACIES。</> },
        ]} />
        <p style={{ margin: "0 0 10px", color: "var(--text-muted)" }}>圖上有字就別整張改；真要改，先把文字圖層關掉，改完再開回來。</p>

        <h2 style={h2}>五、加東西長什麼樣</h2>
        <p style={{ margin: "0 0 10px" }}>同一個框、同一句「一個金色高腳酒杯放在扶手上」（中文可以）：</p>
        <Figs min={640} items={[{
          src: `${SHOT}/c3-add-row.jpg`, alt: "四個模型生成的酒杯並排",
          cap: <>左起：原圖、{labelOf("ideogram-4-5-edit-low")}、{labelOf("ideogram-4-5-edit")}、{labelOf("flux-fill-pro")}、{labelOf("openai-26-edit")}。
            兩個 Ideogram 最像原畫風；FLUX 給的是白瓷杯，沒照「金色高腳」做；GPT 的杯子偏小。</>,
        }]} />

        <h2 style={h2}>六、錢的規則</h2>
        <Table
          head={["情況", "扣款"]}
          firstCol={230}
          rows={[
            ["按一次模型鈕", <>扣一次。<b>再按一次就再扣一次</b>，沒有「重試不收費」這種事。</>],
            ["結果失敗（模型回錯誤、逾時）", <>不扣。點數在送出前先凍結，失敗就放回去。</>],
            [<>{labelOf("openai-25-edit")} / {labelOf("openai-26-edit")} 跑完才出錯</>, <>會扣。這兩顆是 OpenAI 按 token 計價，伺服器算完就計費，之後才失敗也一樣。</>],
            [<>{labelOf("openai-26-edit")} 的標價</>, <>是<b>估計值</b>。實測一次 US$0.0475（約 NT$1.52），比鈕上的 {price("openai-26-edit")} 少；長描述、大圖會更貴。</>],
            ["其他模型的標價", <>是固定牌價，實收就是那個數字。</>],
          ]}
        />
        <p style={{ margin: "0 0 10px" }}>
          畫布裡其他會花錢的鈕：<b>去背</b> 約 NT$0.06、<b>升頻</b> 約 NT$0.06 一輪（最多兩輪）。這兩個按 GPU 秒數計價，所以是估計值。
          色調分離、邊緣遮罩、尺寸範本、QR、條碼都在本機算，<b>完全不花錢</b>。
        </p>
        <Note>
          每一筆實際金額都記在 <Link href="/ops/costs" style={{ color: "var(--accent-text)" }}>AI Costs</Link>，含模型、時間、route。
          想知道今天花了多少，看那一頁，不要看這裡的牌價相加。
        </Note>

        <p style={{ fontSize: 13.5, color: "var(--text-muted)", borderTop: `1px solid ${LINE}`, paddingTop: 14, marginTop: 36 }}>
          價格是 Replicate 2026-11-09 牌價換算新台幣（1 美元 = 32 元），按下去才扣、失敗不扣；實際金額記在
          <Link href="/ops/costs" style={{ color: "var(--accent-text)" }}> AI Costs</Link>。
          模型規格見 <Link href="/tools/ai-models?tab=image-specs" style={{ color: "var(--accent-text)" }}>AI Models</Link>，
          面板在 <Link href="/tools/photo-pro" style={{ color: "var(--accent-text)" }}>畫布（專業版）</Link>。
          每張圖都是當天真的跑出來的，不是示意圖。
        </p>
      </div>
    </>
  );
}
