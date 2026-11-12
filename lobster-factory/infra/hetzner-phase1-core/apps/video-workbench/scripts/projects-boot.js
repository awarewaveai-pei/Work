(async () => {
  await VideoWorkbench.ready;
  try { await VideoWorkbench.loadCapabilities(); } catch (error) { VideoWorkbench.reportError(error); }
  for (const item of []) {
    document.getElementById(item.id).textContent = JSON.stringify(
      await (await fetch(item.url)).json(),
    );
  }
  await VideoWorkbench.loadScripts(["projects-0.js"], "../scripts/");
})().catch(VideoWorkbench.reportError);
