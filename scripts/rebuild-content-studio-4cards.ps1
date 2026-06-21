# rebuild-content-studio-4cards.ps1
# Rebuilds ContentStudio.tsx form area with 4 visual cards (A/B/C/D)
# Card A: 文章/内容 | Card B: 品牌 | Card C: 分发 | Card D: 发布

$file = "D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\app\tools\content\ContentStudio.tsx"
$outFile = $file

$lines = [System.IO.File]::ReadAllLines($file)
Write-Host "Total lines: $($lines.Length)"

# ── 0-indexed section boundaries ──────────────────────────────────────────────────────────────
# Each section: start = first content line (no leading blank), end = last content line
$iBefore_end   = 2228   # [0..2228] everything before the form sections (inclusive)

$iStruct   = @(2229, 2356)   # Structure
$iOutline  = @(2358, 2373)   # 大綱編輯器
$iMkt      = @(2375, 2467)   # 品牌語調/精準行銷
$iBv       = @(2469, 2541)   # 品牌聲音
$iAdv      = @(2543, 2549)   # 品牌語調/進階指示
$iRefUrl   = @(2551, 2561)   # 参考URL
$iMarket   = @(2563, 2594)   # 競業
$iExtLink  = @(2596, 2605)   # 外部連結
$iSeo      = @(2607, 2651)   # SEO/NLP
$iCatTag   = @(2653, 2712)   # 分類/標籤
$iIntLink  = @(2714, 2724)   # 內部連結
$iMedia    = @(2726, 3061)   # Media Hub
$iKadence  = @(3063, 3148)   # Kadence
$iPublish  = @(3150, 3172)   # 発布設定
$iGenBtn   = @(3174, 3187)   # 産生按鈕
$iOutput   = @(3189, 3479)   # Output area (before social)
$iOutClose = @(3609, 3610)   # </div> + )} output closers
$iRest     = 3611            # </>  )} and rest of file

# ── Helpers ─────────────────────────────────────────────────────────────────────────────────
$nl = @('')  # single blank line

function Sec([int[]]$range) { return $lines[$range[0]..$range[1]] }

# ── Card wrapper strings ──────────────────────────────────────────────────────────────────────
$cA_open = @(
  '',
  '          {/* ═══════════════════════════════════════════════════════════════════════════════════ */}',
  '          {/* ═══════════════ A：文章 / 內容設定 ══════════════════════════════════════════════ */}',
  '          <div style={{ border: "1px solid rgba(59,130,246,0.3)", borderRadius: "12px", marginBottom: "20px", overflow: "hidden" }}>',
  '            <div style={{ background: "linear-gradient(135deg,rgba(59,130,246,0.08),rgba(59,130,246,0.02))", borderBottom: "1px solid rgba(59,130,246,0.2)", padding: "10px 16px", display: "flex", alignItems: "center", gap: "8px" }}>',
  '              <span style={{ fontSize: "15px" }}>📝</span>',
  '              <span style={{ fontWeight: 700, fontSize: "13px", color: "#1d4ed8" }}>文章 / 內容設定</span>',
  '            </div>',
  '            <div style={{ padding: "0 16px" }}>'
)
$cA_close = @('            </div>', '          </div>')

$cB_open = @(
  '',
  '          {/* ═══════════════════════════════════════════════════════════════════════════════════ */}',
  '          {/* ═══════════════ B：品牌資料 ══════════════════════════════════════════════════════ */}',
  '          <div style={{ border: "1px solid rgba(139,92,246,0.3)", borderRadius: "12px", marginBottom: "20px", overflow: "hidden" }}>',
  '            <div style={{ background: "linear-gradient(135deg,rgba(139,92,246,0.08),rgba(139,92,246,0.02))", borderBottom: "1px solid rgba(139,92,246,0.2)", padding: "10px 16px", display: "flex", alignItems: "center", gap: "8px" }}>',
  '              <span style={{ fontSize: "15px" }}>🎯</span>',
  '              <span style={{ fontWeight: 700, fontSize: "13px", color: "#6d28d9" }}>品牌資料</span>',
  '              <span style={{ fontSize: "11px", color: "var(--text-muted)", marginLeft: 4 }}>— 自動帶入 app.aware-wave.com/ops/clients 客戶資料</span>',
  '            </div>',
  '            <div style={{ padding: "0 16px" }}>'
)
$cB_close = @('            </div>', '          </div>')

$cC_open = @(
  '',
  '          {/* ═══════════════════════════════════════════════════════════════════════════════════ */}',
  '          {/* ═══════════════ C：分發設定 ═══════════════════════════════════════════════════════ */}',
  '          <div style={{ border: "1px solid rgba(34,197,94,0.3)", borderRadius: "12px", marginBottom: "20px", overflow: "hidden" }}>',
  '            <div style={{ background: "linear-gradient(135deg,rgba(34,197,94,0.08),rgba(34,197,94,0.02))", borderBottom: "1px solid rgba(34,197,94,0.2)", padding: "10px 16px", display: "flex", alignItems: "center", gap: "8px" }}>',
  '              <span style={{ fontSize: "15px" }}>📢</span>',
  '              <span style={{ fontWeight: 700, fontSize: "13px", color: "#15803d" }}>分發設定</span>',
  '              <span style={{ fontSize: "11px", color: "var(--text-muted)", marginLeft: 4 }}>— 生成文章後才能使用</span>',
  '            </div>',
  '            <div style={{ padding: "0 16px" }}>'
)
$cC_close = @('            </div>', '          </div>')

$cD_open = @(
  '',
  '          {/* ═══════════════════════════════════════════════════════════════════════════════════ */}',
  '          {/* ═══════════════ D：發布 ══════════════════════════════════════════════════════════ */}',
  '          <div style={{ border: "1px solid rgba(249,115,22,0.3)", borderRadius: "12px", marginBottom: "20px", overflow: "hidden" }}>',
  '            <div style={{ background: "linear-gradient(135deg,rgba(249,115,22,0.08),rgba(249,115,22,0.02))", borderBottom: "1px solid rgba(249,115,22,0.2)", padding: "10px 16px", display: "flex", alignItems: "center", gap: "8px" }}>',
  '              <span style={{ fontSize: "15px" }}>🚀</span>',
  '              <span style={{ fontWeight: 700, fontSize: "13px", color: "#c2410c" }}>發布</span>',
  '            </div>',
  '            <div style={{ padding: "0 16px" }}>'
)
$cD_close = @('            </div>', '          </div>')

# ── Card C content: Social as SectionToggle + Newsletter ─────────────────────────────────────
$cardC_social = @(
  '',
  '          {/* ── 社群分發 ── */}',
  '          <SectionToggle label="📤 社群分發 — 自動生成各平台貼文" open={showSyn} onToggle={() => setShowSyn(v => !v)}>',
  '            {!hasContent ? (',
  '              <div style={{ fontSize: "12px", color: "var(--text-muted)", padding: "8px 0", textAlign: "center" }}>⏳ 請先生成文章後才能使用</div>',
  '            ) : (',
  '              <>',
  '                <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "flex-start", marginBottom: "10px" }}>',
  '                  {SYN_PLATFORMS.map(p => (',
  '                    <div key={p.key} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>',
  '                      <label style={checkLabel}>',
  '                        <input type="checkbox" checked={!!synEnabled[p.key]}',
  '                          onChange={e => setSynEnabled(prev => ({ ...prev, [p.key]: e.target.checked }))} />',
  '                        {p.label}',
  '                      </label>',
  '                      {p.hasThread && synEnabled.twitter && (',
  '                        <div style={{ paddingLeft: "18px", display: "flex", gap: "10px" }}>',
  '                          {["single", "thread"].map(m => (',
  '                            <label key={m} style={{ ...checkLabel, fontSize: "11px" }}>',
  '                              <input type="radio" name="twitterMode" value={m}',
  '                                checked={twitterMode === m} onChange={() => setTwitterMode(m as "single" | "thread")} />',
  '                              {m === "single" ? "單則推文" : "Thread"}',
  '                            </label>',
  '                          ))}',
  '                        </div>',
  '                      )}',
  '                    </div>',
  '                  ))}',
  '                  <button className="btn-primary" style={{ fontSize: "12px", padding: "5px 14px" }}',
  '                    onClick={handleSyndicate}',
  '                    disabled={synStatus === "generating" || !Object.values(synEnabled).some(Boolean)}>',
  '                    {synStatus === "generating" ? "生成中…" : "生成社群貼文"}',
  '                  </button>',
  '                </div>',
  '                {synStatus === "done" && Object.keys(synContent).length > 0 && (',
  '                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>',
  '                    {Object.entries(synContent).map(([key, content]) => {',
  '                      const labelMap: Record<string, string> = {',
  '                        twitter_single: "Twitter / X", twitter_thread: "Twitter Thread",',
  '                        instagram: "Instagram", threads: "Threads",',
  '                        linkedin: "LinkedIn", facebook: "Facebook",',
  '                        tiktok: "TikTok", whatsapp: "WhatsApp",',
  '                        pinterest: "Pinterest", reddit: "Reddit", email: "Email 電子報",',
  '                      };',
  '                      return (',
  '                        <div key={key} style={{ border: "1px solid var(--card-border)", borderRadius: "6px", padding: "10px 12px" }}>',
  '                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>',
  '                            <span style={{ fontSize: "12px", fontWeight: 600 }}>{labelMap[key] ?? key}</span>',
  '                            <button className="btn-secondary" style={{ fontSize: "11px", padding: "3px 10px" }}',
  '                              onClick={() => {',
  '                                void navigator.clipboard.writeText(content);',
  '                                setSynCopied(prev => ({ ...prev, [key]: true }));',
  '                                setTimeout(() => setSynCopied(prev => ({ ...prev, [key]: false })), 2000);',
  '                              }}>',
  '                              {synCopied[key] ? "✓ 已複製" : "複製"}',
  '                            </button>',
  '                          </div>',
  '                          <textarea readOnly value={content}',
  '                            style={{ width: "100%", minHeight: "80px", fontFamily: "inherit", fontSize: "12px",',
  '                              lineHeight: 1.5, padding: "8px", border: "1px solid var(--card-border)", borderRadius: "4px",',
  '                              background: "var(--bg-page, #f8f9fc)", resize: "vertical", boxSizing: "border-box" }} />',
  '                        </div>',
  '                      );',
  '                    })}',
  '                  </div>',
  '                )}',
  '              </>',
  '            )}',
  '          </SectionToggle>'
)

$cardC_newsletter = @(
  '',
  '          {/* ── 電子報草稿（FluentCRM，只建草稿不寄出） ── */}',
  '          {!hasContent ? (',
  '            <div style={{ fontSize: "12px", color: "var(--text-muted)", padding: "8px 0 16px", textAlign: "center" }}>📧 電子報草稿 — 生成文章後才能使用</div>',
  '          ) : (',
  '            <div style={{ marginTop: "16px", paddingBottom: "8px" }}>',
  '              <div style={{',
  '                background: "linear-gradient(135deg, rgba(88,85,208,0.06), rgba(88,85,208,0.02))",',
  '                border: "1px solid rgba(88,85,208,0.25)", borderRadius: "12px", padding: "16px",',
  '              }}>',
  '                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>',
  '                  <span style={{ fontSize: "15px" }}>📧</span>',
  '                  <span style={{ fontWeight: 600, fontSize: "13px", color: "var(--text-primary)" }}>電子報導讀（FluentCRM 草稿）</span>',
  '                </div>',
  '                <div style={{ fontSize: "11.5px", color: "var(--text-muted)", marginBottom: "12px", lineHeight: 1.5 }}>',
  '                  寄出的是<strong>精簡導讀</strong>（首圖＋摘要＋「閱讀完整文章」按鈕），吸引讀者點進全文 — 不是整篇貼上。<br />',
  '                  只建立草稿、<strong>不會寄出</strong>；收件人與寄送一律在 FluentCRM 人工確認。',
  '                </div>',
  '                <label className="form-label" style={{ marginBottom: "4px" }}>文章公開連結（CTA 按鈕用）</label>',
  '                <input',
  '                  className="form-input"',
  '                  style={{ fontSize: "12px" }}',
  '                  placeholder="https://soulfulexpression.org/your-article-slug（發布到 WordPress 並上線後貼上公開網址）"',
  '                  value={nlArticleUrl}',
  '                  onChange={e => setNlArticleUrl(e.target.value)}',
  '                />',
  '                <div className="form-hint" style={{ marginTop: "4px", marginBottom: "12px" }}>',
  '                  留空也可推送，但導讀就<strong>沒有</strong>「閱讀完整文章」按鈕。建議先用上方「推送到 WordPress（草稿）」發布、文章上線後把公開網址貼這裡。',
  '                </div>',
  '                <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>',
  '                  <button className="btn-primary" style={{ fontSize: "12px", padding: "6px 16px" }}',
  '                    onClick={handlePushNewsletter} disabled={nlStatus === "sending"}>',
  '                    {nlStatus === "sending" ? "推送中…" : "📧 建立 FluentCRM 導讀草稿"}',
  '                  </button>',
  '                  {!nlArticleUrl.trim() && (',
  '                    <span style={{ fontSize: "11px", color: "#f59e0b" }}>未填文章連結 — 導讀將不含按鈕</span>',
  '                  )}',
  '                </div>',
  '                {nlStatus === "done" && (',
  '                  <div style={{ marginTop: "10px", fontSize: "12px", color: "var(--text-primary)" }}>',
  '                    ✓ 已建立 FluentCRM 草稿',
  '                    {nlResult?.edit_url && (',
  '                      <> — <a href={nlResult.edit_url} target="_blank" rel="noopener noreferrer" style={{ color: "#5855d0" }}>在 FluentCRM 開啟並寄送 ↗</a></>',
  '                    )}',
  '                  </div>',
  '                )}',
  '                {nlStatus === "error" && (',
  '                  <div style={{ marginTop: "10px", fontSize: "12px", color: "#c0392b" }}>',
  '                    ⚠ {nlResult?.error ?? "推送失敗"}',
  '                  </div>',
  '                )}',
  '              </div>',
  '            </div>',
  '          )}'
)

# ── Build result ──────────────────────────────────────────────────────────────────────────────
$result = [System.Collections.Generic.List[string]]::new()

# Part 1: everything before form sections
$result.AddRange([string[]]$lines[0..$iBefore_end])

# Part 2: Card A — 文章/內容設定
$result.AddRange([string[]]$cA_open)
$result.AddRange([string[]]( Sec $iStruct ))
$result.Add('')
$result.AddRange([string[]]( Sec $iOutline ))
$result.Add('')
$result.AddRange([string[]]( Sec $iSeo ))
$result.Add('')
$result.AddRange([string[]]( Sec $iCatTag ))
$result.Add('')
$result.AddRange([string[]]( Sec $iIntLink ))
$result.Add('')
$result.AddRange([string[]]( Sec $iRefUrl ))
$result.Add('')
$result.AddRange([string[]]( Sec $iExtLink ))
$result.Add('')
$result.AddRange([string[]]( Sec $iMedia ))
$result.Add('')
$result.AddRange([string[]]( Sec $iKadence ))
$result.AddRange([string[]]$cA_close)

# Part 3: Card B — 品牌資料
$result.AddRange([string[]]$cB_open)
$result.AddRange([string[]]( Sec $iBv ))
$result.Add('')
$result.AddRange([string[]]( Sec $iMarket ))
$result.Add('')
$result.AddRange([string[]]( Sec $iMkt ))
$result.Add('')
$result.AddRange([string[]]( Sec $iAdv ))
$result.AddRange([string[]]$cB_close)

# Part 4: Card C — 分發設定 (social + newsletter)
$result.AddRange([string[]]$cC_open)
$result.AddRange([string[]]$cardC_social)
$result.AddRange([string[]]$cardC_newsletter)
$result.AddRange([string[]]$cC_close)

# Part 5: Card D — 發布
$result.AddRange([string[]]$cD_open)
$result.Add('')
$result.AddRange([string[]]( Sec $iPublish ))
$result.AddRange([string[]]$cD_close)

# Part 6: 産生按鈕 (unchanged)
$result.Add('')
$result.AddRange([string[]]( Sec $iGenBtn ))

# Part 7: Output area (without social/newsletter — they're now in Card C)
$result.Add('')
$result.AddRange([string[]]$lines[$iOutput[0]..$iOutput[1]])
# output close tags
$result.AddRange([string[]]$lines[$iOutClose[0]..$iOutClose[1]])

# Part 8: Rest of file (</>, )}, humanize tab, etc.)
$result.AddRange([string[]]$lines[$iRest..($lines.Length - 1)])

# ── Write output ─────────────────────────────────────────────────────────────────────────────
$enc = [System.Text.UTF8Encoding]::new($false)  # UTF-8 no BOM
[System.IO.File]::WriteAllLines($outFile, $result.ToArray(), $enc)
Write-Host "Written: $($result.Count) lines to $outFile"
