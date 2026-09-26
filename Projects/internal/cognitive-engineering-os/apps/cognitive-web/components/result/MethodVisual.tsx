import React from "react";

type Bindings = Record<string, unknown>;
// One unit of a layered picture: its name, the question it asks (the run form's label), what you filled in, its [n].
export type Unit = { label: string; question: string; text: string; cite?: number; focus?: boolean };

const short = (text: string, max = 30) => (Array.from(text).length > max ? Array.from(text).slice(0, max).join("") + "…" : text);
const ICEBERG = "M550,150 L585,40 L620,85 L645,55 L690,150 L810,290 L780,420 L690,540 L560,540 L460,420 L420,290 Z";
// The iceberg model's own content (Anderson & Johnson), the same for every case: what each layer is, whether it shows,
// its time frame and how you act there. One table for the picture, the layer cards (④) and the comparison table (⑥).
export const ICEBERG_LAYERS = [
  { name: "事件 Events", short: "事件", seen: "看得見", time: "現在", when: "現在", mode: "回應 React", effect: "當下的因應 → 短期" },
  { name: "模式 Patterns", short: "模式", seen: "看不見", time: "過去到現在", when: "過去→現在", mode: "預測 Anticipate", effect: "看出趨勢 → 提早看到" },
  { name: "結構 Structures", short: "結構", seen: "看不見", time: "現在到未來", when: "現在→未來", mode: "設計 Design", effect: "改流程、改制度 → 持久" },
  { name: "心智模型 Mental Models", short: "心智模型", seen: "最深、最看不見", time: "未來", when: "未來", mode: "轉化 Transform", effect: "改信念 → 最根本" },
];

// The iceberg of docs/mockups/iceberg-result-mock.html ②: left = each layer's question + what you filled in [n],
// middle = the four layers, right = how to act at that layer. `units` are the tool's four fields in form order.
function Iceberg({ units }: { units: Unit[] }) {
  const y = [96, 212, 346, 472];
  return <>
    <svg viewBox="0 0 1070 575" role="img" aria-label="冰山模型四層圖">
      <defs>
        <linearGradient id="ice" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fbe3d6" /><stop offset="0.2" stopColor="#cfe3f3" /><stop offset="0.5" stopColor="#5a93c4" /><stop offset="0.75" stopColor="#245b8a" /><stop offset="1" stopColor="#0b2a4a" /></linearGradient>
        <clipPath id="berg"><path d={ICEBERG} /></clipPath>
      </defs>
      <rect x="0" y="150" width="1070" height="425" className="water" opacity="0.55" />
      <line x1="30" y1="290" x2="1050" y2="290" stroke="#7aa7cc" strokeDasharray="5 5" />
      <line x1="30" y1="420" x2="1050" y2="420" stroke="#7aa7cc" strokeDasharray="5 5" />
      <path d={ICEBERG} fill="url(#ice)" stroke="#1f3b5c" strokeWidth="2" />
      <g clipPath="url(#berg)"><line x1="400" y1="290" x2="840" y2="290" stroke="#fff" strokeDasharray="4 4" opacity=".7" /><line x1="400" y1="420" x2="840" y2="420" stroke="#fff" strokeDasharray="4 4" opacity=".7" /></g>
      <g fontWeight="700" textAnchor="middle">{ICEBERG_LAYERS.map((layer, index) => <text key={layer.name} className={index ? "w" : "tip"} x="618" y={[128, 230, 362, 490][index]} fontSize="17">{layer.name}</text>)}</g>
      <text x="30" y="62" fontSize="12" className="m">看得見 Visible</text>
      <text x="30" y="172" fontSize="12" className="m">水面以下：看不見 Hidden</text>
      <g fontSize="14.5">{units.slice(0, 4).map((unit, index) => <React.Fragment key={index}>
        <text x="30" y={y[index]} fontWeight="700">{short(unit.question.replace("：", "｜"), unit.focus ? 18 : 26)}{unit.focus && <tspan className="a"> ★ 建議先出手</tspan>}</text>
        <text x="30" y={y[index] + 22} fontSize="13" className="m">{short(unit.text)}{unit.cite ? ` ［${unit.cite}］` : ""}</text>
      </React.Fragment>)}</g>
      <g fontSize="14.5">{ICEBERG_LAYERS.map((layer, index) => <React.Fragment key={layer.mode}>
        <text x="830" y={y[index]} fontWeight="700">{layer.mode}</text>
        <text x="830" y={y[index] + 22} fontSize="13" className="m">{layer.effect}</text>
      </React.Fragment>)}<text x="830" y="560" fontSize="12" className="a">↓ 越往下：越難改，效果越大越持久</text></g>
    </svg>
    <div className="legend"><span>左：這一層要回答的問題＋你填的內容</span><span>中：四層冰山</span><span>右：在這一層出手的方式</span></div>
  </>;
}

// Any other layered tool: its own units, top to bottom, with what you filled in.
function Layers({ units, name }: { units: Unit[]; name: string }) {
  const h = 64;
  return <svg viewBox={`0 0 1070 ${units.length * h + 10}`} role="img" aria-label={`${name}分層圖`}>
    {units.map((unit, index) => <g key={index}>
      <rect x="5" y={index * h + 5} width="1060" height={h - 10} rx="8" className="water" opacity={0.35 + 0.15 * Math.min(index, 4)} />
      <text x="24" y={index * h + 30} fontSize="15" fontWeight="700">{short(unit.label, 24)}</text>
      <text x="24" y={index * h + 50} fontSize="13" className="m">{short(unit.text, 60)}{unit.cite ? ` ［${unit.cite}］` : ""}</text>
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
