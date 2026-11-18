(async () => {
  if (VW_CONFIG.mode !== "http" || VW_CONFIG.apiBaseUrl !== "/api/vw") return;
  const context = VideoWorkbenchAdapters.context, button = document.getElementById("organizationPicker");
  const identity = await context.ready;
  const response = await fetch("/api/video/workbench/bootstrap", { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw Error("無法讀取客戶清單，請重新整理");
  const { organizations } = await response.json();
  const current = organizations.find((o) => o.id === identity.organizationId);
  button.textContent = "客戶：" + (current?.name || "目前帳戶");
  button.hidden = false;
  button.disabled = organizations.length < 2;
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
    panel.append(title, note, close);
    let switching = false;
    for (const org of organizations) {
      const choice = document.createElement("button");
      choice.type = "button"; choice.className = "nav"; choice.textContent = org.name;
      choice.disabled = org.id === identity.organizationId;
      choice.onclick = async () => {
        if (switching) return;
        switching = true;
        let locked = false;
        panel.querySelectorAll("button").forEach((b) => { b.disabled = true; });
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
          note.textContent = error.message;
          note.setAttribute("role", "alert");
          panel.querySelectorAll("button").forEach((b) => { b.disabled = b !== close && b.textContent === current?.name; });
        }
      };
      panel.append(choice);
    }
    panel.addEventListener("close", () => panel.remove(), { once: true });
    document.body.append(panel); panel.showModal();
  };
})().catch(VideoWorkbench.reportError);
