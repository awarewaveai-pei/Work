// Plan U10 (D14): the shell's usage line. Reads the main system's GET /api/video/billing and /api/video/outcomes (same origin,
// the organization the shell is connected to) and shows plan, credits, provider profiles and outcome totals in the pop-over.
// Replaces next-admin's V/MediaOperationsPanel.tsx. Without the main system there is nothing to read: the line keeps its old text.
const USAGE_FALLBACK = "API · 依實際用量";

const usageOrg = () => VideoWorkbench.capabilities?.mainSystem?.organizationId || "";

async function usageRead(path) {
  try {
    const response = await fetch(path + "?" + new URLSearchParams({ organizationId: usageOrg() }), { credentials: "same-origin" });
    const body = await response.json().catch(() => ({}));
    return response.ok && body.ok === true ? { body } : { error: String(body.error || (response.status === 403 ? "沒有權限查看" : "讀取失敗（" + response.status + "）")) };
  } catch (error) {
    return { error: "讀取失敗：" + (error.message || error) };
  }
}

const usageLoad = async () => ({ billing: await usageRead("/api/video/billing"), outcomes: await usageRead("/api/video/outcomes") });

function usageSummary(billing) {
  if (!billing.body) return USAGE_FALLBACK;
  return "方案：" + (billing.body.account?.plan || "free") + " · 點數 " + (billing.body.balance ?? 0);
}

function usageRows(rows) {
  return '<div class="small-note">' + rows.map(([label, value]) => `${safe(label)}：${safe(value)}`).join("<br>") + "</div>";
}

function usageSection(title, result, render) {
  return `<h3 class="pop-title">${title}</h3>` + (result.error ? `<p class="small-note">${safe(result.error)}</p>` : render(result.body));
}

function usageHtml(cache) {
  const billing = (body) => {
    const account = body.account || {}, providers = (body.providers || []).map((p) => `${p.provider}（${p.mode}）`).join("、");
    return usageRows([
      ["方案", account.plan || "free"], ["狀態", account.status || "active"], ["點數餘額", body.balance ?? 0],
      ["每月點數上限", account.monthly_credit_limit ?? 0], ["點數硬上限", account.hard_credit_limit ?? 0],
      ["本期結束", account.current_period_end ? String(account.current_period_end).slice(0, 10) : "—"],
      ["已設定的生成服務", providers || "尚未設定"],
    ]);
  };
  const outcomes = (body) => usageRows([["成效事件數", body.count ?? 0], ...Object.entries(body.totals || {})]);
  return usageSection("方案與點數", cache.billing, billing) + usageSection("平台成效快照", cache.outcomes, outcomes);
}

function usageShow(cache) {
  $("usageBtn").textContent = usageSummary(cache.billing) + "⌄";
}

async function usagePanel() {
  await VideoWorkbench.loadCapabilities().catch(() => {});
  if (!usageOrg()) return pop('<h3 class="pop-title">方案與用量</h3><p class="small-note">這個工作台沒有連到主系統，API 費用依供應商用量計算，本機版不扣平台點數。</p>');
  pop('<h3 class="pop-title">方案與用量</h3><p class="small-note">讀取中…</p>');
  const cache = await usageLoad();
  usageShow(cache);
  // The user may have closed it or opened another panel while the read ran.
  if ($("popover").dataset.activePanel === "usage" && !$("popover").classList.contains("hidden")) pop(usageHtml(cache));
}

// Boot: the line shows the plan and credits as soon as the connection is known.
(async () => {
  await VideoWorkbench.loadCapabilities(); // /capabilities travels beside the state load: ready does not wait for it
  if (usageOrg()) usageShow(await usageLoad());
})().catch(() => {});
