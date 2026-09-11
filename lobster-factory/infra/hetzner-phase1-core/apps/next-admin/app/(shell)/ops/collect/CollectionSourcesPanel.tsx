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
  const [picked, setPicked] = useState<string>("");
  const [entry, setEntry] = useState("");
  const [options, setOptions] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [run, setRun] = useState<RunResult | null>(null);

  // No role header: the console's middleware injects the caller's real role from their session, and
  // a header set here would be a claim the browser makes about itself — ignored by design.
  const headers = { "Content-Type": "application/json" };
  const chosen = catalogue.find((c) => c.id === picked) ?? null;

  const load = useCallback(async () => {
    const res = await fetch(`/api/ops/clients/${slug}/collection-sources`, { headers });
    const data = (await res.json()) as { ok?: boolean; catalogue?: CatalogueEntry[]; sources?: Source[] };
    if (data.ok) {
      setCatalogue(data.catalogue ?? []);
      setSources(data.sources ?? []);
      if (!picked && data.catalogue?.length) setPicked(data.catalogue[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addSource() {
    if (!chosen || !entry.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/ops/clients/${slug}/collection-sources`, {
        method: "POST",
        headers,
        body: JSON.stringify({ blockId: chosen.id, entry: entry.trim(), options }),
      });
      const data = (await res.json()) as { ok?: boolean; errors?: string[] };
      if (!data.ok) {
        // The validation errors are shown verbatim: "missing_option:itemsPath" tells you exactly
        // which field to fill, and a friendly "something went wrong" would not.
        setMessage(`⚠ ${(data.errors ?? ["failed"]).join("、")}`);
      } else {
        setMessage("✓ 已加入");
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
        body: JSON.stringify({ action: "run", dryRun }),
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
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 24 }}>
      <section>
        <h2 style={{ fontSize: 15, margin: "0 0 10px" }}>加入來源</h2>
        <div style={{ display: "grid", gap: 10 }}>
          <select
            value={picked}
            onChange={(e) => {
              setPicked(e.target.value);
              setOptions({});
            }}
            style={inputStyle}
          >
            {catalogue.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.title}
                {c.available ? "" : "（需要設定）"}
              </option>
            ))}
          </select>

          {chosen ? (
            <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.6 }}>
              {chosen.summary}
              {chosen.metered ? <div style={{ color: "#b45309" }}>此來源按次計費。</div> : null}
              {!chosen.available ? (
                // Shown, never hidden: the difference between "we cannot do this" and "one
                // environment variable is empty" matters.
                <div style={{ color: "#b91c1c" }}>尚不可用，缺少：{chosen.missing.join("、")}</div>
              ) : null}
            </div>
          ) : null}

          <label style={labelStyle}>
            {ENTRY_LABEL[chosen?.entry ?? "url"]}
            <input
              value={entry}
              onChange={(e) => setEntry(e.target.value)}
              placeholder={ENTRY_PLACEHOLDER[chosen?.entry ?? "url"]}
              style={inputStyle}
            />
          </label>

          {(chosen?.options ?? []).map((opt) => (
            <label key={opt.key} style={labelStyle}>
              {opt.label}
              {opt.type === "select" ? (
                <select
                  value={String(options[opt.key] ?? opt.default ?? "")}
                  onChange={(e) => setOptions((o) => ({ ...o, [opt.key]: e.target.value }))}
                  style={inputStyle}
                >
                  {(opt.choices ?? []).map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              ) : opt.type === "boolean" ? (
                <input
                  type="checkbox"
                  checked={Boolean(options[opt.key] ?? opt.default)}
                  onChange={(e) => setOptions((o) => ({ ...o, [opt.key]: e.target.checked }))}
                />
              ) : (
                <input
                  type={opt.type === "number" ? "number" : "text"}
                  value={String(options[opt.key] ?? opt.default ?? "")}
                  onChange={(e) =>
                    setOptions((o) => ({
                      ...o,
                      [opt.key]: opt.type === "number" ? Number(e.target.value) : e.target.value,
                    }))
                  }
                  style={inputStyle}
                />
              )}
              {opt.help ? <span style={{ fontSize: 11, color: "#9ca3af" }}>{opt.help}</span> : null}
            </label>
          ))}

          <button onClick={addSource} disabled={busy || !entry.trim()} style={buttonStyle(false)}>
            加入
          </button>
          {message ? <div style={{ fontSize: 12 }}>{message}</div> : null}
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 15, margin: "0 0 10px" }}>
          這個客戶的來源（{approved.length} 個已核准）
        </h2>

        {candidates.length ? (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: "#b45309", marginBottom: 6 }}>待核准（自動找到的，還不會被抓）</div>
            {candidates.map((s) => (
              <SourceRow key={s.id} source={s} onApprove={() => patch(s.id, "approve")} onDisable={() => patch(s.id, "disable")} busy={busy} />
            ))}
          </div>
        ) : null}

        {approved.map((s) => (
          <SourceRow key={s.id} source={s} onDisable={() => patch(s.id, "disable")} busy={busy} />
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

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button onClick={() => collect(true)} disabled={busy || approved.length === 0} style={buttonStyle(false)}>
            試跑（不存）
          </button>
          <button onClick={() => collect(false)} disabled={busy || approved.length === 0} style={buttonStyle(true)}>
            正式抓取
          </button>
        </div>

        {run ? <RunReport run={run} /> : null}
      </section>
    </div>
  );
}

function SourceRow({
  source,
  onApprove,
  onDisable,
  busy,
}: {
  source: Source;
  onApprove?: () => void;
  onDisable?: () => void;
  busy: boolean;
}) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 10px", marginBottom: 6, fontSize: 13 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
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
          be able to look like a quiet day. */}
      {[...run.report.quarantined, ...run.report.dirty, ...run.report.disallowed].slice(0, 12).map((i) => (
        <div key={i.uri + i.reason} style={{ fontSize: 11, color: "#6b7280", overflowWrap: "anywhere" }}>
          {i.reason} — {i.uri}
        </div>
      ))}
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
