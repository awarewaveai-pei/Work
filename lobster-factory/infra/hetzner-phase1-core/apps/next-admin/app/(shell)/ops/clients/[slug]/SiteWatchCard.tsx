"use client";

// 網站巡檢 card (agency-os/docs/operations/SITE_WATCH_MASTER_PLAN.md §2, §7 step 5). Every string
// shown here that came from the DB — URLs, JS error samples, notes — was produced by the client's
// website, i.e. is attacker-controlled (plan R8): React text only, never dangerouslySetInnerHTML.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { roleHeader } from "@/lib/ops-role";
import type { ResultRow, SiteWatchOverview } from "@/lib/site-watch/console";
import type { PageStateRow } from "@/lib/site-watch/store";
import {
  ALERT_STATE_LABEL,
  FREQUENCY_LABEL,
  RECOVERY_STATE_LABEL,
  VISUAL_STATUS_LABEL,
  failureLabel,
} from "@/lib/site-watch/labels";
import { Card, ChipBtn, NoData, SubLabel, relativeTime } from "./hub-ui";

const FREQUENCIES = ["hourly", "every_6h", "daily"] as const;

const ACCEPT_ERROR: Record<string, string> = {
  storage_unconfigured: "未設定私有截圖儲存",
  no_diff_screenshot: "沒有可用的「畫面變動」截圖",
  screenshot_missing: "那張截圖已被清理（超過 30 天）",
  storage_error: "寫入儲存失敗，請稍後再試",
  target_not_found: "此客戶尚未建立巡檢設定",
  page_not_found: "找不到這個頁面的巡檢狀態",
  forbidden_role: "需要 owner／admin 權限",
};

type Draft = { enabled: boolean; frequency: string; hourUtc: number };
type Notice = { tone: "ok" | "warn" | "error"; text: string };

function Banner({ tone, children }: { tone: "ok" | "warn" | "error" | "info"; children: ReactNode }) {
  const color =
    tone === "warn" ? "var(--severity-medium)" : tone === "error" ? "var(--red)" : tone === "ok" ? "var(--green)" : "var(--text-secondary)";
  return (
    <div style={{ fontSize: 12, color, border: `1px solid ${color}`, borderRadius: 8, padding: "6px 10px", marginBottom: 10, lineHeight: 1.6 }}>
      {children}
    </div>
  );
}

function imageUrl(slug: string, q: string): string {
  return `/api/ops/clients/${encodeURIComponent(slug)}/site-watch/image?${q}`;
}

function StateLine({ label, s, extra }: { label: string; s: PageStateRow | undefined; extra?: string }) {
  if (!s) return <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{label}：尚未巡檢{extra ? `；${extra}` : ""}</div>;
  const parts = [
    s.failure_streak > 0 ? `連續失敗 ${s.failure_streak} 次` : "正常",
    s.alert_state !== "none" ? ALERT_STATE_LABEL[s.alert_state] ?? s.alert_state : "",
    s.recovery_state !== "none" ? RECOVERY_STATE_LABEL[s.recovery_state] ?? s.recovery_state : "",
    s.owed_since ? `通知待送（${relativeTime(s.owed_since)}起）` : "",
    extra ?? "",
  ].filter(Boolean);
  const color = s.alert_state === "none" ? (s.failure_streak > 0 ? "var(--severity-medium)" : "var(--text-primary)") : "var(--red)";
  return (
    <div style={{ fontSize: 12, color }}>
      {label}：{parts.join("；")}
    </div>
  );
}

export function SiteWatchCard({ slug }: { slug: string }) {
  const [ov, setOv] = useState<SiteWatchOverview | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [openImage, setOpenImage] = useState<{ key: string; src: string; label: string } | null>(null);
  const [armedPage, setArmedPage] = useState<string | null>(null);
  const [acceptingPage, setAcceptingPage] = useState<string | null>(null);

  const apply = useCallback((o: SiteWatchOverview) => {
    setOv(o);
    const t = o.target ?? { enabled: o.defaults.enabled, frequency: o.defaults.frequency, hour_utc: o.defaults.hour_utc };
    setDraft({ enabled: t.enabled, frequency: t.frequency, hourUtc: t.hour_utc });
  }, []);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch(`/api/ops/clients/${encodeURIComponent(slug)}/site-watch`, {
        headers: { ...roleHeader("admin") },
        cache: "no-store",
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) {
        setLoadError(body?.error ?? `HTTP ${res.status}`);
        return;
      }
      apply(body.overview as SiteWatchOverview);
    } catch (e) {
      setLoadError(String(e));
    }
  }, [slug, apply]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!ov || !draft) return;
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/ops/clients/${encodeURIComponent(slug)}/site-watch`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...roleHeader("admin") },
        body: JSON.stringify({
          expectedVersion: ov.target?.version ?? 0,
          enabled: draft.enabled,
          frequency: draft.frequency,
          hourUtc: draft.hourUtc,
        }),
      });
      const body = await res.json().catch(() => null);
      if (res.status === 409) {
        await load();
        setNotice({ tone: "warn", text: "別人剛改過這張卡，已重新載入最新設定；確認後再存一次。" });
      } else if (res.status === 403) {
        setNotice({ tone: "error", text: "需要 owner／admin 權限才能修改。" });
      } else if (!res.ok || !body?.ok) {
        setNotice({ tone: "error", text: `儲存失敗：${body?.error ?? `HTTP ${res.status}`}` });
      } else {
        apply(body.overview as SiteWatchOverview);
        setNotice({ tone: "ok", text: "已儲存。" });
      }
    } catch (e) {
      setNotice({ tone: "error", text: `儲存失敗：${String(e)}` });
    } finally {
      setSaving(false);
    }
  }

  async function acceptBaseline(pageId: string) {
    // Two clicks, no modal: the old baseline image is overwritten in place and cannot be recovered.
    if (armedPage !== pageId) {
      setArmedPage(pageId);
      return;
    }
    setArmedPage(null);
    setAcceptingPage(pageId);
    setNotice(null);
    try {
      const res = await fetch(`/api/ops/clients/${encodeURIComponent(slug)}/site-watch/accept-baseline`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...roleHeader("admin") },
        body: JSON.stringify({ pageId }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) {
        const code = String(body?.error ?? `HTTP ${res.status}`);
        setNotice({ tone: "error", text: `無法接受為新基準：${ACCEPT_ERROR[code] ?? code}` });
        return;
      }
      setNotice({ tone: "ok", text: "已接受為新基準；下一次巡檢畫面一致時，這次變動會自動結束。" });
      await load();
    } catch (e) {
      setNotice({ tone: "error", text: `無法接受為新基準：${String(e)}` });
    } finally {
      setAcceptingPage(null);
    }
  }

  if (loadError) {
    return (
      <Card title="網站巡檢">
        <NoData>讀取失敗：{loadError}</NoData>
      </Card>
    );
  }
  if (!ov || !draft) {
    return (
      <Card title="網站巡檢">
        <NoData>載入中…</NoData>
      </Card>
    );
  }

  const current = ov.target ?? { enabled: ov.defaults.enabled, frequency: ov.defaults.frequency, hour_utc: ov.defaults.hour_utc };
  const dirty = draft.enabled !== current.enabled || draft.frequency !== current.frequency || draft.hourUtc !== current.hour_utc;
  const newestWithErrors = ov.recent.find((r) => r.errors_sample.length > 0);

  function toggleImage(key: string, src: string, label: string) {
    setOpenImage((cur) => (cur?.key === key ? null : { key, src, label }));
  }

  return (
    <Card title="網站巡檢" badge={ov.recent[0] ? `上次巡檢 ${relativeTime(ov.recent[0].created_at)}` : "尚無紀錄"}>
      {!ov.globallyEnabled && (
        <Banner tone="warn">SITE_WATCH_ENABLED 未開，目前不會巡檢（設定可以先存，全域開關打開後生效）。</Banner>
      )}
      {!ov.storageConfigured && (
        <Banner tone="info">未設定私有截圖儲存（R2_SITE_WATCH_BUCKET）：只檢查網站能不能打開，不比對畫面、不存截圖。</Banner>
      )}
      {ov.watchedPages.length === 0 && (
        <Banner tone="warn">這個客戶沒有可巡檢的網址（客戶設定的網站網址空白或不是 http(s)），巡檢不會執行。</Banner>
      )}
      {notice && <Banner tone={notice.tone}>{notice.text}</Banner>}

      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "var(--text-primary)", cursor: "pointer" }}>
        <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />
        巡檢這個客戶的網站
      </label>

      <SubLabel>頻率</SubLabel>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {FREQUENCIES.map((f) => (
          <ChipBtn key={f} label={FREQUENCY_LABEL[f]} active={draft.frequency === f} onClick={() => setDraft({ ...draft, frequency: f })} />
        ))}
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>「只在更新時」之後開放</span>
      </div>

      {draft.frequency === "daily" && (
        <>
          <SubLabel>每天幾點（UTC）</SubLabel>
          <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "var(--text-secondary)" }}>
            <input
              type="number"
              min={0}
              max={23}
              value={draft.hourUtc}
              aria-label="每天巡檢時間（UTC 小時）"
              onChange={(e) => {
                const n = Number(e.target.value);
                if (e.target.value !== "" && Number.isInteger(n) && n >= 0 && n <= 23) setDraft({ ...draft, hourUtc: n });
              }}
              style={{ width: 56, fontSize: 12, padding: "3px 6px", borderRadius: 5, border: "1px solid var(--card-border)", background: "var(--bg-canvas)", color: "var(--text-primary)" }}
            />
            <span>點 UTC ＝ 台北 {(draft.hourUtc + 8) % 24} 點</span>
          </div>
        </>
      )}

      <div style={{ marginTop: 12 }}>
        <button
          onClick={save}
          disabled={!dirty || saving}
          style={{
            fontSize: 11, padding: "3px 10px", borderRadius: 5, border: "none",
            cursor: !dirty || saving ? "default" : "pointer", opacity: !dirty || saving ? 0.5 : 1,
            background: "var(--accent)", color: "var(--btn-primary-text)",
          }}
        >
          {saving ? "儲存中…" : "儲存"}
        </button>
      </div>

      <SubLabel>目前狀態</SubLabel>
      {ov.watchedPages.length === 0 ? (
        <NoData>—</NoData>
      ) : (
        ov.watchedPages.map((p) => {
          const avail = ov.pageStates.find((s) => s.page_id === p.pageId && s.kind === "availability");
          const visual = ov.pageStates.find((s) => s.page_id === p.pageId && s.kind === "visual");
          // The newest result that actually compared pixels: a later failed load has no visual verdict
          // and must not hide the button the operator needs for the open visual episode.
          const lastCompared = ov.recent.find((r) => r.page_id === p.pageId && r.visual_status !== null);
          const canAccept = !!(lastCompared && lastCompared.visual_status === "diff" && lastCompared.evidence_key && ov.storageConfigured);
          return (
            <div key={p.pageId} style={{ marginBottom: 8 }}>
              <div style={{ fontFamily: "monospace", fontSize: 11, color: "var(--text-secondary)", marginBottom: 2, wordBreak: "break-all" }}>{p.url}</div>
              <StateLine label="能否打開" s={avail} />
              <StateLine
                label="畫面"
                s={visual}
                extra={visual?.baseline_set_at ? `基準圖建立於 ${relativeTime(visual.baseline_set_at)}` : "尚無基準圖"}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                {visual?.baseline_set_at && ov.storageConfigured && (
                  <ChipBtn
                    label="看基準圖"
                    active={openImage?.key === `baseline:${p.pageId}`}
                    onClick={() => toggleImage(`baseline:${p.pageId}`, imageUrl(slug, `page=${p.pageId}&which=baseline`), "基準圖")}
                  />
                )}
                {canAccept && (
                  <button
                    onClick={() => acceptBaseline(p.pageId)}
                    disabled={acceptingPage === p.pageId}
                    style={{
                      fontSize: 11, padding: "3px 10px", borderRadius: 5, cursor: "pointer",
                      border: "1px solid var(--severity-medium)", background: "transparent",
                      color: armedPage === p.pageId ? "var(--red)" : "var(--severity-medium)",
                      fontWeight: armedPage === p.pageId ? 600 : 400,
                    }}
                  >
                    {acceptingPage === p.pageId ? "處理中…" : armedPage === p.pageId ? "再按一次確認（舊基準圖會被取代）" : "接受為新基準"}
                  </button>
                )}
              </div>
            </div>
          );
        })
      )}

      <SubLabel>最近 10 次巡檢</SubLabel>
      {ov.recent.length === 0 ? (
        <NoData>尚無巡檢紀錄。</NoData>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse", color: "var(--text-primary)" }}>
            <thead>
              <tr style={{ color: "var(--text-muted)", textAlign: "left" }}>
                <th style={{ padding: "3px 6px", fontWeight: 500 }}>時間</th>
                <th style={{ padding: "3px 6px", fontWeight: 500 }}>HTTP</th>
                <th style={{ padding: "3px 6px", fontWeight: 500 }}>結果</th>
                <th style={{ padding: "3px 6px", fontWeight: 500 }}>JS 錯誤</th>
                <th style={{ padding: "3px 6px", fontWeight: 500 }}>畫面</th>
                <th style={{ padding: "3px 6px", fontWeight: 500 }}>證據</th>
              </tr>
            </thead>
            <tbody>
              {ov.recent.map((r: ResultRow) => {
                const jsErrors = r.console_error_count + r.page_error_count;
                const visualText = r.visual_status
                  ? `${VISUAL_STATUS_LABEL[r.visual_status] ?? r.visual_status}${r.diff_ratio != null && r.visual_status === "diff" ? ` ${(r.diff_ratio * 100).toFixed(1)}%` : ""}`
                  : "—";
                return (
                  <tr key={r.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    <td style={{ padding: "3px 6px", whiteSpace: "nowrap" }} title={r.created_at}>
                      {relativeTime(r.created_at)}
                      {r.skipped_buckets > 0 ? `（漏跑 ${r.skipped_buckets} 次）` : ""}
                    </td>
                    <td style={{ padding: "3px 6px" }}>{r.http_status ?? "—"}</td>
                    <td style={{ padding: "3px 6px", color: r.ok ? "var(--green)" : "var(--red)" }}>{r.ok ? "正常" : failureLabel(r.failure_code)}</td>
                    <td style={{ padding: "3px 6px", color: jsErrors > 0 ? "var(--severity-medium)" : "var(--text-muted)" }}>{jsErrors}</td>
                    <td style={{ padding: "3px 6px" }} title={r.visual_note ?? undefined}>{visualText}</td>
                    <td style={{ padding: "3px 6px", whiteSpace: "nowrap" }}>
                      {r.evidence_key && (
                        <ChipBtn
                          label="截圖"
                          active={openImage?.key === `evidence:${r.id}`}
                          onClick={() => toggleImage(`evidence:${r.id}`, imageUrl(slug, `result=${r.id}&which=evidence`), "巡檢截圖")}
                        />
                      )}{" "}
                      {r.diff_key && (
                        <ChipBtn
                          label="差異"
                          active={openImage?.key === `diff:${r.id}`}
                          onClick={() => toggleImage(`diff:${r.id}`, imageUrl(slug, `result=${r.id}&which=diff`), "與基準圖的差異")}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {openImage && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{openImage.label}</div>
          {/* eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin route, not a static asset */}
          <img src={openImage.src} alt={openImage.label} style={{ maxWidth: "100%", border: "1px solid var(--border-subtle)", borderRadius: 6 }} />
        </div>
      )}

      {newestWithErrors && (
        <details style={{ marginTop: 10, fontSize: 11, color: "var(--text-secondary)" }}>
          <summary style={{ cursor: "pointer" }}>最近一次 JS 錯誤樣本（{relativeTime(newestWithErrors.created_at)}）</summary>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {newestWithErrors.errors_sample.map((e, i) => (
              <li key={i} style={{ fontFamily: "monospace", wordBreak: "break-all" }}>{String(e)}</li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}
