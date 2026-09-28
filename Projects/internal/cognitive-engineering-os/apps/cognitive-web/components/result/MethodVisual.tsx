import React from "react";
import { linesFor, lineHeight, Wrap } from "./svgtext";

type Bindings = Record<string, unknown>;
// One unit of a layered picture: its name, what you filled in (and its short form, when the analysis wrote one), its [n],
// the short form of how to act there (the analysis's `step`).
export type Unit = { label: string; question: string; text: string; brief?: string; step?: string; cite?: number; focus?: boolean };

// The iceberg model's own content (Anderson & Johnson), the same for every case: what each layer is, the question it
// asks (the mock's ②), whether it shows, its time frame, how you act there and how long that lasts. One table for the
// picture, the layer cards (④) and the comparison table (⑥).
export const ICEBERG_LAYERS = [
  { name: "事件 Events", title: "事件 Events", short: "事件", question: "現在發生了什麼？", ask4: "現在發生了什麼？", asks: "最快的因應是什麼？", seen: "看得見", time: "現在", when: "現在", mode: "回應 React", effect: "當下的因應", lasting: "短期" },
  { name: "模式 Patterns", title: "模式與趨勢 Patterns & Trends", short: "模式", question: "這段時間的趨勢？事件之間有什麼關聯？", ask4: "這段時間有什麼趨勢？哪些事件互相關聯？", asks: "什麼趨勢在反覆出現？", seen: "看不見", time: "過去到現在", when: "過去→現在", mode: "預測 Anticipate", effect: "看出趨勢", lasting: "提早看到" },
  { name: "結構 Structures", title: "結構與流程 Structures & Processes", short: "結構", question: "什麼流程、制度在製造這個模式？", ask4: "什麼流程、制度、權力安排在製造上面的模式？", asks: "什麼制度在製造這些模式？", seen: "看不見", time: "現在到未來", when: "現在→未來", mode: "設計 Design", effect: "改流程、改制度", lasting: "持久" },
  { name: "心智模型 Mental Models", title: "心智模型 Mental Models", short: "心智模型", question: "什麼沒說出口的假設造成這些結構？", ask4: "什麼沒說出口的假設、信念、價值觀，造就了上面的結構？", asks: "這些制度背後的假設是什麼？", seen: "最深、最看不見", time: "未來", when: "未來", mode: "轉化 Transform", effect: "改信念", lasting: "根本" },
];

// The mock's iceberg (docs/mockups/iceberg-result-mock.html ②) as a polygon whose four bands can grow: the water line
// at 150, dashed band lines at 290 and 420, the bottom at 575. When a band's text needs more room, every y inside the
// band scales with it, so the drawing keeps its shape and the text is never cut.
const POINTS: Array<[number, number]> = [[550, 150], [585, 40], [620, 85], [645, 55], [690, 150], [810, 290], [780, 420], [690, 540], [560, 540], [460, 420], [420, 290]];
const BANDS: Array<[number, number]> = [[0, 150], [150, 290], [290, 420], [420, 575]];
const LEFT_X = 30, LEFT_W = 370, RIGHT_X = 830, RIGHT_W = 220, Q_SIZE = 14.5, T_SIZE = 13;

function Iceberg({ units }: { units: Unit[] }) {
  const rows = ICEBERG_LAYERS.map((layer, index) => {
    const unit = units[index];
    const question = `${"①②③④"[index]} ${layer.short}｜${layer.question}${unit?.focus ? " ★ 建議先出手" : ""}`;
    const filled = unit ? `${unit.brief ?? unit.text}${unit.cite ? ` ［${unit.cite}］` : ""}` : "（沒填）";
    const act = `${unit?.step ?? layer.effect} → ${layer.lasting}`;
    const qLines = linesFor(question, LEFT_W, Q_SIZE), tLines = linesFor(filled, LEFT_W, T_SIZE), aLines = linesFor(act, RIGHT_W, T_SIZE);
    return { question, filled, act, qH: qLines * lineHeight(Q_SIZE), tH: tLines * lineHeight(T_SIZE), aH: aLines * lineHeight(T_SIZE) };
  });
  // band i needs its two left blocks (and the right block) plus breathing room; the first band also holds the tip
  const need = rows.map((row, index) => Math.max(row.qH + row.tH, lineHeight(Q_SIZE) + row.aH) + (index === 0 ? 100 : 60));
  let cursor = 0;
  const bands = BANDS.map(([top, bottom], index) => { const h = Math.max(bottom - top, need[index]); const band = { oldTop: top, oldH: bottom - top, top: cursor, h }; cursor += h; return band; });
  const total = cursor;
  const mapY = (y: number) => { const index = Math.min(3, Math.max(0, BANDS.findIndex(([, bottom]) => y < bottom) === -1 ? 3 : BANDS.findIndex(([, bottom]) => y < bottom))); const band = bands[index]; return band.top + ((y - band.oldTop) / band.oldH) * band.h; };
  const path = POINTS.map(([x, y], index) => `${index ? "L" : "M"}${x},${mapY(y)}`).join(" ") + " Z";
  const water = mapY(150), line1 = mapY(290), line2 = mapY(420);
  const textTop = (index: number) => bands[index].top + (index === 0 ? 80 : 46);   // the mock's baselines (96/212/346/472) less the ascent; the first band starts under 看得見
  return <>
    <svg viewBox={`0 0 1070 ${total}`} role="img" aria-label="冰山模型四層圖">
      <defs>
        <linearGradient id="ice" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fbe3d6" /><stop offset="0.2" stopColor="#cfe3f3" /><stop offset="0.5" stopColor="#5a93c4" /><stop offset="0.75" stopColor="#245b8a" /><stop offset="1" stopColor="#0b2a4a" /></linearGradient>
        <clipPath id="berg"><path d={path} /></clipPath>
      </defs>
      <rect x="0" y={water} width="1070" height={total - water} className="water" opacity="0.55" />
      <path d={`M0,${water} q20,-8 40,0${" t40,0".repeat(26)}`} fill="none" stroke="#7aa7cc" strokeWidth="2.5" />
      <line x1="30" y1={line1} x2="1050" y2={line1} stroke="#7aa7cc" strokeDasharray="5 5" />
      <line x1="30" y1={line2} x2="1050" y2={line2} stroke="#7aa7cc" strokeDasharray="5 5" />
      <path d={path} fill="url(#ice)" stroke="#1f3b5c" strokeWidth="2" />
      <g clipPath="url(#berg)"><line x1="400" y1={line1} x2="840" y2={line1} stroke="#fff" strokeDasharray="4 4" opacity=".7" /><line x1="400" y1={line2} x2="840" y2={line2} stroke="#fff" strokeDasharray="4 4" opacity=".7" /></g>
      <g fontWeight="700" textAnchor="middle">{ICEBERG_LAYERS.map((layer, index) => <text key={layer.name} className={index ? "w" : "tip"} x="618" y={mapY([128, 230, 362, 490][index])} fontSize="17">{layer.name}</text>)}</g>
      <text x="30" y={bands[0].top + 62} fontSize="12" className="m">看得見 Visible</text>
      <text x="30" y={water + 22} fontSize="12" className="m">水面以下：看不見 Hidden</text>
      {rows.map((row, index) => <React.Fragment key={index}>
        <Wrap x={LEFT_X} y={textTop(index)} width={LEFT_W} height={row.qH + 2} size={Q_SIZE} bold>{row.question.replace(" ★ 建議先出手", "")}{units[index]?.focus && <span style={{ display: "inline-block" }}> ★ 建議先出手</span>}</Wrap>
        <Wrap x={LEFT_X} y={textTop(index) + row.qH + 2} width={LEFT_W} height={row.tH + 2} size={T_SIZE} className="m">{row.filled}</Wrap>
        <Wrap x={RIGHT_X} y={textTop(index)} width={RIGHT_W} height={lineHeight(Q_SIZE) + 2} size={Q_SIZE} bold>{ICEBERG_LAYERS[index].mode}</Wrap>
        <Wrap x={RIGHT_X} y={textTop(index) + lineHeight(Q_SIZE) + 2} width={RIGHT_W} height={row.aH + 2} size={T_SIZE} className="m">{row.act}</Wrap>
      </React.Fragment>)}
      <text x="830" y={total - 15} fontSize="12" className="a">↓ 越往下：越難改，效果越大越持久</text>
    </svg>
    <div className="legend"><span>左：這一層要回答的問題＋你填的內容</span><span>中：四層冰山</span><span>右：在這一層出手的方式（介入方式）</span></div>
  </>;
}

// Any other layered tool: its own units, top to bottom, with what you filled in; each band as tall as its text.
function Layers({ units, name }: { units: Unit[]; name: string }) {
  const rows = units.map((unit) => { const text = `${unit.text}${unit.cite ? ` ［${unit.cite}］` : ""}`; return { text, h: 34 + linesFor(text, 1020, 13) * lineHeight(13) + 6 }; });
  const tops = rows.reduce<number[]>((acc, row) => [...acc, (acc[acc.length - 1] ?? 5) + (acc.length ? rows[acc.length - 1].h + 6 : 0)], []);
  const total = (tops[tops.length - 1] ?? 5) + (rows[rows.length - 1]?.h ?? 0) + 10;
  return <svg viewBox={`0 0 1070 ${total}`} role="img" aria-label={`${name}分層圖`}>
    {units.map((unit, index) => <g key={index}>
      <rect x="5" y={tops[index]} width="1060" height={rows[index].h} rx="8" className="water" opacity={0.35 + 0.15 * Math.min(index, 4)} />
      <text x="24" y={tops[index] + 24} fontSize="15" fontWeight="700">{unit.label}</text>
      <Wrap x={24} y={tops[index] + 32} width={1020} height={rows[index].h - 34} size={13} className="m">{rows[index].text}</Wrap>
    </g>)}
  </svg>;
}

export function MethodVisual({ kind, bindings, methodId, name = "", units = [] }: { kind: string; bindings: Bindings; methodId?: string; name?: string; units?: Unit[] }) {
  if (kind === "layered") return <div data-visual="layered" data-method={methodId}>{methodId === "systems.iceberg_model" ? <Iceberg units={units} /> : <Layers units={units} name={name} />}</div>;
  if (kind === "quadrant") {
    return <dl className="visual-quadrant" data-visual="quadrant">
      {Object.entries(bindings).map(([key, value]) => <React.Fragment key={key}><dt>{key}</dt><dd><code>{String(value)}</code></dd></React.Fragment>)}
    </dl>;
  }
  if (kind === "table") {
    return <table data-visual="table"><tbody>{Object.entries(bindings).map(([key, value]) => <tr key={key}><th>{key}</th><td><code>{String(value)}</code></td></tr>)}</tbody></table>;
  }
  return <pre data-visual={kind}>{JSON.stringify(bindings, null, 2)}</pre>;
}
