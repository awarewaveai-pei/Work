"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

interface AiTool {
  id: string;
  name: string;
  type: "web" | "editor" | "cli";
  description: string;
  url?: string;
  command?: string;
  builtin?: boolean;
}

interface NotifyChannel {
  id: string;
  name: string;
  type: "slack" | "email" | "webhook";
  target: string;
  builtin?: boolean;
}

const BUILTIN_TOOLS: AiTool[] = [
  { id: "cursor", name: "Cursor", type: "editor", description: "AI 程式編輯器（本機 IDE）", builtin: true },
  { id: "chatgpt", name: "ChatGPT", type: "web", description: "OpenAI 網頁版", url: "https://chatgpt.com", builtin: true },
  { id: "claude", name: "Claude", type: "web", description: "Anthropic 網頁版", url: "https://claude.ai", builtin: true },
  { id: "gemini-web", name: "Gemini (Web)", type: "web", description: "Google Gemini 網頁版", url: "https://gemini.google.com", builtin: true },
  { id: "codex", name: "Codex CLI", type: "cli", description: "OpenAI Codex 終端機工具", command: 'codex "<貼上prompt>"', builtin: true },
  { id: "copilot", name: "GitHub Copilot CLI", type: "cli", description: "gh copilot suggest 指令", command: 'gh copilot suggest "<貼上prompt>"', builtin: true },
  { id: "gemini-cli", name: "Gemini CLI", type: "cli", description: "Google Gemini 終端機工具", command: 'gemini "<貼上prompt>"', builtin: true },
];

const BUILTIN_CHANNELS: NotifyChannel[] = [
  {
    id: "slack-ops-incidents",
    name: "Slack #ops-incidents",
    type: "slack",
    target: "https://hooks.slack.com/services/T0AS1L6UALV/B0AVAMKFHFF/…（環境變數 OPS_INBOX_SLACK_INCIDENTS_WEBHOOK）",
    builtin: true,
  },
];

const TYPE_ICON: Record<AiTool["type"], string> = {
  web: "🌐",
  editor: "✏️",
  cli: "💻",
};

const CHANNEL_ICON: Record<NotifyChannel["type"], string> = {
  slack: "💬",
  email: "📧",
  webhook: "🔗",
};

const TOOL_TYPE_LABEL: Record<AiTool["type"], string> = {
  web: "網頁",
  editor: "編輯器",
  cli: "CLI",
};

export default function OpsToolsPage() {
  const [tools, setTools] = useState<AiTool[]>([]);
  const [channels, setChannels] = useState<NotifyChannel[]>([]);
  const [newTool, setNewTool] = useState({ name: "", type: "web" as AiTool["type"], description: "", url: "", command: "" });
  const [newChannel, setNewChannel] = useState({ name: "", type: "slack" as NotifyChannel["type"], target: "" });
  const [toolMsg, setToolMsg] = useState("");
  const [channelMsg, setChannelMsg] = useState("");

  useEffect(() => {
    const savedTools = localStorage.getItem("ops_custom_tools");
    const savedChannels = localStorage.getItem("ops_custom_channels");
    setTools(savedTools ? (JSON.parse(savedTools) as AiTool[]) : []);
    setChannels(savedChannels ? (JSON.parse(savedChannels) as NotifyChannel[]) : []);
  }, []);

  const addTool = () => {
    if (!newTool.name.trim()) return;
    const t: AiTool = {
      id: `custom-${Date.now()}`,
      name: newTool.name.trim(),
      type: newTool.type,
      description: newTool.description.trim(),
      url: newTool.url.trim() || undefined,
      command: newTool.command.trim() || undefined,
    };
    const updated = [...tools, t];
    setTools(updated);
    localStorage.setItem("ops_custom_tools", JSON.stringify(updated));
    setNewTool({ name: "", type: "web", description: "", url: "", command: "" });
    setToolMsg("✓ 已新增");
    setTimeout(() => setToolMsg(""), 2000);
  };

  const removeTool = (id: string) => {
    const updated = tools.filter((t) => t.id !== id);
    setTools(updated);
    localStorage.setItem("ops_custom_tools", JSON.stringify(updated));
  };

  const addChannel = () => {
    if (!newChannel.name.trim() || !newChannel.target.trim()) return;
    const c: NotifyChannel = {
      id: `custom-${Date.now()}`,
      name: newChannel.name.trim(),
      type: newChannel.type,
      target: newChannel.target.trim(),
    };
    const updated = [...channels, c];
    setChannels(updated);
    localStorage.setItem("ops_custom_channels", JSON.stringify(updated));
    setNewChannel({ name: "", type: "slack", target: "" });
    setChannelMsg("✓ 已新增");
    setTimeout(() => setChannelMsg(""), 2000);
  };

  const removeChannel = (id: string) => {
    const updated = channels.filter((c) => c.id !== id);
    setChannels(updated);
    localStorage.setItem("ops_custom_channels", JSON.stringify(updated));
  };

  const allTools = [...BUILTIN_TOOLS, ...tools];
  const allChannels = [...BUILTIN_CHANNELS, ...channels];

  return (
    <div style={{ background: "var(--bg-canvas)", minHeight: "100vh", padding: "28px 32px", maxWidth: 900, margin: "0 auto" }}>
      <nav style={{ marginBottom: 16, fontSize: 13, color: "#64748b" }}>
        <Link href="/ops/inbox" style={{ color: "#6366f1", textDecoration: "none" }}>← Ops Inbox</Link>
        {" / "}
        <span>Tools</span>
      </nav>

      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>AI 工具與通知設定</h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>查看已整合的 AI 工具與通知頻道，並可自行新增項目（儲存於本機）</p>
      </div>

      {/* ── AI Tools ─────────────────────────────────── */}
      <Section title="AI 工具" subtitle={`${allTools.length} 個工具`}>
        <div style={{ display: "grid", gap: 10, marginBottom: 20 }}>
          {allTools.map((tool) => (
            <ToolRow key={tool.id} tool={tool} onRemove={!tool.builtin ? () => removeTool(tool.id) : undefined} />
          ))}
        </div>

        <div
          style={{
            background: "#f8fafc",
            border: "1px dashed #cbd5e1",
            borderRadius: 10,
            padding: 16,
          }}
        >
          <h4 style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 12 }}>新增 AI 工具</h4>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <Field label="工具名稱 *">
              <input
                value={newTool.name}
                onChange={(e) => setNewTool((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Perplexity"
                style={inputStyle}
              />
            </Field>
            <Field label="類型">
              <select
                value={newTool.type}
                onChange={(e) => setNewTool((p) => ({ ...p, type: e.target.value as AiTool["type"] }))}
                style={inputStyle}
              >
                <option value="web">🌐 網頁</option>
                <option value="editor">✏️ 編輯器</option>
                <option value="cli">💻 CLI</option>
              </select>
            </Field>
          </div>
          <Field label="說明">
            <input
              value={newTool.description}
              onChange={(e) => setNewTool((p) => ({ ...p, description: e.target.value }))}
              placeholder="工具用途描述"
              style={inputStyle}
            />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
            <Field label="網址（web 類型）">
              <input
                value={newTool.url}
                onChange={(e) => setNewTool((p) => ({ ...p, url: e.target.value }))}
                placeholder="https://..."
                style={inputStyle}
              />
            </Field>
            <Field label="指令（CLI 類型）">
              <input
                value={newTool.command}
                onChange={(e) => setNewTool((p) => ({ ...p, command: e.target.value }))}
                placeholder='mytool "prompt"'
                style={inputStyle}
              />
            </Field>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
            <button
              onClick={addTool}
              disabled={!newTool.name.trim()}
              style={{
                padding: "7px 18px",
                background: newTool.name.trim() ? "#6366f1" : "#e2e8f0",
                color: newTool.name.trim() ? "#fff" : "#94a3b8",
                border: "none",
                borderRadius: 7,
                fontSize: 13,
                fontWeight: 600,
                cursor: newTool.name.trim() ? "pointer" : "default",
              }}
            >
              新增工具
            </button>
            {toolMsg && <span style={{ fontSize: 12, color: "#16a34a" }}>{toolMsg}</span>}
          </div>
        </div>
      </Section>

      {/* ── Notification Channels ─────────────────────── */}
      <Section title="通知頻道" subtitle={`${allChannels.length} 個頻道`}>
        <div style={{ display: "grid", gap: 10, marginBottom: 20 }}>
          {allChannels.map((ch) => (
            <ChannelRow key={ch.id} channel={ch} onRemove={!ch.builtin ? () => removeChannel(ch.id) : undefined} />
          ))}
        </div>

        <div
          style={{
            background: "#f8fafc",
            border: "1px dashed #cbd5e1",
            borderRadius: 10,
            padding: 16,
          }}
        >
          <h4 style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 12 }}>新增通知頻道</h4>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <Field label="頻道名稱 *">
              <input
                value={newChannel.name}
                onChange={(e) => setNewChannel((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Slack #backend-alerts"
                style={inputStyle}
              />
            </Field>
            <Field label="類型">
              <select
                value={newChannel.type}
                onChange={(e) => setNewChannel((p) => ({ ...p, type: e.target.value as NotifyChannel["type"] }))}
                style={inputStyle}
              >
                <option value="slack">💬 Slack</option>
                <option value="email">📧 Email</option>
                <option value="webhook">🔗 Webhook</option>
              </select>
            </Field>
          </div>
          <Field label="目標（Webhook URL / Email） *">
            <input
              value={newChannel.target}
              onChange={(e) => setNewChannel((p) => ({ ...p, target: e.target.value }))}
              placeholder="https://hooks.slack.com/services/... 或 someone@example.com"
              style={inputStyle}
            />
          </Field>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
            <button
              onClick={addChannel}
              disabled={!newChannel.name.trim() || !newChannel.target.trim()}
              style={{
                padding: "7px 18px",
                background: newChannel.name.trim() && newChannel.target.trim() ? "#0f172a" : "#e2e8f0",
                color: newChannel.name.trim() && newChannel.target.trim() ? "#fff" : "#94a3b8",
                border: "none",
                borderRadius: 7,
                fontSize: 13,
                fontWeight: 600,
                cursor: newChannel.name.trim() && newChannel.target.trim() ? "pointer" : "default",
              }}
            >
              新增頻道
            </button>
            {channelMsg && <span style={{ fontSize: 12, color: "#16a34a" }}>{channelMsg}</span>}
          </div>
        </div>
      </Section>

      <div
        style={{
          background: "#fffbeb",
          border: "1px solid #fde68a",
          borderRadius: 10,
          padding: "12px 16px",
          fontSize: 12,
          color: "#92400e",
          lineHeight: 1.6,
        }}
      >
        <strong>注意：</strong>自訂工具與頻道儲存於瀏覽器 localStorage，不寫入資料庫。<br />
        內建工具的實際行為由程式碼控制（<code>/ops/inbox/components/</code>），<br />
        通知 Webhook 需設定伺服器環境變數 <code>OPS_INBOX_SLACK_INCIDENTS_WEBHOOK</code>。
      </div>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 36 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", margin: 0 }}>{title}</h2>
        <span style={{ fontSize: 12, color: "#94a3b8" }}>{subtitle}</span>
      </div>
      {children}
    </section>
  );
}

function ToolRow({ tool, onRemove }: { tool: AiTool; onRemove?: () => void }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 9,
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        gap: 14,
      }}
    >
      <span style={{ fontSize: 18, width: 24, textAlign: "center" }}>{TYPE_ICON[tool.type]}</span>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>{tool.name}</span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              padding: "1px 6px",
              borderRadius: 4,
              background: "#f1f5f9",
              color: "#64748b",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            {TOOL_TYPE_LABEL[tool.type]}
          </span>
          {tool.builtin && (
            <span style={{ fontSize: 10, color: "#6366f1", background: "#eef2ff", padding: "1px 6px", borderRadius: 4, fontWeight: 600 }}>
              內建
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: "#64748b" }}>{tool.description}</div>
        {tool.url && (
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2, fontFamily: "ui-monospace, monospace" }}>{tool.url}</div>
        )}
        {tool.command && (
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2, fontFamily: "ui-monospace, monospace" }}>{tool.command}</div>
        )}
      </div>
      {onRemove && (
        <button
          onClick={onRemove}
          style={{
            padding: "4px 10px",
            background: "#fef2f2",
            color: "#dc2626",
            border: "1px solid #fecaca",
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          移除
        </button>
      )}
    </div>
  );
}

function ChannelRow({ channel, onRemove }: { channel: NotifyChannel; onRemove?: () => void }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 9,
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        gap: 14,
      }}
    >
      <span style={{ fontSize: 18, width: 24, textAlign: "center" }}>{CHANNEL_ICON[channel.type]}</span>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>{channel.name}</span>
          {channel.builtin && (
            <span style={{ fontSize: 10, color: "#6366f1", background: "#eef2ff", padding: "1px 6px", borderRadius: 4, fontWeight: 600 }}>
              內建
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "#94a3b8",
            fontFamily: "ui-monospace, monospace",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: 520,
          }}
        >
          {channel.target}
        </div>
      </div>
      {onRemove && (
        <button
          onClick={onRemove}
          style={{
            padding: "4px 10px",
            background: "#fef2f2",
            color: "#dc2626",
            border: "1px solid #fecaca",
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          移除
        </button>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 11, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  borderRadius: 6,
  border: "1px solid #d1d5db",
  fontSize: 12,
  color: "#0f172a",
  background: "#fff",
  outline: "none",
  boxSizing: "border-box",
};
