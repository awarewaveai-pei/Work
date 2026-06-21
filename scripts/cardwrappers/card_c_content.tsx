
          {/* ── 社群分發 ── */}
          <SectionToggle label="📤 社群分發 — 自動生成各平台貼文" open={showSyn} onToggle={() => setShowSyn(v => !v)}>
            {!hasContent ? (
              <div style={{ fontSize: "12px", color: "var(--text-muted)", padding: "8px 0", textAlign: "center" }}>⏳ 請先生成文章後才能使用</div>
            ) : (
              <>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "flex-start", marginBottom: "10px" }}>
                  {SYN_PLATFORMS.map(p => (
                    <div key={p.key} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <label style={checkLabel}>
                        <input type="checkbox" checked={!!synEnabled[p.key]}
                          onChange={e => setSynEnabled(prev => ({ ...prev, [p.key]: e.target.checked }))} />
                        {p.label}
                      </label>
                      {p.hasThread && synEnabled.twitter && (
                        <div style={{ paddingLeft: "18px", display: "flex", gap: "10px" }}>
                          {["single", "thread"].map(m => (
                            <label key={m} style={{ ...checkLabel, fontSize: "11px" }}>
                              <input type="radio" name="twitterMode" value={m}
                                checked={twitterMode === m} onChange={() => setTwitterMode(m as "single" | "thread")} />
                              {m === "single" ? "單則推文" : "Thread"}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  <button className="btn-primary" style={{ fontSize: "12px", padding: "5px 14px" }}
                    onClick={handleSyndicate}
                    disabled={synStatus === "generating" || !Object.values(synEnabled).some(Boolean)}>
                    {synStatus === "generating" ? "生成中…" : "生成社群貼文"}
                  </button>
                </div>
                {synStatus === "done" && Object.keys(synContent).length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {Object.entries(synContent).map(([key, content]) => {
                      const labelMap: Record<string, string> = {
                        twitter_single: "Twitter / X", twitter_thread: "Twitter Thread",
                        instagram: "Instagram", threads: "Threads",
                        linkedin: "LinkedIn", facebook: "Facebook",
                        tiktok: "TikTok", whatsapp: "WhatsApp",
                        pinterest: "Pinterest", reddit: "Reddit", email: "Email 電子報",
                      };
                      return (
                        <div key={key} style={{ border: "1px solid var(--card-border)", borderRadius: "6px", padding: "10px 12px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                            <span style={{ fontSize: "12px", fontWeight: 600 }}>{labelMap[key] ?? key}</span>
                            <button className="btn-secondary" style={{ fontSize: "11px", padding: "3px 10px" }}
                              onClick={() => {
                                void navigator.clipboard.writeText(content);
                                setSynCopied(prev => ({ ...prev, [key]: true }));
                                setTimeout(() => setSynCopied(prev => ({ ...prev, [key]: false })), 2000);
                              }}>
                              {synCopied[key] ? "✓ 已複製" : "複製"}
                            </button>
                          </div>
                          <textarea readOnly value={content}
                            style={{ width: "100%", minHeight: "80px", fontFamily: "inherit", fontSize: "12px",
                              lineHeight: 1.5, padding: "8px", border: "1px solid var(--card-border)", borderRadius: "4px",
                              background: "var(--bg-page, #f8f9fc)", resize: "vertical", boxSizing: "border-box" }} />
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </SectionToggle>

          {/* ── 電子報草稿（FluentCRM，只建草稿不寄出） ── */}
          {!hasContent ? (
            <div style={{ fontSize: "12px", color: "var(--text-muted)", padding: "8px 0 16px", textAlign: "center" }}>📧 電子報草稿 — 生成文章後才能使用</div>
          ) : (
            <div style={{ marginTop: "16px", paddingBottom: "8px" }}>
              <div style={{
                background: "linear-gradient(135deg, rgba(88,85,208,0.06), rgba(88,85,208,0.02))",
                border: "1px solid rgba(88,85,208,0.25)", borderRadius: "12px", padding: "16px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                  <span style={{ fontSize: "15px" }}>📧</span>
                  <span style={{ fontWeight: 600, fontSize: "13px", color: "var(--text-primary)" }}>電子報導讀（FluentCRM 草稿）</span>
                </div>
                <div style={{ fontSize: "11.5px", color: "var(--text-muted)", marginBottom: "12px", lineHeight: 1.5 }}>
                  寄出的是<strong>精簡導讀</strong>（首圖＋摘要＋「閱讀完整文章」按鈕），吸引讀者點進全文 — 不是整篇貼上。<br />
                  只建立草稿、<strong>不會寄出</strong>；收件人與寄送一律在 FluentCRM 人工確認。
                </div>
                <label className="form-label" style={{ marginBottom: "4px" }}>文章公開連結（CTA 按鈕用）</label>
                <input
                  className="form-input"
                  style={{ fontSize: "12px" }}
                  placeholder="https://soulfulexpression.org/your-article-slug（發布到 WordPress 並上線後貼上公開網址）"
                  value={nlArticleUrl}
                  onChange={e => setNlArticleUrl(e.target.value)}
                />
                <div className="form-hint" style={{ marginTop: "4px", marginBottom: "12px" }}>
                  留空也可推送，但導讀就<strong>沒有</strong>「閱讀完整文章」按鈕。建議先用上方「推送到 WordPress（草稿）」發布、文章上線後把公開網址貼這裡。
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                  <button className="btn-primary" style={{ fontSize: "12px", padding: "6px 16px" }}
                    onClick={handlePushNewsletter} disabled={nlStatus === "sending"}>
                    {nlStatus === "sending" ? "推送中…" : "📧 建立 FluentCRM 導讀草稿"}
                  </button>
                  {!nlArticleUrl.trim() && (
                    <span style={{ fontSize: "11px", color: "#f59e0b" }}>未填文章連結 — 導讀將不含按鈕</span>
                  )}
                </div>
                {nlStatus === "done" && (
                  <div style={{ marginTop: "10px", fontSize: "12px", color: "var(--text-primary)" }}>
                    ✓ 已建立 FluentCRM 草稿
                    {nlResult?.edit_url && (
                      <> — <a href={nlResult.edit_url} target="_blank" rel="noopener noreferrer" style={{ color: "#5855d0" }}>在 FluentCRM 開啟並寄送 ↗</a></>
                    )}
                  </div>
                )}
                {nlStatus === "error" && (
                  <div style={{ marginTop: "10px", fontSize: "12px", color: "#c0392b" }}>
                    {nlResult?.error ?? "推送失敗"}
                  </div>
                )}
              </div>
            </div>
          )}
