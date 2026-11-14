// 改圖怎麼挑 — the explainer behind the photo-pro AI panels.
// Shape: how to use it (1-4), then the five things that were actually measured (5-9), then the money (10).
// One question per section, no fact written twice, every list of buttons ordered cheapest first.
// All 36 figures are real runs of 2026-11-09 on one of the operator's own tarot cards (WORKLOG 續1/續2/續4).
// Labels, prices, 留空 and 語言 all come from the catalog (lib/studio/model-options.ts) and are never typed here.
import Link from "next/link";
import { EDIT_TOOLS, STUDIO_MODEL_OPTIONS, modelsFor, nt, takesBlankPrompt, takesChinese } from "@/lib/studio/model-options";
import { CONTEXT_FILL_PROMPT } from "@/lib/studio/fill-prompt";
import { CopyPrompt } from "./CopyPrompt";

export const metadata = { title: "改圖怎麼挑 · Lobster Factory" };

const SHOT = "/guides/edit";
const ROWS = [...STUDIO_MODEL_OPTIONS, ...EDIT_TOOLS];
const find = (value: string) => ROWS.find((m) => m.value === value);
const price = (value: string) => `NT$${nt(find(value)?.usd ?? 0).toFixed(2)}`;
const labelOf = (value: string) => find(value)?.label ?? value;
/** modelsFor already returns cheapest first (image-models.js), which is the order every list here uses. */
const byPrice = modelsFor;

/** The four things that were typed into the description box. Every figure names the one that produced it. */
const P = {
  remove: "移除那三隻動物，延續後面的橘色布幔和王座。",
  /** The same instruction in English: the only one FLUX Kontext Fast acted on. */
  removeEn: "Remove the three animals and continue the orange drapery and the throne behind them, matching the painting's brush strokes, colours and lighting. Change nothing else.",
  add: "一個金色高腳酒杯放在扶手上。",
  whole: "把整張的光線調柔一點，邊緣修乾淨，維持原本的畫風與配色。",
  blank: "（什麼都不打）",
  typed: "照周圍補",
} as const;

const LINE = "var(--card-border)";
const h2 = { fontSize: 19, fontWeight: 800, margin: "44px 0 10px", color: "var(--text-primary)" } as const;
const h3 = { fontSize: 15, fontWeight: 700, margin: "26px 0 8px", color: "var(--text-primary)" } as const;
const muted = { color: "var(--text-muted)" } as const;
const p0 = { margin: "0 0 10px" } as const;

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

const Yes = ({ children }: { children: React.ReactNode }) => <span style={{ color: "var(--accent-text)", fontWeight: 700 }}>{children}</span>;
const No = ({ children }: { children: React.ReactNode }) => <span style={{ color: "var(--danger)", fontWeight: 700 }}>{children}</span>;

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ border: `1px solid ${LINE}`, borderLeft: "4px solid var(--accent)", borderRadius: "0 8px 8px 0",
      background: "var(--bg-subtle)", padding: "11px 14px", margin: "0 0 16px", lineHeight: 1.7 }}>{children}</div>
  );
}

/** One run: the picture, which button made it, what that press cost, what was typed, and what came back.
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
            <br /><span style={{ ...muted, opacity: 0.85 }}>打的字：</span>
            <span style={{ color: "var(--text-secondary)" }}>{prompt}</span>
          </>
        ) : null}
      </figcaption>
    </figure>
  );
}
function Grid({ children, min = 210 }: { children: React.ReactNode; min?: number }) {
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

        <p style={{ ...p0, fontSize: 15 }}>
          這一頁回答五件事：按鈕怎麼挑、指令怎麼打、要打中文還是英文、什麼時候可以不打字、一次多少錢。
          底下 40 張圖全部是真的跑出來的，每一張都標了是哪顆鈕、花多少錢、打了什麼字。
        </p>

        {/* ---------- 怎麼用 ---------- */}
        <h2 style={{ ...h2, marginTop: 30 }}>一、先決定用哪一個面板</h2>
        <Table
          head={["面板", "會動到哪裡", "什麼時候用"]}
          firstCol={130}
          rows={[
            ["🪄 生成填色", <>只有<b>妳框起來的那一塊</b>，其他地方一個像素都不會變</>, "清掉一個東西、補一塊背景、加一個東西"],
            ["✏️ AI 修圖", <><b>整張重畫</b>，圖上的字幾乎一定會壞</>, "調光線、換氛圍、改風格"],
          ]}
        />
        <Note>圖上有字（牌名、商品名、浮水印）就別用 AI 修圖。真要改，先把文字圖層關掉，改完再開回來。</Note>

        <h2 style={h2}>二、三個步驟</h2>
        <ol style={{ margin: "0 0 16px", paddingLeft: "1.3em" }}>
          <li style={{ marginBottom: 6 }}><b>框</b>：用生成填色時，先框住要改的範圍（矩形選取，或按 Q 用筆刷塗：塗黑 → 再按 Q → Shift+Ctrl+I 反轉）。用 AI 修圖改整張時，不用框。</li>
          <li style={{ marginBottom: 6 }}><b>打字</b>：要打字時，句子到第四節複製。能不能不打字、該打中文還是英文，先看第三節的表。</li>
          <li><b>按鈕</b>：按下去就扣錢。不滿意再按一次，結果會不一樣，但也會再扣一次。</li>
        </ol>

        <h2 style={h2}>三、按鈕一覽（便宜排到貴）</h2>
        <h3 style={h3}>🪄 生成填色</h3>
        <Table
          head={["按鈕", "每次", "可以不打字", "打哪一種語言", "什麼時候用"]}
          rows={byPrice("fill").map((m) => [
            m.label,
            `NT$${nt(m.usd).toFixed(2)}`,
            takesBlankPrompt(m) ? <Yes>可以</Yes> : <No>不行</No>,
            takesChinese(m) ? <Yes>中文</Yes> : <No>英文</No>,
            m.note,
          ])}
        />
        <h3 style={h3}>✏️ AI 修圖</h3>
        <Table
          head={["按鈕", "每次", "打哪一種語言", "什麼時候用"]}
          rows={byPrice("edit").map((m) => [
            m.label,
            `NT$${nt(m.usd).toFixed(2)}`,
            m.zh === "ok" ? <Yes>中文</Yes> : m.zh === "no" ? <No>英文</No> : <span style={muted}>沒測過</span>,
            m.note,
          ])}
        />
        <p style={{ ...p0, fontSize: 14 }}>
          <b>去除不要的部分</b>只有一顆鈕：{labelOf("bria-eraser")}（{price("bria-eraser")}，只清掉東西、不會順手加東西，不用打字）。
        </p>
        <h3 style={h3}>🔲 擴圖（把畫布往外長）</h3>
        <Table
          head={["按鈕", "每次", "什麼時候用"]}
          rows={modelsFor("outpaint").map((m) => [m.label, `NT$${nt(m.usd).toFixed(2)}`, m.note])}
        />
        <p style={{ ...p0, fontSize: 14 }}>擴圖的結果本來就會放成新圖層，原圖留在下面。三顆的差別看第十節。</p>
        <Note>
          中間那兩欄不是我的意見，是跑出來的：<b>可以不打字</b>看第六節，<b>打哪一種語言</b>看第七節。
          畫布上的按鈕也印了同樣的字，所以在裡面不用回來查這一頁。
        </Note>

        <h2 style={h2}>四、指令怎麼打</h2>
        <p style={p0}>三個句型就夠用，把角括號換成妳的東西。</p>

        <h3 style={h3}>清掉一個東西</h3>
        <CopyPrompt text="移除<要清掉的東西>，用周圍的<背景內容>補上。" note="後半句不能省。不講背景是什麼，模型會自己編一塊東西填進去。" />
        <CopyPrompt text={P.removeEn} note={`英文版。只有 ${labelOf("flux-kontext-fast")} 要用這句，其他鈕打上面的中文就好。`} />

        <h3 style={h3}>加一個東西</h3>
        <CopyPrompt text="一個<材質或顏色><東西>放在<位置>。" note="想指定材質、顏色或大小，就寫進去。只寫「一個杯子」，模型會自己決定杯子長什麼樣。" />

        <h3 style={h3}>整張調順、換氛圍</h3>
        <CopyPrompt text="<要改什麼>，維持原本的畫風與配色。" note="後半句不能省。省了，模型會順手把畫風一起換掉。" />

        <h3 style={h3}>三條規則</h3>
        <ol style={{ margin: "0 0 16px", paddingLeft: "1.3em" }}>
          <li style={{ marginBottom: 6 }}><b>說要變成什麼，不要說不要什麼。</b>「不要有動物」常常被當沒看到，「延續後面的橘色布幔」才有用。</li>
          <li style={{ marginBottom: 6 }}><b>一句話講一件事。</b>條件堆超過兩三件，只有 {labelOf("openai-26-edit")} 跟得上。</li>
          <li><b>不要寫感覺。</b>「改好看一點」「修一下」模型不知道要改什麼，會自己亂改，錢照扣。</li>
        </ol>

        {/* ---------- 實測 ---------- */}
        <h2 style={h2}>五、實測一：框要把整個東西包進去</h2>
        <p style={p0}>
          同一個框只蓋到三隻羊的中段，五顆鈕各按兩次，共十次，什麼字都沒打。
          <b>十次都動了，十次都沒清乾淨</b>，因為羊的身體超出框外。換更貴的鈕也救不回來：
        </p>
        <Grid>
          <Run src="a-src" model="原圖" verdict="src" note="框只蓋到三隻羊的中段。" />
          <Run src="a-ideogram-low-1" model={labelOf("ideogram-4-5-edit-low")} cost={`${price("ideogram-4-5-edit-low")}・第一次`} verdict="bad" note="框內換成別的布料，羊還在。" prompt={P.blank} />
          <Run src="a-ideogram-low-2" model={labelOf("ideogram-4-5-edit-low")} cost={`${price("ideogram-4-5-edit-low")}・第二次`} verdict="bad" note="少了一隻，其餘留著。" prompt={P.blank} />
          <Run src="a-eraser-1" model={labelOf("bria-eraser")} cost={`${price("bria-eraser")}・第一次`} verdict="bad" note="去除專用的鈕，一樣只處理框內。" prompt={P.blank} />
          <Run src="a-eraser-2" model={labelOf("bria-eraser")} cost={`${price("bria-eraser")}・第二次`} verdict="bad" note="和第一次不同，兩次都不乾淨。" prompt={P.blank} />
          <Run src="a-flux-fill-1" model={labelOf("flux-fill-pro")} cost={`${price("flux-fill-pro")}・第一次`} verdict="bad" note="塞進一塊不相干的風景。" prompt={P.blank} />
          <Run src="a-flux-fill-2" model={labelOf("flux-fill-pro")} cost={`${price("flux-fill-pro")}・第二次`} verdict="bad" note="這次塞進一個黃綠色的盆。" prompt={P.blank} />
          <Run src="a-ideogram-medium-1" model={labelOf("ideogram-4-5-edit")} cost={`${price("ideogram-4-5-edit")}・第一次`} verdict="bad" note="和便宜那一檔差不多。" prompt={P.blank} />
          <Run src="a-ideogram-medium-2" model={labelOf("ideogram-4-5-edit")} cost={`${price("ideogram-4-5-edit")}・第二次`} verdict="bad" note="貴一倍，結果沒有比較好。" prompt={P.blank} />
          <Run src="a-gpt26-1" model={labelOf("openai-26-edit")} cost={`${price("openai-26-edit")}・第一次`} verdict="bad" note="清掉一部分，左邊那隻還在。" prompt={P.blank} />
          <Run src="a-gpt26-2" model={labelOf("openai-26-edit")} cost={`${price("openai-26-edit")}・第二次`} verdict="bad" note="這次幾乎沒動。" prompt={P.blank} />
        </Grid>

        <h3 style={h3}>框對了，同一顆鈕兩次還是不一樣</h3>
        <p style={p0}>把整組動物連同牠們站的那段布幔都框進去，同一顆鈕按兩次：</p>
        <Grid>
          <Run src="b-src" model="原圖" verdict="src" note="這次框住整組動物。" />
          <Run src="b-gpt26-1" model={labelOf("openai-26-edit")} cost={`${price("openai-26-edit")}・第一次`} verdict="good" note="動物消失，布幔和座面完好。" prompt={P.blank} />
          <Run src="b-gpt26-2" model={labelOf("openai-26-edit")} cost={`${price("openai-26-edit")}・第二次`} verdict="bad" note="框裡全部清掉，連座面都沒了。" prompt={P.blank} />
        </Grid>
        <Note>兩次收到的自動指令一模一樣，結果卻不同：第二次連座面都被清掉了。所以<b>框的時候要注意框裡有沒有想留下來的東西</b>。再按一次會重新生成，也會再扣一次。</Note>

        <h2 style={h2}>六、實測二：什麼時候可以不打字</h2>
        <p style={p0}>
          描述欄空著直接按，這叫<b>不打字</b>。系統會替妳跟模型說一句話，意思是「把框裡的東西清掉，照旁邊的顏色和紋路補回來」。
          所以<b>框多大就清掉多大</b>。真正送出去的原文是這一句，妳不用自己打：
        </p>
        <CopyPrompt text={CONTEXT_FILL_PROMPT} note="系統自動送的。放在這裡只是讓妳知道它說了什麼。" />
        <p style={p0}>自己打「照周圍補」四個字沒有用。模型只收到那四個字，不知道要清掉什麼：</p>
        <Grid min={240}>
          <Run src="f-blank" model={labelOf("ideogram-4-5-edit-low")} cost={price("ideogram-4-5-edit-low")} verdict="good" note="什麼都不打：框裡的羊清掉，布幔接起來。" prompt={P.blank} />
          <Run src="f-typed" model={labelOf("ideogram-4-5-edit-low")} cost={price("ideogram-4-5-edit-low")} verdict="bad" note="自己打四個字：羊原封不動，錢照扣。" prompt={P.typed} />
        </Grid>

        <h3 style={h3}>兩顆鈕不能不打字，另外兩個版本我們沒有收</h3>
        <p style={p0}>
          {labelOf("flux-2-klein-4b")} 和 {labelOf("flux-kontext-fast")} 沒有遮罩功能，收到那句話也不知道範圍在哪，圖會原封不動回來。
          下面是當初的實測。<b>現在面板已經擋住了</b>，這兩顆沒打字就按會叫妳先打字，不會白扣錢：
        </p>
        <Grid min={190}>
          <Run src="g-src" model="原圖" verdict="src" note="框只蓋到羊的中段。" />
          <Run src="g-klein" model={labelOf("flux-2-klein-4b")} cost={price("flux-2-klein-4b")} verdict="bad" note="幾乎原圖照還。" prompt={P.blank} />
          <Run src="g-ideogram-verylow" model="Ideogram 4.5 Edit（very_low 檔）" cost="NT$0.26" verdict="bad" note="最低畫質檔幾乎沒動作，所以面板不提供這一檔。" prompt={P.blank} />
          <Run src="g-kontext-fast" model={labelOf("flux-kontext-fast")} cost={price("flux-kontext-fast")} verdict="bad" note="羊原封不動。" prompt={P.blank} />
          <Run src="g-nano21" model="Nano Banana 2.1" cost="NT$1.08" verdict="bad" note="構圖被重排，羊還在。所以沒有收進面板。" prompt={P.blank} />
        </Grid>

        <h2 style={h2}>七、實測三：打中文還是打英文</h2>
        <p style={p0}>同一個框、同一個意思，一次打中文、一次打英文。<b>兩顆聽得懂中文，一顆只聽得懂英文</b>：</p>
        <Grid>
          <Run src="c-klein-1" model={labelOf("flux-2-klein-4b")} cost={`${price("flux-2-klein-4b")}・英文`} verdict="good" note="清乾淨，布幔、王座、標題字都完好。" prompt={P.removeEn} />
          <Run src="c-klein-2" model={labelOf("flux-2-klein-4b")} cost={`${price("flux-2-klein-4b")}・英文・再一次`} verdict="good" note="再按一次，結果一致。" prompt={P.removeEn} />
          <Run src="h-klein-zh" model={labelOf("flux-2-klein-4b")} cost={`${price("flux-2-klein-4b")}・中文`} verdict="good" note="中文一樣清乾淨。這顆兩種語言都行。" prompt={P.remove} />
          <Run src="c-kontext-fast" model={labelOf("flux-kontext-fast")} cost={`${price("flux-kontext-fast")}・英文`} verdict="good" note="清乾淨，筆觸最貼近原畫。" prompt={P.removeEn} />
          <Run src="h-kontext-fast-zh" model={labelOf("flux-kontext-fast")} cost={`${price("flux-kontext-fast")}・中文`} verdict="bad" note="動物還在，只被改成銅色。按兩次都一樣。" prompt={P.remove} />
          <Run src="h-ideogram-zh" model={labelOf("ideogram-4-5-edit-low")} cost={`${price("ideogram-4-5-edit-low")}・中文`} verdict="good" note="中文清乾淨，和英文一樣好。" prompt={P.remove} />
        </Grid>
        <Note>
          這一節測到的三顆裡，只有 {labelOf("flux-kontext-fast")} 要打英文，句子在第四節可以直接複製；另外兩顆打中文都有效。
          其他按鈕看第三節的表，畫布上的按鈕也印了同樣的字，不用記。
        </Note>

        <h2 style={h2}>八、實測四：加東西，四顆鈕的差別</h2>
        <p style={p0}>框住王座右邊的扶手，四顆鈕各按一次，打的字完全一樣：</p>
        <Grid>
          <Run src="d-src" model="原圖" verdict="src" note="框住右邊扶手。" />
          <Run src="d-ideogram-low" model={labelOf("ideogram-4-5-edit-low")} cost={price("ideogram-4-5-edit-low")} verdict="good" note="金杯大小合適、畫風一致，最划算。" prompt={P.add} />
          <Run src="d-flux-fill" model={labelOf("flux-fill-pro")} cost={price("flux-fill-pro")} verdict="bad" note="給了白瓷杯，沒照「金色高腳」做。" prompt={P.add} />
          <Run src="d-ideogram-medium" model={labelOf("ideogram-4-5-edit")} cost={price("ideogram-4-5-edit")} verdict="good" note="一樣好，但貴一倍。" prompt={P.add} />
          <Run src="d-gpt26" model={labelOf("openai-26-edit")} cost={price("openai-26-edit")} verdict="bad" note="杯子偏小，像擺在後面。" prompt={P.add} />
        </Grid>

        <h2 style={h2}>九、實測五：整張改圖，三顆鈕的差別</h2>
        <p style={p0}>不用框，三顆鈕各按一次，打的字完全一樣：</p>
        <Grid>
          <Run src="e-src" model="原圖" verdict="src" note="注意背景的漩渦筆觸，和下方的標題字。" />
          <Run src="e-klein" model={labelOf("flux-2-klein-4b")} cost={price("flux-2-klein-4b")} verdict="bad" note="字完整，但筆觸被抹平、金箔厚度不見。" prompt={P.whole} />
          <Run src="e-kontext-fast" model={labelOf("flux-kontext-fast")} cost={price("flux-kontext-fast")} verdict="bad" note="畫風最像，字變成 HAT CRILES。" prompt={P.whole} />
          <Run src="e-kontext-pro" model={labelOf("flux-kontext-pro")} cost={price("flux-kontext-pro")} verdict="bad" note="細節最好，字變成 KING-BENTACIES。" prompt={P.whole} />
        </Grid>
        <Note>三顆之中兩顆把字改壞了，剩下那顆字是保住了，但筆觸被抹平。這就是第一節那句話的來源：<b>圖上有字就別整張改</b>。</Note>

        <h2 style={h2}>十、實測六：擴圖，三顆鈕的差別</h2>
        <p style={p0}>
          把直式的牌往左右各擴一段，變成橫的 16:9。三顆鈕都給同一句英文指令「照原本的背景往外畫，不要加新東西」：
        </p>
        <Grid min={230}>
          <Run src="i-src" model="原圖" verdict="src" note="直式，896×1485。" />
          <Run src="i-bria" model={labelOf("bria-expand")} cost={price("bria-expand")} verdict="good" note="牌完全沒動，左右的漩渦接得自然。" prompt="（不用打字）" />
          <Run src="i-flux-fill" model={labelOf("flux-fill-pro")} cost={price("flux-fill-pro")} verdict="bad" note="左右各自己多畫了一張塔羅牌。" prompt="照原本的背景往外畫，不要加新東西（英文）" />
          <Run src="i-gpt26" model={labelOf("openai-26-edit")} cost={price("openai-26-edit")} verdict="good" note="牌沒動，背景乾淨延伸，沒有多畫東西。" prompt="照原本的背景往外畫，不要加新東西（英文）" />
        </Grid>
        <Note>
          擴圖先按 {labelOf("bria-expand")}，它最穩又最便宜。{labelOf("flux-fill-pro")} 會自己加東西，要盯著看。
          另外試過 Luma Reframe，同一張圖連試三次都回同一個錯誤，所以沒有收進來。
        </Note>

        {/* ---------- 錢 ---------- */}
        <h2 style={h2}>十一、錢的規則</h2>
        <Table
          head={["情況", "扣款"]}
          firstCol={230}
          rows={[
            ["按一次鈕", <>扣一次。<b>再按一次就再扣一次</b>，沒有「重試不收費」這種事。</>],
            ["模型回錯誤或逾時", <>不收費。系統會先保留這筆錢，模型失敗或逾時就退回去。</>],
            ["打了中文，但那顆只吃英文", <><b>照扣</b>。圖原封不動回來，錢還是花了——所以先看第三節的表。</>],
            [<>{labelOf("openai-25-edit")} / {labelOf("openai-26-edit")} 跑完才出錯</>, <>會扣。這兩顆是 OpenAI 按字數計價，伺服器算完就計費。</>],
            [<>{labelOf("openai-26-edit")} 的標價</>, <>是<b>估計值</b>。實測一次 US$0.0475（約 NT$1.52），比鈕上的 {price("openai-26-edit")} 少；描述長、圖大會更貴。</>],
            ["其他鈕的標價", <>固定牌價，實收就是那個數字。</>],
            ["去背 / 升頻", <>約 NT$0.06 一次。按 GPU 秒數計價，所以是估計值。</>],
            ["色調分離、邊緣遮罩、範本、QR、條碼", <>在妳自己的電腦上算，<b>完全不花錢</b>。</>],
          ]}
        />
        <Note>
          每一筆實際金額都記在 <Link href="/ops/costs" style={{ color: "var(--accent-text)" }}>AI Costs</Link>，含模型、時間、來源。
          想知道今天花多少，看那一頁，不要用這裡的牌價相加。
        </Note>

        <p style={{ fontSize: 13.5, ...muted, borderTop: `1px solid ${LINE}`, paddingTop: 14, marginTop: 36 }}>
          40 張圖全部是 2026-11-09 在同一張塔羅牌上真的跑出來的，沒有示意圖。
          價格是 Replicate 當天牌價換算新台幣（1 美元 = 32 元）。
          模型規格見 <Link href="/tools/ai-models?tab=image-specs" style={{ color: "var(--accent-text)" }}>AI Models</Link>，
          面板在 <Link href="/tools/photo-pro" style={{ color: "var(--accent-text)" }}>畫布（專業版）</Link>。
        </p>
      </div>
    </>
  );
}
