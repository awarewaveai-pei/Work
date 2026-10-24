// Image model specs tab of /tools/ai-models — what each image model reads and does. Renders lib/tarot/model-specs.ts, the same data the tarot
// studio and image-gen use, so this page cannot drift from what is actually sent.
import { MODEL_SPECS, type ReferenceRole } from "@/lib/tarot/model-specs";

const ROLE_ZH: Record<ReferenceRole, string> = {
  none: "不收參考圖",
  init: "當起始圖重畫（會沿用構圖）",
  edit: "直接修改這張圖",
  multimodal: "一般參考，提示詞要說明用途",
  character: "只固定角色長相",
};

const th: React.CSSProperties = { textAlign: "left", padding: "8px 10px", fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", borderBottom: "1px solid var(--card-border)", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "8px 10px", fontSize: 13, color: "var(--text-primary)", borderBottom: "1px solid var(--card-border)", verticalAlign: "top" };

export default function ImageModelSpecs() {
  const rows = Object.entries(MODEL_SPECS);
  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 4 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>圖片模型規格</h2>
          <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>資料來源：lib/tarot/model-specs.ts · 2026-10-22 查證</span>
        </div>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0, maxWidth: 900 }}>
          每個模型能讀多長的提示詞、怎麼使用參考圖、會不會自己改寫提示詞。例：FLUX schnell 只讀前 256 個 token，後面直接丟掉，所以送給它的提示詞把動作和場景放在最前面。
          生圖程式直接讀這份資料，改這裡就是改實際送出的方式。
        </p>
      </div>
      <div style={{ overflowX: "auto", background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: 12 }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 1200 }}>
          <thead>
            <tr>
              <th style={th}>模型</th>
              <th style={th}>能讀多長</th>
              <th style={th}>參考圖</th>
              <th style={th}>自動改寫提示詞</th>
              <th style={th}>固定 seed</th>
              <th style={th}>否定詞</th>
              <th style={th}>官方建議寫法</th>
              <th style={th}>本系統怎麼送</th>
              <th style={th}>來源</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([key, s]) => (
              <tr key={key}>
                <td style={td}><div style={{ fontWeight: 700 }}>{s.label}</div><div style={{ fontSize: 12, color: "var(--text-muted)" }}>{s.vendor}</div></td>
                <td style={td}>{s.promptLimit}</td>
                <td style={td}>{ROLE_ZH[s.referenceRole]}</td>
                <td style={td}>{s.rewrite}{s.rewriteOff ? <div style={{ fontSize: 12, color: "var(--accent-text)" }}>本系統已關閉</div> : null}</td>
                <td style={td}>{s.seed ? "可以" : "不行"}</td>
                <td style={td}>{s.negativePrompt}</td>
                <td style={td}>{s.vendorOrder}</td>
                <td style={td}>
                  <div>{s.promptOrder === "content-first" ? "動作＋場景在前，風格細節在後" : "動作在前，接完整風格，再接場景"}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{s.usesDeckPreview ? "會送鎖定的預覽圖（固定角色）" : "不送鎖定的預覽圖"}</div>
                  {s.notes ? <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{s.notes}</div> : null}
                </td>
                <td style={td}>
                  {s.sources.map((u) => (
                    <div key={u}><a href={u} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "var(--accent-text)", wordBreak: "break-all" }}>{new URL(u).hostname}</a></div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
