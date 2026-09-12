"use client";

// The collection panel: the catalogue on the left, this client's sources on the right, and a run
// button that reports what actually happened.
//
// Two decisions carried through from the code beneath it, because a screen that hides them undoes
// them: an unavailable source is SHOWN with the reason (hiding it reads as "the system cannot do
// this"), and a run's refusals are shown next to its successes (a crawl that stored nothing while
// refusing forty pages must not look like a quiet day).

import { useCallback, useEffect, useState } from "react";

interface CatalogueEntry {
  id: string;
  title: string;
  icon?: string;
  kind: string;
  summary: string;
  entry: "url" | "query" | "path";
  requires?: string[];
  metered?: boolean;
  available: boolean;
  missing: string[];
  options?: Array<{
    key: string;
    label: string;
    type: "string" | "number" | "boolean" | "select";
    required?: boolean;
    default?: string | number | boolean;
    choices?: Array<{ value: string; label: string }>;
    help?: string;
  }>;
}

interface Source {
  id: string;
  blockId: string;
  entry: string;
  options: Record<string, unknown>;
  status: "candidate" | "approved" | "disabled";
  label: string | null;
  proposedBy: string | null;
  approvedBy: string | null;
  lastRunAt: string | null;
  lastStatus: string | null;
}

interface Schedule {
  organizationId: string;
  enabled: boolean;
  frequency: "daily" | "weekly";
  hourUtc: number;
  dayOfWeekUtc: number;
  lastRunAt: string | null;
  lastRunKey: string | null;
  updatedBy: string | null;
}

const DAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

interface RunResult {
  runKey: string;
  sources: number;
  dryRun: boolean;
  report: {
    fetched: number;
    dirty: Array<{ uri: string; reason: string }>;
    quarantined: Array<{ uri: string; reason: string }>;
    disallowed: Array<{ uri: string; reason: string }>;
    gone: string[];
    stoppedBy: string | null;
  };
  sink: { written: number; skipped: number; errors?: string[] };
  incidentRaised: boolean;
  errors: string[];
}

const ENTRY_PLACEHOLDER: Record<string, string> = {
  url: "https://example.com/faq",
  query: "退貨政策 OR 消費者保護法",
  path: "D:\\Work\\transcripts",
};

const ENTRY_LABEL: Record<string, string> = {
  url: "網址",
  query: "查詢字串",
  path: "資料夾或檔案路徑",
};

export function CollectionSourcesPanel({ slug }: { slug: string }) {
  const [catalogue, setCatalogue] = useState<CatalogueEntry[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [entry, setEntry] = useState("");
  // Keyed by block id: two selected types can both have an `itemsPath`, and one flat bag would let
  // one type's value silently become the other's.
  const [options, setOptions] = useState<Record<string, Record<string, unknown>>>({});
  // Empty means every approved source, which is what the button says. A non-empty selection is the
  // operator narrowing the run deliberately.
  const [runOnly, setRunOnly] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [run, setRun] = useState<RunResult | null>(null);

  // No role header: the console's middleware injects the caller's real role from their session, and
  // a header set here would be a claim the browser makes about itself — ignored by design.
  const headers = { "Content-Type": "application/json" };
  const chosenList = catalogue.filter((c) => pickedIds.includes(c.id));
  // The entry field is one box for one address; when the ticked types disagree about what an entry
  // is (a URL vs a search query), say so rather than labelling it with whichever came first.
  const entryKinds = [...new Set(chosenList.map((c) => c.entry))];
  const entryKind = entryKinds.length === 1 ? entryKinds[0] : "url";

  const load = useCallback(async () => {
    const res = await fetch(`/api/ops/clients/${slug}/collection-sources`, { headers });
    const data = (await res.json()) as { ok?: boolean; catalogue?: CatalogueEntry[]; sources?: Source[] };
    if (data.ok) {
      setCatalogue(data.catalogue ?? []);
      setSources(data.sources ?? []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addSource() {
    if (chosenList.length === 0 || !entry.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      // One request per type, not one request with a list: each type validates its own entry and
      // options, and a sitemap URL that is not a valid feed URL must fail for the feed alone. A
      // batch endpoint would have to invent a rule for partial success; this way there isn't one.
      const results = await Promise.all(
        chosenList.map(async (c) => {
          const res = await fetch(`/api/ops/clients/${slug}/collection-sources`, {
            method: "POST",
            headers,
            body: JSON.stringify({ blockId: c.id, entry: entry.trim(), options: options[c.id] ?? {} }),
          });
          const data = (await res.json()) as { ok?: boolean; errors?: string[] };
          return { title: c.title, ok: Boolean(data.ok), errors: data.errors ?? ["failed"] };
        }),
      );

      const ok = results.filter((r) => r.ok);
      const bad = results.filter((r) => !r.ok);
      // Both halves reported. "3 added" while one type silently failed is how a source goes missing
      // for a month; the validation errors stay verbatim ("missing_option:itemsPath" names the field).
      setMessage(
        [
          ok.length ? `✓ 已加入 ${ok.length} 個：${ok.map((r) => r.title).join("、")}` : "",
          ...bad.map((r) => `⚠ ${r.title}：${r.errors.join("、")}`),
        ]
          .filter(Boolean)
          .join("\n"),
      );
      if (ok.length) {
        setEntry("");
        setOptions({});
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: string, action: "approve" | "disable") {
    setBusy(true);
    try {
      await fetch(`/api/ops/clients/${slug}/collection-sources`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ id, action }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function collect(dryRun: boolean) {
    setBusy(true);
    setMessage(null);
    setRun(null);
    try {
      const res = await fetch(`/api/ops/clients/${slug}/collection-sources`, {
        method: "POST",
        headers,
        body: JSON.stringify({ action: "run", dryRun, sourceIds: runOnly.length ? runOnly : undefined }),
      });
      const data = (await res.json()) as { ok?: boolean; result?: RunResult; errors?: string[] };
      if (data.ok && data.result) {
        setRun(data.result);
        await load();
      } else {
        setMessage(`⚠ ${(data.errors ?? ["run_failed"]).join("、")}`);
      }
    } finally {
      setBusy(false);
    }
  }

  const approved = sources.filter((s) => s.status === "approved");
  const candidates = sources.filter((s) => s.status === "candidate");
  const disabled = sources.filter((s) => s.status === "disabled");

  return (
    // Catalogue left; what you act on right. The form sits UNDER the source list rather than
    // under the catalogue, so ticking a source, filling it in, and pressing 正式抓取 are all on
    // screen together — the catalogue is tall enough to have pushed the run buttons out of view.
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 24, alignItems: "start" }}>
      {/* data-panel: the tests address these by what they ARE, not by their position. The previous
          selectors were section:first-of-type / :last-of-type, which went red the moment the
          operator asked for a different arrangement — a layout change should not fail a behaviour test. */}
      <section data-panel="catalogue">
        <h2 style={{ fontSize: 15, margin: "0 0 10px" }}>加入來源</h2>
          {/* Every source visible at once, ticked independently. A dropdown showed one line at a
              time, so "what can this thing actually read" needed eight interactions to answer. */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 8 }}>
            {catalogue.map((c) => {
              const on = pickedIds.includes(c.id);
              return (
                <label
                  key={c.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto minmax(0, 1fr)",
                    gap: 8,
                    alignItems: "start",
                    border: `1px solid ${on ? "#111827" : "#e5e7eb"}`,
                    borderRadius: 8,
                    padding: "8px 10px",
                    cursor: "pointer",
                    background: on ? "#f9fafb" : "#fff",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) => {
                      setPickedIds((ids) => (e.target.checked ? [...ids, c.id] : ids.filter((i) => i !== c.id)));
                      // Options belong to the type; unticking it must not leave its values behind to
                      // be posted the next time it is ticked.
                      if (!e.target.checked) setOptions((o) => ({ ...o, [c.id]: {} }));
                    }}
                    style={{ marginTop: 2 }}
                  />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: on ? 600 : 400 }}>
                      {c.icon} {c.title}
                    </span>
                    <span style={{ display: "block", fontSize: 11, color: "#6b7280", lineHeight: 1.5 }}>{c.summary}</span>
                    {c.metered ? <span style={{ display: "block", fontSize: 11, color: "#b45309" }}>按次計費</span> : null}
                    {!c.available ? (
                      // Shown, never hidden: the difference between "we cannot do this" and "one
                      // environment variable is empty" matters.
                      <span style={{ display: "block", fontSize: 11, color: "#b91c1c" }}>
                        尚不可用，缺少：{c.missing.join("、")}
                      </span>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </div>
      </section>

      <div style={{ display: "grid", gap: 24, minWidth: 0 }}>
        <section data-panel="sources">
          <h2 style={{ fontSize: 15, margin: "0 0 10px", display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
            <span>這個客戶的來源（{approved.length} 個已核准）</span>
            {approved.length > 1 ? (
              <button
                onClick={() => setRunOnly((r) => (r.length ? [] : approved.map((s2) => s2.id)))}
                style={{ ...buttonStyle(false), fontSize: 11 }}
              >
                {runOnly.length ? "清除選取" : "全選"}
              </button>
            ) : null}
          </h2>

          <ScheduleControls slug={slug} />

          {candidates.length ? (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: "#b45309", marginBottom: 6 }}>待核准（自動找到的，還不會被抓）</div>
              {candidates.map((s) => (
                <SourceRow key={s.id} source={s} onApprove={() => patch(s.id, "approve")} onDisable={() => patch(s.id, "disable")} busy={busy} />
              ))}
            </div>
          ) : null}

          {approved.map((s) => (
            <SourceRow
              key={s.id}
              source={s}
              onDisable={() => patch(s.id, "disable")}
              busy={busy}
              selected={runOnly.includes(s.id)}
              onToggle={() =>
                setRunOnly((r) => (r.includes(s.id) ? r.filter((i) => i !== s.id) : [...r, s.id]))
              }
            />
          ))}
          {approved.length === 0 && candidates.length === 0 ? (
            <p style={{ fontSize: 13, color: "#6b7280" }}>還沒有任何來源。</p>
          ) : null}

          {disabled.length ? (
            <details style={{ marginTop: 10 }}>
              <summary style={{ fontSize: 12, color: "#9ca3af", cursor: "pointer" }}>已停用（{disabled.length}）</summary>
              {disabled.map((s) => (
                <SourceRow key={s.id} source={s} onApprove={() => patch(s.id, "approve")} busy={busy} />
              ))}
            </details>
          ) : null}

          {/* The count in the label is the whole point of the checkboxes: a run that quietly covered
              everything when the operator had ticked two sources would spend budget they did not ask for. */}
          <div style={{ display: "flex", gap: 8, marginTop: 16, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={() => collect(true)} disabled={busy || approved.length === 0} style={buttonStyle(false)}>
              試跑（不存）
            </button>
            <button onClick={() => collect(false)} disabled={busy || approved.length === 0} style={buttonStyle(true)}>
              正式抓取
            </button>
            <span style={{ fontSize: 11, color: "#6b7280" }}>
              {runOnly.length ? `只跑勾選的 ${runOnly.length} 個` : `全部 ${approved.length} 個已核准來源`}
            </span>
          </div>

          {run ? <RunReport run={run} /> : null}
        </section>

        <section data-panel="form">
          <h2 style={{ fontSize: 15, margin: "0 0 10px" }}>
            {chosenList.length === 0
              ? "設定這筆來源"
              : chosenList.length === 1
                ? `設定：${chosenList[0].title}`
                : `設定這 ${chosenList.length} 個來源`}
          </h2>
          {chosenList.length === 0 ? (
            // Said plainly rather than leaving an inert form: an entry box that does nothing
            // until something is ticked reads as broken.
            <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>先在左邊勾一個或多個來源。</p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
            {entryKinds.length > 1 ? (
              <div style={{ fontSize: 11, color: "#b45309" }}>
                選中的來源需要不同形式的入口（{entryKinds.map((k) => ENTRY_LABEL[k]).join("、")}）。下面只有一格，套不上的那幾個會在加入時個別報錯。
              </div>
            ) : null}

            <label style={labelStyle}>
              {ENTRY_LABEL[entryKind]}
              <input
                value={entry}
                onChange={(e) => setEntry(e.target.value)}
                placeholder={ENTRY_PLACEHOLDER[entryKind]}
                style={inputStyle}
              />
            </label>

            {chosenList
              .filter((c) => (c.options ?? []).length > 0)
              .map((c) => (
                <fieldset key={c.id} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 10px", display: "grid", gap: 8 }}>
                  <legend style={{ fontSize: 11, color: "#6b7280", padding: "0 4px" }}>
                    {c.icon} {c.title}
                  </legend>
                  {(c.options ?? []).map((opt) => {
                    const val = (options[c.id] ?? {})[opt.key];
                    const set = (v: unknown) => setOptions((o) => ({ ...o, [c.id]: { ...(o[c.id] ?? {}), [opt.key]: v } }));
                    return (
                      <label key={opt.key} style={labelStyle}>
                        {opt.label}
                        {opt.type === "select" ? (
                          <select value={String(val ?? opt.default ?? "")} onChange={(e) => set(e.target.value)} style={inputStyle}>
                            {(opt.choices ?? []).map((ch) => (
                              <option key={ch.value} value={ch.value}>
                                {ch.label}
                              </option>
                            ))}
                          </select>
                        ) : opt.type === "boolean" ? (
                          <input type="checkbox" checked={Boolean(val ?? opt.default)} onChange={(e) => set(e.target.checked)} />
                        ) : (
                          <input
                            type={opt.type === "number" ? "number" : "text"}
                            value={String(val ?? opt.default ?? "")}
                            onChange={(e) => set(opt.type === "number" ? Number(e.target.value) : e.target.value)}
                            style={inputStyle}
                          />
                        )}
                        {opt.help ? <span style={{ fontSize: 11, color: "#9ca3af" }}>{opt.help}</span> : null}
                      </label>
                    );
                  })}
                </fieldset>
              ))}

            <button onClick={addSource} disabled={busy || !entry.trim() || chosenList.length === 0} style={buttonStyle(false)}>
              {chosenList.length > 1 ? `加入 ${chosenList.length} 個來源` : "加入"}
            </button>
            {message ? <div style={{ fontSize: 12, whiteSpace: "pre-line" }}>{message}</div> : null}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/**
 * The switch for "someone has to remember to click 正式抓取" (TASKS.md 2026-09-12). Talks to
 * PATCH /api/ops/clients/[slug]/collection-schedule directly — collection-sources' own PATCH is
 * per-source approve/disable, a different axis entirely. Buttons, not a native <select>, for
 * frequency and day-of-week: every option visible at once is the house convention here (see the
 * catalogue's own comment above on why a dropdown was rejected for source types).
 */
function ScheduleControls({ slug }: { slug: string }) {
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const headers = { "Content-Type": "application/json" };

  const load = useCallback(async () => {
    const res = await fetch(`/api/ops/clients/${slug}/collection-schedule`, { headers: { "Content-Type": "application/json" } });
    const data = (await res.json()) as { ok?: boolean; schedule?: Schedule };
    if (data.ok && data.schedule) setSchedule(data.schedule);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(patch: Partial<Pick<Schedule, "enabled" | "frequency" | "hourUtc" | "dayOfWeekUtc">>) {
    if (!schedule) return;
    const next = { ...schedule, ...patch };
    setSchedule(next); // optimistic — a slow PATCH must not make a checkbox feel unresponsive
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/ops/clients/${slug}/collection-schedule`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ enabled: next.enabled, frequency: next.frequency, hourUtc: next.hourUtc, dayOfWeekUtc: next.dayOfWeekUtc }),
      });
      const data = (await res.json()) as { ok?: boolean; schedule?: Schedule; errors?: string[] };
      if (data.ok && data.schedule) setSchedule(data.schedule);
      else setMsg(`⚠ ${(data.errors ?? ["save_failed"]).join("、")}`);
    } finally {
      setSaving(false);
    }
  }

  if (!schedule) return null;

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 12px", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          <input type="checkbox" checked={schedule.enabled} disabled={saving} onChange={(e) => save({ enabled: e.target.checked })} />
          自動排程抓取
        </label>
        {schedule.enabled ? (
          <>
            <div style={{ display: "flex", gap: 4 }}>
              <button disabled={saving} onClick={() => save({ frequency: "daily" })} style={{ ...buttonStyle(schedule.frequency === "daily"), fontSize: 11, padding: "4px 10px" }}>
                每天
              </button>
              <button disabled={saving} onClick={() => save({ frequency: "weekly" })} style={{ ...buttonStyle(schedule.frequency === "weekly"), fontSize: 11, padding: "4px 10px" }}>
                每週
              </button>
            </div>
            {schedule.frequency === "weekly" ? (
              <div style={{ display: "flex", gap: 4 }}>
                {DAY_LABELS.map((label, day) => (
                  <button key={day} disabled={saving} onClick={() => save({ dayOfWeekUtc: day })}
                    style={{ ...buttonStyle(schedule.dayOfWeekUtc === day), fontSize: 11, padding: "4px 8px", minWidth: 28 }}>
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#6b7280" }}>
              時間（UTC）
              <input
                type="number"
                min={0}
                max={23}
                value={schedule.hourUtc}
                disabled={saving}
                onChange={(e) => {
                  const h = Number(e.target.value);
                  if (Number.isInteger(h) && h >= 0 && h <= 23) void save({ hourUtc: h });
                }}
                style={{ ...inputStyle, width: 56, padding: "4px 6px" }}
              />
              點
            </label>
          </>
        ) : (
          <span style={{ fontSize: 11, color: "#9ca3af" }}>關閉時完全不會自動跑，仍可手動按「正式抓取」</span>
        )}
      </div>
      {schedule.enabled && schedule.lastRunAt ? (
        <div style={{ fontSize: 11, color: "#6b7280", marginTop: 6 }}>
          上次排程執行：{schedule.lastRunAt.slice(0, 16).replace("T", " ")}
        </div>
      ) : null}
      {msg ? <div style={{ fontSize: 11, color: "#b91c1c", marginTop: 6 }}>{msg}</div> : null}
    </div>
  );
}

function SourceRow({
  source,
  onApprove,
  onDisable,
  busy,
  selected,
  onToggle,
}: {
  source: Source;
  onApprove?: () => void;
  onDisable?: () => void;
  busy: boolean;
  /** Omitted for candidate and disabled rows — neither is runnable, so neither is tickable. */
  selected?: boolean;
  onToggle?: () => void;
}) {
  return (
    <div
      style={{
        border: `1px solid ${selected ? "#111827" : "#e5e7eb"}`,
        borderRadius: 8,
        padding: "8px 10px",
        marginBottom: 6,
        fontSize: 13,
        background: selected ? "#f9fafb" : "#fff",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        {onToggle ? (
          <input type="checkbox" checked={Boolean(selected)} onChange={onToggle} style={{ marginTop: 3 }} />
        ) : null}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{source.entry}</div>
          <div style={{ color: "#6b7280", fontSize: 11 }}>
            {source.blockId}
            {source.proposedBy ? ` · 由 ${source.proposedBy} 提議` : ""}
            {source.approvedBy ? ` · ${source.approvedBy} 核准` : ""}
            {source.lastRunAt ? ` · 上次 ${source.lastRunAt.slice(0, 16).replace("T", " ")} (${source.lastStatus ?? "?"})` : " · 尚未跑過"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {onApprove ? (
            <button onClick={onApprove} disabled={busy} style={buttonStyle(true)}>
              核准
            </button>
          ) : null}
          {onDisable ? (
            <button onClick={onDisable} disabled={busy} style={buttonStyle(false)}>
              停用
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * One refusal, in the operator's words. `null` = we have nothing better to say than the raw string,
 * which is then shown as-is rather than replaced by a vague "something went wrong".
 *
 * Only reasons the pipeline actually emits are listed. Inventing friendly text for errors that
 * cannot happen is how a message ends up describing the wrong failure.
 */
export function explainReason(reason: string): string | null {
  const provider = /provider_([a-z0-9-]+)_http_(\d{3})/.exec(reason);
  if (provider) {
    const [, vendor, status] = provider;
    const key = vendor === "perplexity" ? "PERPLEXITY_API_KEY" : vendor === "firecrawl" ? "FIRECRAWL_API_KEY" : `${vendor.toUpperCase()}_API_KEY`;
    if (status === "401" || status === "403") return `${vendor} 拒絕了這把金鑰（${status}）。金鑰失效或沒有這個 API 的權限，需要換一把新的 ${key}。`;
    if (status === "402") return `${vendor} 回報餘額不足（402）。帳戶要儲值才能繼續用這個來源。`;
    if (status === "429") return `${vendor} 限流（429）。稍後再跑，或把「取回幾筆結果」調小。`;
    return `${vendor} 回了 HTTP ${status}，這次沒拿到結果。`;
  }
  if (reason.includes("provider_call_unavailable")) return "這個來源需要外部供應商，但這次執行沒有帶供應商設定。";
  if (reason.includes("too_short")) return "這頁抽不到足夠的內文。多半是 JavaScript 才長出內容的網站——勾「JS 渲染網頁」那個來源可以讀，但它按次計費。";
  if (reason.includes("low_text_density")) return "這頁大部分是版面與程式碼，沒什麼可讀的內文，所以沒有收進來。";
  if (reason.includes("soft_404")) return "這頁其實是「找不到頁面」，只是網站回了 200。網址可能過期了。";
  if (reason.includes("injection_")) return "這頁裡藏著像是要指揮 AI 的句子，已經擋下不入庫。這是刻意的防線，不是誤判。";
  if (reason.includes("query_missing")) return "這筆來源沒有查詢字串。";
  if (reason === "disallowed" || reason.includes("robots")) return "對方的 robots.txt 不允許抓這一頁，所以跳過。";
  return null;
}

function RunReport({ run }: { run: RunResult }) {
  const refused = run.report.dirty.length + run.report.quarantined.length;
  return (
    <div style={{ marginTop: 16, border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, fontSize: 13 }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>
        {run.dryRun ? "試跑結果（未寫入）" : "抓取結果"} · {run.sources} 個來源 · {run.runKey}
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 8 }}>
        <span>抓到 {run.report.fetched}</span>
        <span>入庫 {run.sink.written}</span>
        <span>未變更 {run.sink.skipped}</span>
        <span style={{ color: refused ? "#b45309" : undefined }}>被擋下 {refused}</span>
        <span>已下架 {run.report.gone.length}</span>
        <span style={{ color: "#6b7280" }}>結束原因 {run.report.stoppedBy}</span>
      </div>
      {run.incidentRaised ? <div style={{ color: "#b91c1c", marginBottom: 6 }}>已開一張 ops incident。</div> : null}
      {/* Refusals listed with their reason: a run that stored nothing while refusing pages must not
          be able to look like a quiet day. Each one is explained in words first, with the raw
          reason kept underneath — that string is what you search for when the explanation runs out. */}
      {[...run.report.quarantined, ...run.report.dirty, ...run.report.disallowed].slice(0, 12).map((i) => {
        const said = explainReason(i.reason);
        return (
          <div key={i.uri + i.reason} style={{ fontSize: 11, marginBottom: 6, overflowWrap: "anywhere" }}>
            <div style={{ color: said ? "#b45309" : "#6b7280" }}>{said ?? i.reason}</div>
            <div style={{ color: "#9ca3af" }}>{i.uri}</div>
            {said ? <div style={{ color: "#c4c7cc", fontSize: 10 }}>{i.reason}</div> : null}
          </div>
        );
      })}
      {run.errors.length ? <div style={{ color: "#b91c1c", marginTop: 6 }}>{run.errors.join("、")}</div> : null}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "6px 8px",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  fontSize: 13,
  width: "100%",
};

const labelStyle: React.CSSProperties = { display: "grid", gap: 4, fontSize: 12, color: "#374151" };

function buttonStyle(primary: boolean): React.CSSProperties {
  return {
    padding: "6px 12px",
    borderRadius: 6,
    border: primary ? "1px solid #111827" : "1px solid #d1d5db",
    background: primary ? "#111827" : "#fff",
    color: primary ? "#fff" : "#374151",
    fontSize: 12,
    cursor: "pointer",
  };
}
