// 改圖怎麼挑 — the explainer behind the photo-pro AI panels. Reading order: decide → steps → what to type →
// buttons (cheapest first) → every run that was paid for, one labelled figure each, grouped by what was tested.
// All runs 2026-11-09 on one of the operator's own tarot cards (WORKLOG 續1/續2). Model names and NT$ come from
// lib/studio/model-options.ts and the blank-prompt text from lib/studio/generative-fill.ts: never retyped here.
import Link from "next/link";
import { EDIT_TOOLS, STUDIO_MODEL_OPTIONS, modelsFor, nt, takesBlankPrompt } from "@/lib/studio/model-options";
import { CONTEXT_FILL_PROMPT } from "@/lib/studio/fill-prompt";
import { CopyPrompt } from "./CopyPrompt";

export const metadata = { title: "改圖怎麼挑 · Lobster Factory" };

const SHOT = "/guides/edit";
const ROWS = [...STUDIO_MODEL_OPTIONS, ...EDIT_TOOLS];
const find = (value: string) => ROWS.find((m) => m.value === value);
const price = (value: string) => `NT$${nt(find(value)?.usd ?? 0).toFixed(2)}`;
const labelOf = (value: string) => find(value)?.label ?? value;
/** Catalog rows for one use, cheapest first — the order the operator reads the buttons in. */
const byPrice = (use: "fill" | "edit") => [...modelsFor(use)].sort((a, b) => a.usd - b.usd);

/** The three prompts every run on this page used. Quoted beside each experiment so no figure is unexplained. */
const P = {
  remove: "移除那三隻動物，延續後面的橘色布幔和王座。",
  add: "一個金色高腳酒杯放在扶手上。",
  whole: "把整張的光線調柔一點，邊緣修乾淨，維持原本的畫風與配色。",
  /** Description box left empty: the server sends CONTEXT_FILL_PROMPT instead. */
  blank: "（描述留空）",
  /** The four characters that look like they ask for a context fill and do nothing. */
  typed: "照周圍補",
} as const;

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

/** What was typed into the description box for the runs that follow. */
/** One run: the picture, which model made it, what that press cost, what was typed, and what happened.
 *  A result figure must carry its prompt; only the untouched source may omit it. */
type RunProps = { src: string; model: string; note: string } & (
  | { verdict: "src"; cost?: never; prompt?: never }
  | { verdict: "good" | "bad"; cost: string; prompt: string }
);
function Run({ src, model, cost, verdict, note, prompt }: RunProps) {
  const tone = verdict === "good" ? "var(--accent-text)" : verdict === "bad" ? "var(--danger)" : "var(--text-muted)";
  return (
    <figure style={{ margin: 0, minWidth: 0 }}>
      <img src={`${SHOT}/${src}.jpg`} alt={`${model}：${note}`} style={{ display: "block", width: "100%", borderRadius: 8, border: `1px solid ${LINE}` }} />
      <figcaption style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.6 }}>
        <span style={{ fontWeight: 700, color: tone }}>{model}</span>
        {cost ? <span style={{ ...muted, fontVariantNumeric: "tabular-nums" }}>　{cost}</span> : null}
        <br /><span style={muted}>{note}</span>
        {prompt ? (
          <>
            <br />
            <span style={{ ...muted, opacity: 0.85 }}>指令：</span>
            <span style={{ color: "var(--text-secondary)" }}>{prompt}</span>
          </>
        ) : null}
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
            ["清掉，而且要最省", <>框住它 → <b>寫明</b>移除什麼、後面接什麼</>, <>{labelOf("flux-2-klein-4b")}　{price("flux-2-klein-4b")}</>],
            ["加一個東西", <>框住要放的位置 → <b>寫</b>要生成什麼</>, <>{labelOf("ideogram-4-5-edit-low")}　{price("ideogram-4-5-edit-low")}</>],
            ["整張調順、換氛圍", <>不用框 → 寫一句要怎麼改</>, <>{labelOf("flux-kontext-fast")}　{price("flux-kontext-fast")}</>],
          ]}
        />
        <Note>局部填色<b>只動妳框起來的那一塊</b>，其他地方一個像素都不會變。整張改圖會<b>重畫整張</b>，圖上的字幾乎一定會壞。</Note>

        <h2 style={h2}>二、三個步驟</h2>
        <ol style={{ margin: "0 0 16px", paddingLeft: "1.3em" }}>
          <li style={{ marginBottom: 6 }}><b>框</b>：矩形選取工具，或按 Q 用筆刷塗（塗黑 → 再按 Q → Shift+Ctrl+I 反轉）。</li>
          <li style={{ marginBottom: 6 }}><b>寫或不寫</b>：加東西一定要寫。清東西可以留空，但<b>只有一半的鈕吃得住</b>，哪幾顆看第四節的「留空」欄。句子照下一節複製。</li>
          <li><b>按模型</b>：按下去就扣點。不滿意再按一次，結果會不一樣，但也會再扣一次。</li>
        </ol>

        <h2 style={h2}>三、指令怎麼寫（可以直接複製）</h2>
        <p style={{ margin: "0 0 14px" }}>
          三種句型就夠用。把角括號換成妳的東西，<b>中文直接寫，不用翻英文</b>——這一頁所有結果都是用中文句子跑出來的。
        </p>

        <h3 style={h3}>清掉一個東西</h3>
        <CopyPrompt text="移除<要清掉的東西>，延續後面的<周圍是什麼>。" note="一定要講後面是什麼。不講，模型會自己發明一塊風景填進去。" />
        <CopyPrompt text={P.remove} note="這一頁清動物那幾張用的就是這句。" />

        <h3 style={h3}>加一個東西</h3>
        <CopyPrompt text="一個<材質或顏色><東西>放在<位置>。" note="材質、顏色、大小寫進去。只寫「一個杯子」會拿到隨便一個杯子。" />
        <CopyPrompt text={P.add} note="這一頁加酒杯那四張用的就是這句。" />

        <h3 style={h3}>整張調順、換氛圍</h3>
        <CopyPrompt text="<要改什麼>，維持原本的畫風與配色。" note="後半句不能省。省了模型會順手把畫風一起換掉。" />
        <CopyPrompt text={P.whole} note="這一頁整張改圖那三張用的就是這句。" />

        <h3 style={h3}>三條規則</h3>
        <ol style={{ margin: "0 0 16px", paddingLeft: "1.3em" }}>
          <li style={{ marginBottom: 6 }}><b>說要變成什麼，不要說不要什麼。</b>「不要有動物」常常被忽略，「延續後面的橘色布幔」才有用。</li>
          <li style={{ marginBottom: 6 }}><b>一句話講一件事。</b>條件堆超過兩三件，只有 {labelOf("openai-26-edit")} 吃得住。</li>
          <li><b>不要寫感覺。</b>「改好看一點」「修一下」模型不知道改什麼，會自己亂改，錢照扣。</li>
        </ol>
        <Note>
          唯一不用寫的情況是<b>描述整個留空</b>，而且<b>要用吃得住留空的鈕</b>：系統會自動替妳送一段英文指令過去，下一節有原文和實測。
          不吃的那兩顆現在按下去會先擋下來，不會白扣錢。
        </Note>

        <h2 style={h2}>四、按鈕一覽（由便宜排到貴）</h2>
        <h3 style={h3}>🪄 生成填色（只重畫框內）</h3>
        <Table
          head={["按鈕", "每次", "留空", "什麼時候用"]}
          rows={byPrice("fill").map((m) => [
            m.label,
            `NT$${nt(m.usd).toFixed(2)}`,
            takesBlankPrompt(m)
              ? <span style={{ color: "var(--accent-text)", fontWeight: 700 }}>可以</span>
              : <span style={{ color: "var(--danger)", fontWeight: 700 }}>不行</span>,
            m.note,
          ])}
        />
        <p style={{ margin: "0 0 10px", fontSize: 14 }}>
          <b>「留空」欄就是在回答：描述空著按下去，這顆會不會動。</b>「不行」的那兩顆沒有遮罩功能，收到的指令沒有範圍可以套，
          圖會原封不動回來——所以面板現在直接擋下來，不會扣錢。<b>去除不要的部分</b>（{labelOf("bria-eraser")}）本來就不用寫描述。
        </p>
        <h3 style={h3}>✏️ AI 修圖（重畫整張）</h3>
        <Table head={["按鈕", "每次", "什麼時候用"]} rows={byPrice("edit").map((m) => [m.label, `NT$${nt(m.usd).toFixed(2)}`, m.note])} />
        <p style={{ margin: "0 0 10px", ...muted, fontSize: 14 }}>
          另外兩個面板各只有一組：<b>去除不要的部分</b> {labelOf("bria-eraser")} {price("bria-eraser")}（只清掉，不會順手加東西）；
          <b>擴圖</b> {labelOf("bria-expand")} {price("bria-expand")}（尺寸精準）與 {labelOf("flux-fill-pro")} {price("flux-fill-pro")}。
        </p>

        <h2 style={h2}>五、留空是什麼意思</h2>
        <p style={{ margin: "0 0 12px" }}>
          先講結論：<b>留空在吃得住的鈕上是有效的</b>，底下十二張留空的實測都真的動了。
          它不是留白、也不是透明。描述欄空著按下去，系統會替妳送這一句英文過去：
        </p>
        <CopyPrompt text={CONTEXT_FILL_PROMPT} note="意思是：把框裡的全部清掉，照周圍的顏色、紋理、光線、線條接下去，不要加新東西。所以框多大就清多大。" />
        <p style={{ margin: "0 0 12px" }}>所以自己打「照周圍補」四個字反而沒用——模型只收到那四個字，不知道要清掉什麼：</p>
        <Grid min={250}>
          <Run src="f-blank" model={labelOf("ideogram-4-5-edit-low")} cost={price("ideogram-4-5-edit-low")} verdict="good" note="描述留空：框裡的羊清掉，布幔接起來。"  prompt={P.blank} />
          <Run src="f-typed" model={labelOf("ideogram-4-5-edit-low")} cost={price("ideogram-4-5-edit-low")} verdict="bad" note="自己打「照周圍補」：羊原封不動，錢照扣。"  prompt={P.typed} />
        </Grid>

        <h3 style={h3}>框太小，露在框外的部分會留著</h3>
        <p style={{ margin: "0 0 10px" }}>
          下面每一張都是同一個框（只蓋到羊的中段）、描述留空，每個模型各按兩次，共十次。十次都動了、也都沒清乾淨——
          <b>問題出在框，不是出在留空</b>，因為羊的身體超出框外：
        </p>
        <Grid min={200}>
          <Run src="a-src" model="原圖" verdict="src" note="框只蓋到三隻羊的中段。" />
          <Run src="a-ideogram-low-1" model={labelOf("ideogram-4-5-edit-low")} cost={`${price("ideogram-4-5-edit-low")}・第一次`} verdict="bad" note="框內換了布料，羊還在。"  prompt={P.blank} />
          <Run src="a-ideogram-low-2" model={labelOf("ideogram-4-5-edit-low")} cost={`${price("ideogram-4-5-edit-low")}・第二次`} verdict="bad" note="少了一隻，其餘留著。"  prompt={P.blank} />
          <Run src="a-ideogram-medium-1" model={labelOf("ideogram-4-5-edit")} cost={`${price("ideogram-4-5-edit")}・第一次`} verdict="bad" note="和省的那檔差不多。"  prompt={P.blank} />
          <Run src="a-ideogram-medium-2" model={labelOf("ideogram-4-5-edit")} cost={`${price("ideogram-4-5-edit")}・第二次`} verdict="bad" note="貴一倍，結果沒比較好。"  prompt={P.blank} />
          <Run src="a-flux-fill-1" model={labelOf("flux-fill-pro")} cost={`${price("flux-fill-pro")}・第一次`} verdict="bad" note="塞進一塊不相干的風景。"  prompt={P.blank} />
          <Run src="a-flux-fill-2" model={labelOf("flux-fill-pro")} cost={`${price("flux-fill-pro")}・第二次`} verdict="bad" note="這次塞進一個黃綠色的盆。"  prompt={P.blank} />
          <Run src="a-gpt26-1" model={labelOf("openai-26-edit")} cost={`${price("openai-26-edit")}・第一次`} verdict="bad" note="清掉一部分，左邊那隻還在。"  prompt={P.blank} />
          <Run src="a-gpt26-2" model={labelOf("openai-26-edit")} cost={`${price("openai-26-edit")}・第二次`} verdict="bad" note="這次幾乎沒動。"  prompt={P.blank} />
          <Run src="a-eraser-1" model={labelOf("bria-eraser")} cost={`${price("bria-eraser")}・第一次`} verdict="bad" note="去除專用，一樣只能處理框內。"  prompt={P.blank} />
          <Run src="a-eraser-2" model={labelOf("bria-eraser")} cost={`${price("bria-eraser")}・第二次`} verdict="bad" note="和第一次不同，都不乾淨。"  prompt={P.blank} />
        </Grid>
        <Note>這一排十次的教訓只有一句：<b>框要把整個東西包進去</b>。框一半，再貴的模型也救不回來。</Note>

        <h3 style={h3}>框對了，但每次結果仍然不同</h3>
        <p style={{ margin: "0 0 10px" }}>把整組動物（含牠們站的那段布幔）都框進去，描述一樣留空，同一個模型連按兩次：</p>
        <Grid min={200}>
          <Run src="b-src" model="原圖" verdict="src" note="框住整組動物。" />
          <Run src="b-gpt26-1" model={labelOf("openai-26-edit")} cost={`${price("openai-26-edit")}・第一次`} verdict="good" note="動物消失，布幔和座面完好。"  prompt={P.blank} />
          <Run src="b-gpt26-2" model={labelOf("openai-26-edit")} cost={`${price("openai-26-edit")}・第二次`} verdict="bad" note="框裡全部清掉，連座面都沒了。"  prompt={P.blank} />
        </Grid>
        <p style={{ margin: "0 0 10px", ...muted }}>兩次都照指令做了，指令就是「把框裡清掉」。不滿意就再按一次，但會再扣一次。</p>

        <h2 style={h2}>六、不吃留空的那兩顆：寫清楚就很好用</h2>
        <p style={{ margin: "0 0 10px" }}>
          {labelOf("flux-2-klein-4b")} 和 {labelOf("flux-kontext-fast")} 沒有遮罩功能，面板是靠「只送選區周圍一塊、只把選區貼回來」讓它們也能局部填色。
          代價是<b>留空什麼都不會改</b>，一定要自己寫。
        </p>
        <Grid min={200}>
          <Run src="c-klein-1" model={labelOf("flux-2-klein-4b")} cost={`${price("flux-2-klein-4b")}・第一次`} verdict="good" note="乾淨，布幔、王座、標題字都完好。"  prompt={P.remove} />
          <Run src="c-klein-2" model={labelOf("flux-2-klein-4b")} cost={`${price("flux-2-klein-4b")}・第二次`} verdict="good" note="再按一次，結果一致。"  prompt={P.remove} />
          <Run src="c-kontext-fast" model={labelOf("flux-kontext-fast")} cost={price("flux-kontext-fast")} verdict="good" note="同樣乾淨，筆觸最貼近原畫。"  prompt={P.remove} />
        </Grid>
        <h3 style={h3}>同樣這幾顆，描述留空就什麼都不會改（所以面板現在不給按）</h3>
        <Grid min={190}>
          <Run src="g-src" model="原圖" verdict="src" note="框只蓋到羊的中段。" />
          <Run src="g-klein" model={labelOf("flux-2-klein-4b")} cost={price("flux-2-klein-4b")} verdict="bad" note="留空：幾乎原圖照還。"  prompt={P.blank} />
          <Run src="g-kontext-fast" model={labelOf("flux-kontext-fast")} cost={price("flux-kontext-fast")} verdict="bad" note="留空：羊原封不動。"  prompt={P.blank} />
          <Run src="g-nano21" model="Nano Banana 2.1" cost="NT$1.08" verdict="bad" note="留空：構圖被重排，羊還在。因此沒有收進面板。"  prompt={P.blank} />
          <Run src="g-ideogram-verylow" model="Ideogram 4.5 Edit（very_low 檔）" cost="NT$0.26" verdict="bad" note="最低畫質檔幾乎沒動作，所以面板不提供這一檔。"  prompt={P.blank} />
        </Grid>

        <h2 style={h2}>七、加東西：四顆的差別</h2>
        <p style={{ margin: "0 0 10px" }}>同一個框（王座右扶手），四顆按鈕各按一次：</p>
        <Grid min={200}>
          <Run src="d-src" model="原圖" verdict="src" note="框住右邊扶手。" />
          <Run src="d-ideogram-low" model={labelOf("ideogram-4-5-edit-low")} cost={price("ideogram-4-5-edit-low")} verdict="good" note="金杯大小合適、畫風一致，最划算。"  prompt={P.add} />
          <Run src="d-ideogram-medium" model={labelOf("ideogram-4-5-edit")} cost={price("ideogram-4-5-edit")} verdict="good" note="同樣好，但貴一倍。"  prompt={P.add} />
          <Run src="d-flux-fill" model={labelOf("flux-fill-pro")} cost={price("flux-fill-pro")} verdict="bad" note="給了白瓷杯，沒照「金色高腳」做。"  prompt={P.add} />
          <Run src="d-gpt26" model={labelOf("openai-26-edit")} cost={price("openai-26-edit")} verdict="bad" note="杯子偏小，像擺在後面。"  prompt={P.add} />
        </Grid>

        <h2 style={h2}>八、整張改圖：三顆的差別</h2>
        <p style={{ margin: "0 0 10px" }}>不用框，三顆按鈕各按一次：</p>
        <Grid min={200}>
          <Run src="e-src" model="原圖" verdict="src" note="注意背景的漩渦筆觸和下方的標題字。" />
          <Run src="e-klein" model={labelOf("flux-2-klein-4b")} cost={price("flux-2-klein-4b")} verdict="bad" note="字完整，但筆觸被抹平、金箔厚度不見。"  prompt={P.whole} />
          <Run src="e-kontext-fast" model={labelOf("flux-kontext-fast")} cost={price("flux-kontext-fast")} verdict="bad" note="畫風最像，字變成 HAT CRILES。"  prompt={P.whole} />
          <Run src="e-kontext-pro" model={labelOf("flux-kontext-pro")} cost={price("flux-kontext-pro")} verdict="bad" note="細節最好，字變成 KING-BENTACIES。"  prompt={P.whole} />
        </Grid>
        <Note>圖上有字就別整張改。真要改，先把文字圖層關掉，改完再開回來。</Note>

        <h2 style={h2}>九、錢的規則</h2>
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
