(async () => {
  if (VW_CONFIG.mode !== "http" || VW_CONFIG.apiBaseUrl !== "/api/vw") return;
  const context = VideoWorkbenchAdapters.context, button = document.getElementById("organizationPicker");
  const identity = await context.ready;
  // R10: never the whole client list -- the first NAV_FIRST (with the current client included) and a server search,
  // the same bootstrap modes the main system's client block uses (next-admin app/api/video/workbench/bootstrap).
  const bootstrap = async (query) => {
    const r = await fetch("/api/video/workbench/bootstrap?" + query, { credentials: "same-origin", cache: "no-store" });
    if (!r.ok) throw Error("無法讀取客戶清單，請重新整理");
    return r.json();
  };
  const first = await bootstrap("first=1&include=" + encodeURIComponent(identity.organizationId || ""));
  const current = first.orgs.find((o) => o.id === identity.organizationId);
  button.textContent = "客戶：" + (current?.name || "目前帳戶");
  button.hidden = false;
  button.disabled = first.total < 2;
  const channel = typeof BroadcastChannel === "function" ? new BroadcastChannel("vw-organization") : null;
  if (channel) channel.onmessage = ({ data }) => {
    if (data?.organizationId && data.organizationId !== identity.organizationId) {
      context.invalidate();
      const panel = document.createElement("dialog"), note = document.createElement("p"), reload = document.createElement("button");
      panel.className = "vw-organization-dialog";
      note.textContent = "另一個分頁已切換客戶。請重新整理後繼續；原客戶的資料仍保留。";
      reload.textContent = "重新整理"; reload.onclick = () => location.reload();
      panel.append(note, reload); document.body.append(panel); panel.showModal();
      panel.addEventListener("cancel", (e) => e.preventDefault());
    }
  };
  async function mediaReady() {
    if (!navigator.serviceWorker || VW_CONFIG.mediaCache === false) throw Error("目前無法安全切換媒體客戶，請重新整理後再試");
    const registration = await navigator.serviceWorker.getRegistration("/");
    if (!registration) throw Error("媒體服務尚未就緒，請重新整理後再試");
    await registration.update();
    // A switch requires the context-aware worker to control this page, not merely to have installed.
    for (let i = 0; i < 3; i++) {
      const ok = await new Promise((resolve) => {
        const port = new MessageChannel(), timer = setTimeout(() => { port.port1.close(); resolve(false); }, 1500);
        port.port1.onmessage = ({ data }) => {
          clearTimeout(timer); port.port1.close(); resolve(data?.type === "vw:media-context" && data.version === 1 && data.ok === true);
        };
        navigator.serviceWorker.controller?.postMessage({ type: "vw:media-context", version: 1 }, [port.port2]);
      });
      if (ok) return;
    }
    throw Error("媒體服務已更新，請重新整理後再切換客戶");
  }
  button.onclick = () => {
    const panel = document.createElement("dialog"), title = document.createElement("h2"), note = document.createElement("p"), close = document.createElement("button");
    panel.className = "vw-organization-dialog";
    title.textContent = "切換客戶";
    note.textContent = "先儲存並關閉其他分頁的編輯。切換後會重新載入；已送出的任務仍屬於原客戶。";
    close.textContent = "返回"; close.className = "minor"; close.onclick = () => panel.close();
    const search = document.createElement("input"), list = document.createElement("div"), hint = document.createElement("p");
    search.type = "search"; search.placeholder = "搜尋客戶..."; search.setAttribute("aria-label", "搜尋客戶"); search.hidden = first.scoped;
    list.setAttribute("role", "group"); list.setAttribute("aria-label", "客戶");
    panel.append(title, note, search, list, hint, close);
    let switching = false, timer = 0, asked = 0;
    const show = (orgs, more) => {
      list.replaceChildren(...orgs.map(choiceFor));
      hint.textContent = orgs.length ? more : "無符合的客戶";
    };
    const firstHint = first.total > first.orgs.length ? "共 " + first.total + " 個客戶，其他請用上面的搜尋。" : "";
    search.oninput = () => {
      clearTimeout(timer);
      const q = search.value.trim(), mine = ++asked;
      if (!q) return show(first.orgs, firstHint);
      timer = setTimeout(async () => {
        try { const j = await bootstrap("q=" + encodeURIComponent(q)); if (mine === asked) show(j.orgs, ""); }
        catch (error) { if (mine === asked) { list.replaceChildren(); hint.textContent = error.message; } }
      }, 250);
    };
    function choiceFor(org) {
      const choice = document.createElement("button");
      choice.type = "button"; choice.className = "minor"; choice.textContent = org.name; // dialog surface: the sidebar "nav" class is white text
      choice.disabled = org.id === identity.organizationId;
      choice.setAttribute("aria-pressed", String(choice.disabled));
      choice.onclick = async () => {
        if (switching) return;
        switching = true;
        let locked = false;
        panel.querySelectorAll("button").forEach((b) => { b.disabled = true; });
        search.disabled = true;   // a new result list mid-switch would bring back enabled buttons
        try {
          await mediaReady();
          await VideoWorkbench.flush();
          context.lock();
          locked = true;
          await context.withSwitchLock(async () => {
            const r = await fetch("/api/video/workbench/organization", {
              method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId: org.id }),
            });
            const result = await r.json();
            if (!r.ok) throw Error(result.error?.message || result.error || "切換客戶失敗");
            channel?.postMessage({ organizationId: org.id });
            location.assign("/");
          });
        } catch (error) {
          if (locked) context.unlock();
          switching = false;
          search.disabled = false;
          note.textContent = error.message;
          note.setAttribute("role", "alert");
          panel.querySelectorAll("button").forEach((b) => { b.disabled = b !== close && b.textContent === current?.name; });
        }
      };
      return choice;
    }
    show(first.orgs, firstHint);
    panel.addEventListener("close", () => panel.remove(), { once: true });
    document.body.append(panel); panel.showModal();
  };
})().catch(VideoWorkbench.reportError);
