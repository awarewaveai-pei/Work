"use client";

// The collection panel: the catalogue on the left, this client's sources on the right, and a run
// button that reports what actually happened.
//
// Two decisions carried through from the code beneath it, because a screen that hides them undoes
// them: an unavailable source is SHOWN with the reason (hiding it reads as "the system cannot do
// this"), and a run's refusals are shown next to its successes (a crawl that stored nothing while
// refusing forty pages must not look like a quiet day).

import { useCallback, useEffect, useRef, useState } from "react";

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
    type: "string" | "number" | "boolean" | "select" | "multiselect";
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
    offEntity: Array<{ uri: string; reason: string }>;
    gone: string[];
    stoppedBy: string | null;
  };
  sink: { written: number; skipped: number; errors?: string[] };
  incidentRaised: boolean;
  errors: string[];
}

/** Mirrors ai_lego/apps/api/main.py's ImportSummary shape returned by
 *  POST /api/ops/clients/[slug]/cognitive-os-import (which wraps lib/cognitive-os/import-sources.ts's
 *  own ImportSummary 1:1 — see that file for field meaning). */
interface CognitiveOsImportResult {
  organizationId: string;
  projectId: string;
  totalCandidates: number;
  imported: number;
  alreadyImported: number;
  rejected: Array<{ sourceId: string; title: string; issues: string[] }>;
  errors: string[];
}

/** Mirrors lib/hci/import-sources.ts's HciImportSummary 1:1 (returned by
 *  POST /api/ops/clients/[slug]/hci-import) -- see that file for field meaning. No projectId: HCI-30
 *  has no project concept, every accepted URL becomes one hci.sources row under a fixed tenant. */
interface HciImportResult {
  organizationId: string;
  totalCandidates: number;
  imported: number;
  alreadyImported: number;
  rejected: Array<{ sourceId: string; title: string; issues: string[] }>;
  errors: string[];
}

// The link below goes through /api/cognitive-os/open (next-admin's own route), never straight at the
// Cognitive OS dashboard: that Project was created under next-admin's SERVICE tenant, a different
// tenant from whatever the operator is logged into on the dashboard directly, so a direct
// ?project=<id> link 404s (PROJECT_NOT_FOUND) for anyone but that service identity. The route mints a
// one-time cross-origin handoff and redirects through it instead (operator report, 2026-09-18 —
// route's own header has the full rationale).

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

// `researchBridgesEnabled` comes from the server page (lib/research-bridges.ts): the two "送去 X"
// blocks below render only when the bridges are switched on. Default false = frozen (plan P0,
// 2026-09-23); the routes answer 410 in that state anyway, so this only spares the operator a dead
// button, it is not the security boundary.
export function CollectionSourcesPanel({ slug, researchBridgesEnabled = false }: { slug: string; researchBridgesEnabled?: boolean }) {
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
  const [cognitiveOsBusy, setCognitiveOsBusy] = useState(false);
  const [cognitiveOsMessage, setCognitiveOsMessage] = useState<string | null>(null);
  const [cognitiveOsRun, setCognitiveOsRun] = useState<CognitiveOsImportResult | null>(null);
  const [hciBusy, setHciBusy] = useState(false);
  const [hciMessage, setHciMessage] = useState<string | null>(null);
  const [hciRun, setHciRun] = useState<HciImportResult | null>(null);
  // Guards pollRun's loop against a component that has already unmounted (navigated off this page
  // mid-run) — critic finding, 2026-09-12: without this the loop kept polling and calling setState
  // for up to ~10 minutes after the tab left /ops/collect. React itself no-ops a setState on an
  // unmounted component rather than crashing, but the wasted network traffic has no reason to exist.
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

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

  // The run itself can take minutes (real crawling, politely rate-limited); this app's domain sits
  // behind Cloudflare, whose edge drops an idle connection around 100s regardless of how much time
  // the server itself is willing to give the request. So the POST below only starts the run and
  // gets a key back — the actual wait happens here, as polling, which has no such ceiling because
  // each individual poll is a fast, ordinary request. (Root cause + evidence: WORKLOG 2026-09-12.)
  async function pollRun(runKey: string): Promise<void> {
    // A flaky poll must not abandon an otherwise-healthy run — but a PERSISTENT failure (Wi-Fi
    // dropped, VPN killed) must not spin forever either (critic finding, 2026-09-12): without a
    // cap, busy stayed true and the run buttons stayed disabled indefinitely with no explanation,
    // recoverable only by a full reload. 10 consecutive failures ≈ 20s of the network genuinely
    // being down, not one dropped packet.
    let consecutiveFailures = 0;
    for (;;) {
      if (!mountedRef.current) return; // navigated away mid-run; nothing left to update
      let data: { ok?: boolean; status?: string; result?: RunResult; error?: string };
      try {
        const res = await fetch(`/api/ops/clients/${slug}/collection-sources?runKey=${encodeURIComponent(runKey)}`, { headers });
        data = await res.json();
        consecutiveFailures = 0;
      } catch {
        consecutiveFailures++;
        if (consecutiveFailures >= 10) {
          if (mountedRef.current) setMessage("⚠ 追蹤執行狀態失敗（網路持續連不上）——正式抓取仍在伺服器上繼續跑，重新整理頁面看來源清單的 lastRunAt 確認結果");
          return;
        }
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      if (!mountedRef.current) return;
      if (!data.ok) {
        // run_not_found: the tracked job is gone (e.g. the server restarted mid-run — the tracker is
        // in-memory by design, see lib/collect/run-jobs.ts). The crawl itself was unaffected; only
        // this tab's view of its progress was lost.
        setMessage("⚠ 追蹤不到這次執行的狀態（可能伺服器重啟過）——如果是正式抓取，稍後重新整理來源清單看 lastRunAt 確認是否已完成");
        return;
      }
      if (data.status === "running") {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      if (data.status === "error") {
        setMessage(`⚠ ${data.error ?? "run_failed"}`);
        return;
      }
      if (data.result) setRun(data.result);
      await load();
      return;
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
      const data = (await res.json()) as { ok?: boolean; queued?: boolean; runKey?: string; errors?: string[] };
      if (data.ok && data.runKey) {
        await pollRun(data.runKey);
      } else {
        setMessage(`⚠ ${(data.errors ?? ["run_failed"]).join("、")}`);
      }
    } finally {
      setBusy(false);
    }
  }

  // Same edge-timeout reasoning as pollRun above (WORKLOG 2026-09-12): a real import calls
  // Cognitive OS once per eligible source, easily past the ~100s Cloudflare idle ceiling.
  async function pollCognitiveOsImport(runKey: string): Promise<void> {
    let consecutiveFailures = 0;
    for (;;) {
      if (!mountedRef.current) return;
      let data: { ok?: boolean; status?: string; result?: CognitiveOsImportResult; error?: string };
      try {
        const res = await fetch(`/api/ops/clients/${slug}/cognitive-os-import?runKey=${encodeURIComponent(runKey)}`, { headers });
        data = await res.json();
        consecutiveFailures = 0;
      } catch {
        consecutiveFailures++;
        if (consecutiveFailures >= 10) {
          if (mountedRef.current) setCognitiveOsMessage("⚠ 追蹤送出狀態失敗（網路持續連不上）——匯入仍在伺服器上繼續跑，稍後重新整理頁面看 Knowledge 分頁確認結果");
          return;
        }
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      if (!mountedRef.current) return;
      if (!data.ok) {
        setCognitiveOsMessage("⚠ 追蹤不到這次送出的狀態（可能伺服器重啟過）——稍後重新整理 Knowledge 分頁確認是否已完成");
        return;
      }
      if (data.status === "running") {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      if (data.status === "error") {
        setCognitiveOsMessage(`⚠ ${data.error ?? "cognitive_os_import_failed"}`);
        return;
      }
      if (data.result) setCognitiveOsRun(data.result);
      return;
    }
  }

  async function sendToCognitiveOs() {
    setCognitiveOsBusy(true);
    setCognitiveOsMessage(null);
    setCognitiveOsRun(null);
    try {
      const res = await fetch(`/api/ops/clients/${slug}/cognitive-os-import`, { method: "POST", headers, body: JSON.stringify({}) });
      const data = (await res.json()) as { ok?: boolean; queued?: boolean; runKey?: string; error?: string };
      if (data.ok && data.runKey) {
        await pollCognitiveOsImport(data.runKey);
      } else {
        setCognitiveOsMessage(`⚠ ${data.error ?? "cognitive_os_import_failed"}`);
      }
    } finally {
      setCognitiveOsBusy(false);
    }
  }

  // Same edge-timeout reasoning as pollCognitiveOsImport above: a real send calls HCI-30 once per
  // eligible source (each one a real fetch through HCI-30's isolated runner).
  async function pollHciImport(runKey: string): Promise<void> {
    let consecutiveFailures = 0;
    for (;;) {
      if (!mountedRef.current) return;
      let data: { ok?: boolean; status?: string; result?: HciImportResult; error?: string };
      try {
        const res = await fetch(`/api/ops/clients/${slug}/hci-import?runKey=${encodeURIComponent(runKey)}`, { headers });
        data = await res.json();
        consecutiveFailures = 0;
      } catch {
        consecutiveFailures++;
        if (consecutiveFailures >= 10) {
          if (mountedRef.current) setHciMessage("⚠ 追蹤送出狀態失敗（網路持續連不上）——送出仍在伺服器上繼續跑，稍後重新整理頁面確認結果");
          return;
        }
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      if (!mountedRef.current) return;
      if (!data.ok) {
        setHciMessage("⚠ 追蹤不到這次送出的狀態（可能伺服器重啟過）——稍後重新整理頁面確認是否已完成");
        return;
      }
      if (data.status === "running") {
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      if (data.status === "error") {
        setHciMessage(`⚠ ${data.error ?? "hci_import_failed"}`);
        return;
      }
      if (data.result) setHciRun(data.result);
      return;
    }
  }

  async function sendToHci() {
    setHciBusy(true);
    setHciMessage(null);
    setHciRun(null);
    try {
      const res = await fetch(`/api/ops/clients/${slug}/hci-import`, { method: "POST", headers, body: JSON.stringify({}) });
      const data = (await res.json()) as { ok?: boolean; queued?: boolean; runKey?: string; error?: string };
      if (data.ok && data.runKey) {
        await pollHciImport(data.runKey);
      } else {
        setHciMessage(`⚠ ${data.error ?? "hci_import_failed"}`);
      }
    } finally {
      setHciBusy(false);
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

          <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 14 }}>
            要讓它定期自動抓，到 <a href="/ops/schedules">排程</a> 頁勾選「自動爬取」。
          </div>

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

          {researchBridgesEnabled ? (
            <>
              <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center", flexWrap: "wrap", borderTop: "1px solid #e5e7eb", paddingTop: 12 }}>
                <button onClick={sendToCognitiveOs} disabled={cognitiveOsBusy} style={buttonStyle(false)}>
                  送去 Cognitive OS 分析
                </button>
                <span style={{ fontSize: 11, color: "#6b7280" }}>把已入庫的來源送進 Cognitive OS，之後去那邊挑方法分析</span>
              </div>
              {cognitiveOsMessage ? <p style={{ fontSize: 12, color: "#b45309", whiteSpace: "pre-wrap" }}>{cognitiveOsMessage}</p> : null}
              {cognitiveOsRun ? <CognitiveOsImportReport run={cognitiveOsRun} /> : null}

              <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center", flexWrap: "wrap", borderTop: "1px solid #e5e7eb", paddingTop: 12 }}>
                <button onClick={sendToHci} disabled={hciBusy} style={buttonStyle(false)}>
                  送去 HCI 探索來源
                </button>
                <span style={{ fontSize: 11, color: "#6b7280" }}>
                  把已入庫來源的網址送給 HCI-30 重新查核，進它自己的候選來源審核佇列。
                  {/* Critic finding, 2026-09-18: HCI-30 has no per-organization tenant mapping yet -- every
                      client that uses this button shares the SAME HCI-30 review queue. Surfaced here, not
                      only in a code comment, since this matters most exactly when it's about to be used on
                      a second real client. */}
                  <strong>注意：目前所有客戶共用同一個 HCI-30 帳號，還沒有客戶區隔。</strong>
                </span>
              </div>
              {hciMessage ? <p style={{ fontSize: 12, color: "#b45309", whiteSpace: "pre-wrap" }}>{hciMessage}</p> : null}
              {hciRun ? <HciImportReport run={hciRun} /> : null}
            </>
          ) : (
            // Said, not hidden: an operator who used these buttons last week must see why they are
            // gone and where that work now lives, not a panel that quietly lost two rows.
            <p data-panel="research-bridges-frozen" style={{ fontSize: 11, color: "#6b7280", marginTop: 12, borderTop: "1px solid #e5e7eb", paddingTop: 12 }}>
              「送去 Cognitive OS／HCI」已於 2026-09-23 凍結：研究蒐集改在 Cognitive OS 的專案內進行。這裡只負責客戶知識庫的蒐集。
            </p>
          )}
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
                        {opt.type === "select" || opt.type === "multiselect" ? (
                          <ChoiceChips
                            choices={opt.choices ?? []}
                            value={String(val ?? opt.default ?? "")}
                            multiple={opt.type === "multiselect"}
                            onChange={set}
                          />
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
 * Choices as visible buttons, never a native <select> — the house convention on this screen (see the
 * catalogue's own comment on why a dropdown was rejected for source types; the schedules page follows it too). A dropdown hides how many options exist and how many are currently on, which for
 * something like "which angles should this search cover" is exactly the information being chosen.
 *
 * One value shape for both modes: a comma-separated string, matching SourceOption's contract, so
 * `options` jsonb never holds an array here and a string there.
 */
function ChoiceChips({
  choices,
  value,
  multiple,
  onChange,
}: {
  choices: Array<{ value: string; label: string }>;
  value: string;
  multiple: boolean;
  onChange: (v: string) => void;
}) {
  const selected = new Set(
    value
      .split(/[,\s]+/)
      .map((v) => v.trim())
      .filter(Boolean),
  );
  const toggle = (v: string) => {
    // Single choice: clicking IS the answer. There is no un-picking, because "none" is itself one
    // of the choices whenever a source has a meaningful empty state (a recency of "不限").
    if (!multiple) return onChange(v);
    const next = new Set(selected);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    // Emitted in the DECLARED order, not click order, so the stored string is stable and two
    // operators who ticked the same boxes produce the same row.
    onChange(choices.filter((c) => next.has(c.value)).map((c) => c.value).join(","));
  };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {choices.map((ch) => {
        const on = selected.has(ch.value) || (!multiple && !selected.size && ch.value === "");
        return (
          <button
            key={ch.value || "__empty"}
            type="button"
            onClick={() => toggle(ch.value)}
            style={{
              ...buttonStyle(on),
              fontSize: 11,
              padding: "4px 9px",
              opacity: on ? 1 : 0.65,
            }}
          >
            {multiple ? (on ? "☑ " : "☐ ") : ""}
            {ch.label}
          </button>
        );
      })}
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
  // Entity refusals first: they are the common case in a dossier run and the ONE the operator can
  // act on (loosen the anchors, or confirm the tool is right and the page really is somebody else).
  if (reason === "entity_absent") return "這頁完全沒提到你要查的對象——搜尋引擎回了不相關的結果，已丟掉。";
  if (reason === "entity_anchor_missing") return "有出現名字，但沒出現你填的定位詞，可能是同名的另一個人。要收的話把「嚴格模式」關掉。";
  if (reason.endsWith("_no_heavier_tier")) return "這頁讀不到內容（多半是 JavaScript 才會長出正文），而且目前沒有開通能讀它的抽取供應商。";

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
  if (reason.includes("blocked_page")) return "對方網站的防火牆擋下了爬蟲，回的是一頁錯誤訊息（狀態仍是 200），不是內文。";
  if (reason.includes("soft_404")) return "這頁其實是「找不到頁面」，只是網站回了 200。網址可能過期了。";
  if (reason.includes("injection_")) return "這頁裡藏著像是要指揮 AI 的句子，已經擋下不入庫。這是刻意的防線，不是誤判。";
  if (reason.includes("query_missing")) return "這筆來源沒有查詢字串。";
  if (reason === "disallowed" || reason.includes("robots")) return "對方的 robots.txt 不允許抓這一頁，所以跳過。";
  return null;
}

function RunReport({ run }: { run: RunResult }) {
  const refused = run.report.dirty.length + run.report.quarantined.length;
  const offEntity = (run.report.offEntity ?? []).length;
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
        {/* Counted apart from 被擋下 because it means something entirely different: nothing failed,
            the search engine returned pages about somebody else and they were refused on purpose.
            Shown only when it happened, so a source that makes no entity claim reads as before. */}
        {offEntity ? <span style={{ color: "#6b7280" }}>非本人 {offEntity}</span> : null}
        <span>已下架 {run.report.gone.length}</span>
        <span style={{ color: "#6b7280" }}>結束原因 {run.report.stoppedBy}</span>
      </div>
      {run.incidentRaised ? <div style={{ color: "#b91c1c", marginBottom: 6 }}>已開一張 ops incident。</div> : null}
      {/* Refusals listed with their reason: a run that stored nothing while refusing pages must not
          be able to look like a quiet day. Each one is explained in words first, with the raw
          reason kept underneath — that string is what you search for when the explanation runs out. */}
      {[...run.report.quarantined, ...run.report.dirty, ...run.report.disallowed, ...(run.report.offEntity ?? [])]
        .slice(0, 12)
        .map((i) => {
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

function CognitiveOsImportReport({ run }: { run: CognitiveOsImportResult }) {
  return (
    <div style={{ marginTop: 12, border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, fontSize: 13 }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>已送去 Cognitive OS · Project {run.projectId}</div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 8 }}>
        <span>候選 {run.totalCandidates}</span>
        <span>新匯入 {run.imported}</span>
        <span>已匯入過 {run.alreadyImported}</span>
        <span style={{ color: run.rejected.length ? "#b45309" : undefined }}>不合格 {run.rejected.length}</span>
      </div>
      <a
        href={`/api/cognitive-os/open?project=${encodeURIComponent(run.projectId)}`}
        target="_blank"
        rel="noreferrer"
        style={{ fontSize: 12 }}
      >
        前往 Cognitive OS 挑選方法 →
      </a>
      {/* Same "explain the refusal, don't hide it" convention as RunReport above — a rejected
          citation-metadata record must not look like a quiet, everything-went-fine send. */}
      {run.rejected.length ? (
        <div style={{ marginTop: 8 }}>
          {run.rejected.slice(0, 12).map((r) => (
            <div key={r.sourceId} style={{ fontSize: 11, marginBottom: 4, color: "#b45309", overflowWrap: "anywhere" }}>
              {r.title}：{r.issues.join("、")}
            </div>
          ))}
        </div>
      ) : null}
      {run.errors.length ? <div style={{ color: "#b91c1c", marginTop: 6 }}>{run.errors.join("、")}</div> : null}
    </div>
  );
}

function HciImportReport({ run }: { run: HciImportResult }) {
  return (
    <div style={{ marginTop: 12, border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, fontSize: 13 }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>已送去 HCI-30 探索來源佇列</div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 8 }}>
        <span>候選 {run.totalCandidates}</span>
        <span>新送出 {run.imported}</span>
        <span>已送過 {run.alreadyImported}</span>
        <span style={{ color: run.rejected.length ? "#b45309" : undefined }}>不合格 {run.rejected.length}</span>
      </div>
      {/* No deep link here (unlike CognitiveOsImportReport): HCI-30 is deployed at
          https://hci.aware-wave.com, but its seed API returns a jobId, not a per-source URL
          (lib/hci/client.ts HciSeedWritten), so there is nothing precise to link to. */}
      <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 8px" }}>去 HCI-30 自己的「🔎 探索來源」分頁審核（核准／拒絕）。</p>
      {/* Same "explain the refusal, don't hide it" convention as CognitiveOsImportReport above. */}
      {run.rejected.length ? (
        <div style={{ marginTop: 8 }}>
          {run.rejected.slice(0, 12).map((r) => (
            <div key={r.sourceId} style={{ fontSize: 11, marginBottom: 4, color: "#b45309", overflowWrap: "anywhere" }}>
              {r.title}：{r.issues.join("、")}
            </div>
          ))}
        </div>
      ) : null}
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
