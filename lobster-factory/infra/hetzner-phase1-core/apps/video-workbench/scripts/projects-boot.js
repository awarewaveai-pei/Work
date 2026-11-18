(async () => {
  await VideoWorkbench.ready;
  try { await VideoWorkbench.loadCapabilities(); } catch (error) {
    VideoWorkbench.reportError(Error("風格清單載入失敗，專案頁無法開啟，請重新整理：" + (error.message || error)));
    return;
  }
  for (const item of []) {
    document.getElementById(item.id).textContent = JSON.stringify(
      await (await fetch(item.url)).json(),
    );
  }
  await VideoWorkbench.loadScripts(["projects-bible.js", "projects-0.js"], "../scripts/");
})().catch(VideoWorkbench.reportError);
