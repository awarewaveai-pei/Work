import { CAUTIONS, FAQ, INTRO, LIMITS, PRIVACY, SECTIONS } from "./content";

export const metadata = { title: "Guide 操作手冊 · Cold Outreach" };

const link = { color: "var(--text-primary)", textDecoration: "none", display: "block", padding: "6px 0", fontSize: 13 } as const;
const muted = { color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.7 } as const;
const tag = { display: "inline-flex", marginRight: 8 } as const;

export default function OutreachGuidePage() {
  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Guide 操作手冊</span>
        <span className="topbar-env">從設定到寄出，一步一步做</span>
      </div>
      <div className="page" style={{ display: "grid", gridTemplateColumns: "220px minmax(0, 760px)", gap: 32, alignItems: "start" }}>
        <nav className="card" aria-label="目錄" style={{ position: "sticky", top: 80 }}>
          <div className="card-header"><span className="card-label">目錄</span></div>
          {SECTIONS.map((s, i) => (
            <a key={s.id} href={`#${s.id}`} style={link}>{i}. {s.title}</a>
          ))}
          <a href="#cautions" style={link}>注意事項</a>
          <a href="#limits" style={link}>還沒做好的功能</a>
          <a href="#faq" style={link}>常見問題</a>
          <a href="#privacy" style={link}>個資提醒</a>
        </nav>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <p style={{ ...muted, margin: 0 }}>{INTRO}</p>
          {SECTIONS.map((s, i) => (
            <section key={s.id} id={s.id} style={{ scrollMarginTop: 80 }}>
              <div className="section-title">{i}. {s.title}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {s.steps.map((st, j) => (
                  <div key={j} className="card">
                    <div style={{ color: "var(--text-primary)", fontWeight: 600, marginBottom: 8 }}>{i}.{j + 1}　{st.do}</div>
                    <div style={muted}><span className="card-badge badge-gray" style={tag}>在哪裡</span>{st.where}</div>
                    <div style={muted}><span className="card-badge badge-green" style={tag}>例</span>{st.example}</div>
                  </div>
                ))}
              </div>
            </section>
          ))}
          {[{ id: "cautions", title: "注意事項", items: CAUTIONS, badge: "badge-yellow" }, { id: "limits", title: "還沒做好的功能", items: LIMITS, badge: "badge-gray" }].map((g) => (
            <section key={g.id} id={g.id} style={{ scrollMarginTop: 80 }}>
              <div className="section-title">{g.title}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {g.items.map((it) => (
                  <div key={it.t} className="card">
                    <div style={{ color: "var(--text-primary)", fontWeight: 600, marginBottom: 8 }}>
                      <span className={`card-badge ${g.badge}`} style={tag}>{g.title === "注意事項" ? "注意" : "未完成"}</span>{it.t}
                    </div>
                    <p style={{ ...muted, margin: 0 }}>{it.d}</p>
                  </div>
                ))}
              </div>
            </section>
          ))}
          <section id="faq" style={{ scrollMarginTop: 80 }}>
            <div className="section-title">常見問題</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {FAQ.map((f) => (
                <details key={f.q} className="card">
                  <summary style={{ color: "var(--text-primary)", fontWeight: 600, cursor: "pointer" }}>{f.q}</summary>
                  <p style={{ ...muted, margin: "10px 0 0" }}>{f.a}</p>
                </details>
              ))}
            </div>
          </section>
          <section id="privacy" style={{ scrollMarginTop: 80 }}>
            <div className="section-title">個資提醒</div>
            <div className="card"><p style={{ ...muted, margin: 0 }}>{PRIVACY}</p></div>
          </section>
        </div>
      </div>
    </>
  );
}
