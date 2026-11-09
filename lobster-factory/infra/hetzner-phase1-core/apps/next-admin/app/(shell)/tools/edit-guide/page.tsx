// 改圖怎麼挑 — the explainer behind the photo-pro AI panels. Reading order: decide → steps → buttons (cheapest first) →
// every run that was paid for, one labelled figure each, grouped by what was being tested. All runs 2026-11-09 on one of
// the operator's own tarot cards (WORKLOG 續1). Model names and NT$ come from lib/studio/model-options.ts, never typed here.
import Link from "next/link";
import { EDIT_TOOLS, STUDIO_MODEL_OPTIONS, modelsFor, nt } from "@/lib/studio/model-options";

export const metadata = { title: "改圖怎麼挑 · Lobster Factory" };

const SHOT = "/guides/edit";
const ROWS = [...STUDIO_MODEL_OPTIONS, ...EDIT_TOOLS];
const find = (value: string) => ROWS.find((m) => m.value === value);
const price = (value: string) => `NT$${nt(find(value)?.usd ?? 0).toFixed(2)}`;
const labelOf = (value: string) => find(value)?.label ?? value;
/** Catalog rows for one use, cheapest first — the order the operator reads the buttons in. */
const byPrice = (use: "fill" | "edit") => [...modelsFor(use)].sort((a, b) => a.usd - b.usd);

const LINE = "var(--card-border)";
const h2 = { fontSize: 19, fontWeight: 800, margin: "42px 0 10px", color: "var(--text-primary)" } as const;
const h3 = { fontSize: 15, fontWeight: 700, margin: "26px 0 8px", color: "var(--text-primary)" } as const;
const muted = { color: "var(--text-muted)" } as const;

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

/** One run: the picture, which model made it, what that press cost, and what happened. */
function Run({ src, model, cost, verdict, note }: { src: string; model: string; cost?: string; verdict: "good" | "bad" | "src"; note: string }) {
  const tone = verdict === "good" ? "var(--accent-text)" : verdict === "bad" ? "var(--danger, var(--text-primary))" : "var(--text-muted)";
  return (
    <figure style={{ margin: 0, minWidth: 0 }}>
      <img src={`${SHOT}/${src}.jpg`} alt={`${model}：${note}`} style={{ display: "block", width: "100%", borderRadius: 8, border: `1px solid ${LINE}` }} />
      <figcaption style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.6 }}>
        <span style={{ fontWeight: 700, color: tone }}>{model}</span>
        {cost ? <span style={{ ...muted, fontVariantNumeric: "tabular-nums" }}>　{cost}</span> : null}
        <br /><span style={muted}>{note}</span>
      </figcaption>
    </figure>
  );
}
function Grid({ children, min = 230 }: { children: React.ReactNode; min?: number }) {
  return <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}px, 100%), 1fr))`, gap: 14, margin: "0 0 18px" }}>{children}</div>;
}

export default function EditGuidePage() {
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">改圖怎麼挑</span>
        <span className="topbar-env">2026-11-09 實測</span>
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
        <Note>局部填色<b>只動妳框起來的那一塊</b>，其他地方一個像素都不會變。整張改圖會<b>重畫整張</b>，圖上的字幾乎一定會壞。</Note>

        <h2 style={h2}>二、三個步驟</h2>
        <ol style={{ margin: "0 0 16px", paddingLeft: "1.3em" }}>
          <li style={{ marginBottom: 6 }}><b>框</b>：矩形選取工具，或按 Q 用筆刷塗（塗黑 → 再按 Q → Shift+Ctrl+I 反轉）。</li>
          <li style={{ marginBottom: 6 }}><b>寫或不寫</b>：加東西一定要寫；清東西只有 Ideogram 可以留空，其他模型都要寫。</li>
          <li><b>按模型</b>：按下去就扣點。不滿意再按一次，結果會不一樣，但也會再扣一次。</li>
        </ol>

        <h2 style={h2}>三、按鈕一覽（由便宜排到貴）</h2>
        <h3 style={h3}>🪄 生成填色（只重畫框內）</h3>
        <Table head={["按鈕", "每次", "什麼時候用"]} rows={byPrice("fill").map((m) => [m.label, `NT$${nt(m.usd).toFixed(2)}`, m.note])} />
        <h3 style={h3}>✏️ AI 修圖（重畫整張）</h3>
        <Table head={["按鈕", "每次", "什麼時候用"]} rows={byPrice("edit").map((m) => [m.label, `NT$${nt(m.usd).toFixed(2)}`, m.note])} />
        <p style={{ margin: "0 0 10px", ...muted, fontSize: 14 }}>
          另外兩個面板各只有一組：<b>去除不要的部分</b> {labelOf("bria-eraser")} {price("bria-eraser")}（只清掉，不會順手加東西）；
          <b>擴圖</b> {labelOf("bria-expand")} {price("bria-expand")}（尺寸精準）與 {labelOf("flux-fill-pro")} {price("flux-fill-pro")}。
        </p>

        <h2 style={h2}>四、留空是什麼意思</h2>
        <p style={{ margin: "0 0 12px" }}>
          留空不是留白、也不是透明，而是「把<b>框裡的東西</b>清掉，照周圍補回來」，所以框多大就清多大。
          自己打「照周圍補」四個字反而沒用——模型只收到那四個字，不知道要清掉什麼：
        </p>
        <Grid min={250}>
          <Run src="f-blank" model={labelOf("ideogram-4-5-edit-low")} cost={price("ideogram-4-5-edit-low")} verdict="good" note="描述留空：框裡的羊清掉，布幔接起來。" />
          <Run src="f-typed" model={labelOf("ideogram-4-5-edit-low")} cost={price("ideogram-4-5-edit-low")} verdict="bad" note="自己打「照周圍補」：羊原封不動，錢照扣。" />
        </Grid>

        <h3 style={h3}>框太小，露在框外的部分會留著</h3>
        <p style={{ margin: "0 0 12px" }}>
          下面每一張都是同一個框（只蓋到羊的中段）、描述留空，每個模型各按兩次，共十次。沒有一次清乾淨——因為羊的身體超出框外：
        </p>
        <Grid min={200}>
          <Run src="a-src" model="原圖" verdict="src" note="框只蓋到三隻羊的中段。" />
          <Run src="a-ideogram-low-1" model={labelOf("ideogram-4-5-edit-low")} cost={`${price("ideogram-4-5-edit-low")}・第一次`} verdict="bad" note="框內換了布料，羊還在。" />
          <Run src="a-ideogram-low-2" model={labelOf("ideogram-4-5-edit-low")} cost={`${price("ideogram-4-5-edit-low")}・第二次`} verdict="bad" note="少了一隻，其餘留著。" />
          <Run src="a-ideogram-medium-1" model={labelOf("ideogram-4-5-edit")} cost={`${price("ideogram-4-5-edit")}・第一次`} verdict="bad" note="和省的那檔差不多。" />
          <Run src="a-ideogram-medium-2" model={labelOf("ideogram-4-5-edit")} cost={`${price("ideogram-4-5-edit")}・第二次`} verdict="bad" note="貴一倍，結果沒比較好。" />
          <Run src="a-flux-fill-1" model={labelOf("flux-fill-pro")} cost={`${price("flux-fill-pro")}・第一次`} verdict="bad" note="塞進一塊不相干的風景。" />
          <Run src="a-flux-fill-2" model={labelOf("flux-fill-pro")} cost={`${price("flux-fill-pro")}・第二次`} verdict="bad" note="這次塞進一個黃綠色的盆。" />
          <Run src="a-gpt26-1" model={labelOf("openai-26-edit")} cost={`${price("openai-26-edit")}・第一次`} verdict="bad" note="清掉一部分，左邊那隻還在。" />
          <Run src="a-gpt26-2" model={labelOf("openai-26-edit")} cost={`${price("openai-26-edit")}・第二次`} verdict="bad" note="這次幾乎沒動。" />
          <Run src="a-eraser-1" model={labelOf("bria-eraser")} cost={`${price("bria-eraser")}・第一次`} verdict="bad" note="去除專用，一樣只能處理框內。" />
          <Run src="a-eraser-2" model={labelOf("bria-eraser")} cost={`${price("bria-eraser")}・第二次`} verdict="bad" note="和第一次不同，都不乾淨。" />
        </Grid>
        <Note>這一排十次的教訓只有一句：<b>框要把整個東西包進去</b>。框一半，再貴的模型也救不回來。</Note>

        <h3 style={h3}>框對了，但每次結果仍然不同</h3>
        <p style={{ margin: "0 0 12px" }}>把整組動物（含牠們站的那段布幔）都框進去，同一個模型連按兩次：</p>
        <Grid min={200}>
          <Run src="b-src" model="原圖" verdict="src" note="框住整組動物。" />
          <Run src="b-gpt26-1" model={labelOf("openai-26-edit")} cost={`${price("openai-26-edit")}・第一次`} verdict="good" note="動物消失，布幔和座面完好。" />
          <Run src="b-gpt26-2" model={labelOf("openai-26-edit")} cost={`${price("openai-26-edit")}・第二次`} verdict="bad" note="框裡全部清掉，連座面都沒了。" />
        </Grid>
        <p style={{ margin: "0 0 10px", ...muted }}>兩次都照指令做了，指令就是「把框裡清掉」。不滿意就再按一次，但會再扣一次。</p>

        <h2 style={h2}>五、寫清楚指令：最便宜的兩顆最穩</h2>
        <p style={{ margin: "0 0 12px" }}>
          {labelOf("flux-2-klein-4b")} 和 {labelOf("flux-kontext-fast")} 沒有遮罩功能，面板是靠「只送選區周圍一塊、只把選區貼回來」讓它們也能局部填色。
          代價是<b>留空什麼都不會改</b>；只要寫清楚（「移除那三隻動物，延續後面的橘色布幔和王座」），同一個框：
        </p>
        <Grid min={200}>
          <Run src="c-klein-1" model={labelOf("flux-2-klein-4b")} cost={`${price("flux-2-klein-4b")}・第一次`} verdict="good" note="乾淨，布幔、王座、標題字都完好。" />
          <Run src="c-klein-2" model={labelOf("flux-2-klein-4b")} cost={`${price("flux-2-klein-4b")}・第二次`} verdict="good" note="再按一次，結果一致。" />
          <Run src="c-kontext-fast" model={labelOf("flux-kontext-fast")} cost={price("flux-kontext-fast")} verdict="good" note="同樣乾淨，筆觸最貼近原畫。" />
        </Grid>
        <h3 style={h3}>同樣這幾顆，描述留空就什麼都不會改</h3>
        <Grid min={190}>
          <Run src="g-src" model="原圖" verdict="src" note="框只蓋到羊的中段。" />
          <Run src="g-klein" model={labelOf("flux-2-klein-4b")} cost={price("flux-2-klein-4b")} verdict="bad" note="留空：幾乎原圖照還。" />
          <Run src="g-kontext-fast" model={labelOf("flux-kontext-fast")} cost={price("flux-kontext-fast")} verdict="bad" note="留空：羊原封不動。" />
          <Run src="g-nano21" model="Nano Banana 2.1" cost="NT$1.08" verdict="bad" note="留空：構圖被重排，羊還在。因此沒有收進面板。" />
          <Run src="g-ideogram-verylow" model="Ideogram 4.5 Edit（very_low 檔）" cost="NT$0.26" verdict="bad" note="最低畫質檔幾乎沒動作，所以面板不提供這一檔。" />
        </Grid>

        <h2 style={h2}>六、加東西：四顆的差別</h2>
        <p style={{ margin: "0 0 12px" }}>同一個框（王座右扶手）、同一句「一個金色高腳酒杯放在扶手上」，中文直接寫就可以：</p>
        <Grid min={200}>
          <Run src="d-src" model="原圖" verdict="src" note="框住右邊扶手。" />
          <Run src="d-ideogram-low" model={labelOf("ideogram-4-5-edit-low")} cost={price("ideogram-4-5-edit-low")} verdict="good" note="金杯大小合適、畫風一致，最划算。" />
          <Run src="d-ideogram-medium" model={labelOf("ideogram-4-5-edit")} cost={price("ideogram-4-5-edit")} verdict="good" note="同樣好，但貴一倍。" />
          <Run src="d-flux-fill" model={labelOf("flux-fill-pro")} cost={price("flux-fill-pro")} verdict="bad" note="給了白瓷杯，沒照「金色高腳」做。" />
          <Run src="d-gpt26" model={labelOf("openai-26-edit")} cost={price("openai-26-edit")} verdict="bad" note="杯子偏小，像擺在後面。" />
        </Grid>

        <h2 style={h2}>七、整張改圖：三顆的差別</h2>
        <p style={{ margin: "0 0 12px" }}>不用框，同一句「把整張的光線調柔一點，邊緣修乾淨，維持原本的畫風與配色」：</p>
        <Grid min={200}>
          <Run src="e-src" model="原圖" verdict="src" note="注意背景的漩渦筆觸和下方的標題字。" />
          <Run src="e-klein" model={labelOf("flux-2-klein-4b")} cost={price("flux-2-klein-4b")} verdict="bad" note="字完整，但筆觸被抹平、金箔厚度不見。" />
          <Run src="e-kontext-fast" model={labelOf("flux-kontext-fast")} cost={price("flux-kontext-fast")} verdict="bad" note="畫風最像，字變成 HAT CRILES。" />
          <Run src="e-kontext-pro" model={labelOf("flux-kontext-pro")} cost={price("flux-kontext-pro")} verdict="bad" note="細節最好，字變成 KING-BENTACIES。" />
        </Grid>
        <Note>圖上有字就別整張改。真要改，先把文字圖層關掉，改完再開回來。</Note>

        <h2 style={h2}>八、錢的規則</h2>
        <Table
          head={["情況", "扣款"]}
          firstCol={230}
          rows={[
            ["按一次模型鈕", <>扣一次。<b>再按一次就再扣一次</b>，沒有「重試不收費」這種事。</>],
            ["結果失敗（模型回錯誤、逾時）", <>不扣。點數在送出前先凍結，失敗就放回去。</>],
            [<>{labelOf("openai-25-edit")} / {labelOf("openai-26-edit")} 跑完才出錯</>, <>會扣。這兩顆是 OpenAI 按 token 計價，伺服器算完就計費。</>],
            [<>{labelOf("openai-26-edit")} 的標價</>, <>是<b>估計值</b>。實測一次 US$0.0475（約 NT$1.52），比鈕上的 {price("openai-26-edit")} 少；長描述、大圖會更貴。</>],
            ["其他模型的標價", <>固定牌價，實收就是那個數字。</>],
            ["去背 / 升頻", <>約 NT$0.06 一次，按 GPU 秒數計價，所以是估計值。</>],
            ["色調分離、邊緣遮罩、範本、QR、條碼", <>在妳的電腦上算，<b>完全不花錢</b>。</>],
          ]}
        />
        <Note>
          實際金額每一筆都記在 <Link href="/ops/costs" style={{ color: "var(--accent-text)" }}>AI Costs</Link>，含模型、時間、來源。
          想知道今天花多少，看那一頁，不要用這裡的牌價相加。
        </Note>

        <p style={{ fontSize: 13.5, ...muted, borderTop: `1px solid ${LINE}`, paddingTop: 14, marginTop: 36 }}>
          這一頁 33 張圖全部是 2026-11-09 在同一張塔羅牌上真的跑出來的，沒有示意圖。
          價格是 Replicate 當天牌價換算新台幣（1 美元 = 32 元）。
          模型規格見 <Link href="/tools/ai-models?tab=image-specs" style={{ color: "var(--accent-text)" }}>AI Models</Link>，
          面板在 <Link href="/tools/photo-pro" style={{ color: "var(--accent-text)" }}>畫布（專業版）</Link>。
        </p>
      </div>
    </>
  );
}
