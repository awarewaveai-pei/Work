import React from "react";

type Bindings = Record<string, unknown>;

export function MethodVisual({ kind, bindings }: { kind: string; bindings: Bindings }) {
  if (kind === "layered") {
    const levels = Array.isArray(bindings.levels) ? bindings.levels as Array<{ label?: unknown; path?: unknown }> : [];
    return <ol className="visual-layered" data-visual="layered">{levels.map((level, index) => <li key={`${String(level.label)}-${index}`}><strong>{String(level.label ?? `Layer ${index + 1}`)}</strong><code>{String(level.path ?? "")}</code></li>)}</ol>;
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
