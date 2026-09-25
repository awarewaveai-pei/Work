import React from "react";

type Bindings = Record<string, unknown>;

export function MethodVisual({ kind, bindings }: { kind: string; bindings: Bindings }) {
  if (kind === "layered") {
    const levels = Array.isArray(bindings.levels) ? bindings.levels as Array<{ label?: unknown; path?: unknown }> : [];
    const names = ["事件 Events", "模式 Patterns", "結構 Structures", "心智模型 Mental Models"];
    const y = [128, 230, 362, 490];
    return <div data-visual="layered"><svg viewBox="0 0 1070 575" role="img" aria-label="冰山模型四層圖" style={{ width: "100%" }}><defs><linearGradient id="ice" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fbe3d6" /><stop offset="0.2" stopColor="#cfe3f3" /><stop offset="0.5" stopColor="#5a93c4" /><stop offset="0.75" stopColor="#245b8a" /><stop offset="1" stopColor="#0b2a4a" /></linearGradient></defs><rect x="0" y="150" width="1070" height="425" fill="#dceaf5" /><path d="M550,150 L585,40 L620,85 L645,55 L690,150 L810,290 L780,420 L690,540 L560,540 L460,420 L420,290 Z" fill="url(#ice)" stroke="#1f3b5c" strokeWidth="2" /><line x1="30" y1="150" x2="1050" y2="150" stroke="#245b8a" strokeDasharray="5 5" /><line x1="30" y1="290" x2="1050" y2="290" stroke="#7aa7cc" strokeDasharray="5 5" /><line x1="30" y1="420" x2="1050" y2="420" stroke="#7aa7cc" strokeDasharray="5 5" />{names.map((name, index) => <text key={name} x="618" y={y[index]} textAnchor="middle" fontWeight="700" fill={index ? "#fff" : "#1f3b5c"}>{name}</text>)}<text x="30" y="62">看得見 Visible</text><text x="30" y="172">水面以下：看不見 Hidden</text></svg><div className="grid">{levels.map((level, index) => <p key={`${String(level.path)}-${index}`}><strong>{names[index] ?? `第 ${index + 1} 層`}</strong> <code>{String(level.path ?? "")}</code></p>)}</div></div>;
  }
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
