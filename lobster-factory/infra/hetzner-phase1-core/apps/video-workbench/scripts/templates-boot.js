(async () => {
  await VideoWorkbench.ready;
  try { VideoWorkbench.capabilities = await VideoWorkbench.request('/capabilities', undefined, 'GET'); } catch (error) { VideoWorkbench.reportError(error); }
  // Our own example templates (examples/templates.json, public): everyone sees them.
  try { VideoWorkbench.exampleTemplates = (await (await fetch('/examples/templates.json')).json()).templates || []; } catch (error) { VideoWorkbench.exampleTemplates = []; console.warn('[video-workbench] template examples unavailable:', error.message); }
  for (const item of []) {
    document.getElementById(item.id).textContent = JSON.stringify(
      await (await fetch(item.url)).json(),
    );
  }
  await VideoWorkbench.loadScripts(["templates-0.js"], "../scripts/");
})().catch(VideoWorkbench.reportError);
