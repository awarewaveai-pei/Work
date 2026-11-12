(async () => {
  await VideoWorkbench.ready;
  try { await VideoWorkbench.loadCapabilities(); } catch (error) { VideoWorkbench.reportError(error); }
  for (const item of []) {
    document.getElementById(item.id).textContent = JSON.stringify(
      await (await fetch(item.url)).json(),
    );
  }
  await VideoWorkbench.loadScripts(["../shared/subtitles.js","tool-processing.js","tools-workflows.js","tools-engine-host.js","tools-0.js"], "../scripts/");
  // Each tool's own code loads when it opens: TOOLS[].scripts in tools-0.js.
})().catch(VideoWorkbench.reportError);
