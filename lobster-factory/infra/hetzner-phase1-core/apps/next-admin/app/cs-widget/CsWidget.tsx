"use client";

// 清新自然 headless customer chat widget (_uiux_design.md §5). Transport-driven (Mock or Chatwoot).
// Pure presentation + local optimistic state; all backend lives behind WidgetTransport.

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { deriveTheme, DEFAULT_SEED } from "@/lib/cs-widget/theme";
import type {
  Card, InputSelectItem, WidgetConfig, WidgetMessage, WidgetTransport,
} from "@/lib/cs-widget/types";

let localSeq = 0;
const localId = () => `local-${++localSeq}`;

export function CsWidget({ transport, config }: { transport: WidgetTransport; config: WidgetConfig }) {
  const [open, setOpen] = useState(true);
  const [messages, setMessages] = useState<WidgetMessage[]>([]);
  const [typing, setTyping] = useState(false);
  const [humanOwns, setHumanOwns] = useState(false);
  const [input, setInput] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);

  const theme = deriveTheme(config.brandSeed ?? DEFAULT_SEED, config.mode ?? "light") as CSSProperties;

  useEffect(() => {
    let alive = true;
    transport.connect((e) => {
      if (!alive) return;
      if (e.type === "message") setMessages((m) => [...m, e.message]);
      else if (e.type === "typing") setTyping(e.on);
      else if (e.type === "status") setHumanOwns(e.status === "open");
    });
    return () => { alive = false; transport.disconnect(); };
  }, [transport]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing]);

  function pushUser(text: string) {
    setMessages((m) => [...m, { id: localId(), sender: "user", text, contentType: "text", createdAt: Date.now() }]);
  }
  function send() {
    const t = input.trim();
    if (!t) return;
    setInput("");
    pushUser(t);
    void transport.sendText(t);
  }
  function postback(value: string, label: string) {
    pushUser(label);
    void transport.sendPostback(value, label);
  }

  return (
    <div style={{ ...theme, fontFamily: "'Noto Sans TC', system-ui, sans-serif", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 14 }}>
      <style>{`
        @keyframes csw-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
        @keyframes csw-bob{0%,60%,100%{transform:translateY(0);opacity:.5}30%{transform:translateY(-5px);opacity:1}}
        .csw-msg{animation:csw-rise .26s cubic-bezier(0,0,.2,1) both}
        .csw-dot{width:7px;height:7px;border-radius:50%;background:var(--sage-400);display:inline-block;animation:csw-bob 1s infinite}
        .csw-dot:nth-child(2){animation-delay:.12s}.csw-dot:nth-child(3){animation-delay:.24s}
        .csw-chip{cursor:pointer;transition:all .18s}.csw-chip:hover{background:var(--primary);color:var(--on-primary);border-color:var(--primary)}
        .csw-send:active{transform:scale(.92)}
      `}</style>

      {open && (
        <div style={{ width: 384, background: "var(--bg)", borderRadius: 20, overflow: "hidden", border: "1px solid var(--border)", boxShadow: "0 12px 32px rgba(44,41,38,.14)" }}>
          {/* header */}
          <div style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 11, background: "var(--overlay)", borderBottom: "1px solid var(--border)" }}>
            <div style={{ width: 38, height: 38, borderRadius: "50%", background: "var(--primary)", color: "var(--on-primary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🌿</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, fontSize: 15, color: "var(--ink)" }}>{config.personaName ?? "客服小幫手"}</div>
              <div style={{ fontSize: 12, color: "var(--primary)", display: "flex", alignItems: "center", gap: 5, marginTop: 1 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: humanOwns ? "var(--sage-400)" : "var(--primary)", display: "inline-block" }} />
                {humanOwns ? "真人專員服務中" : "線上 · 通常幾秒內回覆"}
              </div>
            </div>
            <span onClick={() => setOpen(false)} style={{ cursor: "pointer", color: "var(--muted)", fontSize: 20, lineHeight: 1 }}>×</span>
          </div>

          {/* body */}
          <div ref={bodyRef} style={{ height: 400, overflowY: "auto", padding: "18px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
            {messages.map((m) => <MessageView key={m.id} m={m} onPostback={postback} />)}
            {typing && (
              <div className="csw-msg" style={{ alignSelf: "flex-start", background: "var(--overlay)", padding: "12px 14px", borderRadius: "4px 16px 16px 16px", display: "flex", gap: 5 }}>
                <span className="csw-dot" /><span className="csw-dot" /><span className="csw-dot" />
              </div>
            )}
          </div>

          {/* input */}
          <div style={{ padding: "12px 14px", background: "var(--surface)", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 9 }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") send(); }}
              placeholder="輸入訊息…"
              style={{ flex: 1, height: 40, border: "1px solid var(--border)", borderRadius: 9999, padding: "0 16px", fontSize: 14, color: "var(--ink)", background: "var(--bg)", outline: "none", fontFamily: "inherit" }}
            />
            <button className="csw-send" onClick={send} aria-label="送出" style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--primary)", color: "var(--on-primary)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, cursor: "pointer", flexShrink: 0, transition: "transform .15s" }}>➤</button>
          </div>
        </div>
      )}

      {/* launcher */}
      <div onClick={() => setOpen((o) => !o)} style={{ width: 58, height: 58, borderRadius: "50%", background: "var(--primary)", color: "var(--on-primary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, cursor: "pointer", boxShadow: "0 12px 32px rgba(84,124,101,.30)" }}>
        {open ? "×" : "💬"}
      </div>
    </div>
  );
}

function MessageView({ m, onPostback }: { m: WidgetMessage; onPostback: (v: string, l: string) => void }) {
  if (m.sender === "user") {
    return (
      <div className="csw-msg" style={{ alignSelf: "flex-end", maxWidth: "82%" }}>
        <div style={{ background: "var(--primary)", color: "var(--on-primary)", padding: "10px 13px", borderRadius: "16px 16px 4px 16px", fontSize: 14.5, lineHeight: 1.6 }}>{m.text}</div>
      </div>
    );
  }

  const bubble = (children: React.ReactNode) => (
    <div className="csw-msg" style={{ alignSelf: "flex-start", maxWidth: "84%" }}>
      <div style={{ background: "var(--overlay)", color: "var(--ink)", padding: "10px 13px", borderRadius: "4px 16px 16px 16px", fontSize: 14.5, lineHeight: 1.6 }}>{children}</div>
      {m.isAiReply && <div style={{ fontSize: 11, color: "var(--muted)", margin: "4px 0 0 4px" }}>✦ AI 即時回覆 · 已比對知識庫</div>}
    </div>
  );

  if (m.contentType === "input_select" && Array.isArray(m.content)) {
    const items = m.content as InputSelectItem[];
    return (
      <div className="csw-msg" style={{ alignSelf: "flex-start", display: "flex", flexWrap: "wrap", gap: 7, maxWidth: "90%" }}>
        {items.map((it) => (
          <button key={it.value} className="csw-chip" onClick={() => onPostback(it.value, it.title)}
            style={{ border: "1px solid var(--sage-200)", color: "var(--primary)", background: "var(--bg)", padding: "7px 13px", borderRadius: 9999, fontSize: 13, fontFamily: "inherit" }}>
            {it.title}
          </button>
        ))}
      </div>
    );
  }

  if (m.contentType === "cards" && Array.isArray(m.content)) {
    const cards = m.content as Card[];
    return (
      <div className="csw-msg" style={{ alignSelf: "flex-start", maxWidth: "84%" }}>
        {m.text && <div style={{ background: "var(--overlay)", color: "var(--ink)", padding: "10px 13px", borderRadius: "4px 16px 16px 16px", fontSize: 14.5, marginBottom: 6 }}>{m.text}</div>}
        {cards.map((c, i) => (
          <div key={i} style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", width: 240, marginTop: 4 }}>
            <div style={{ padding: "11px 13px" }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>{c.title}</div>
              {c.description && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{c.description}</div>}
              {c.actions.map((a, j) => (
                <div key={j} onClick={() => { if (a.type === "postback" && a.payload) onPostback(a.payload, a.text); else if (a.uri) window.open(a.uri, "_blank", "noopener"); }}
                  style={{ marginTop: 9, background: "var(--primary)", color: "var(--on-primary)", textAlign: "center", padding: 7, borderRadius: 9, fontSize: 13, cursor: "pointer" }}>
                  {a.text}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return bubble(m.text);
}
