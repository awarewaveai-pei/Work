(async () => {
  await VideoWorkbench.ready;
  for (const item of []) {
    document.getElementById(item.id).textContent = JSON.stringify(
      await (await fetch(item.url)).json(),
    );
  }
  await VideoWorkbench.loadScripts(["characters-0.js"], "../scripts/");
})().catch(VideoWorkbench.reportError);
