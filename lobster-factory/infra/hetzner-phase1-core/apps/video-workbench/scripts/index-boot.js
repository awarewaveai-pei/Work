(async () => {
  await VideoWorkbench.ready;
  for (const item of []) {
    document.getElementById(item.id).textContent = JSON.stringify(
      await (await fetch(item.url)).json(),
    );
  }
  await VideoWorkbench.loadScripts([
    "generator-product.js",
    "generator-director.js",
    "generator-library.js",
    "generator-controls.js",
    "generator-results.js",
    "generator-conversation.js",
    "index-0.js",
    "workspaces.js",
    "index-1.js",
  ], "scripts/");
  await generatorControlsInit();
})().catch(VideoWorkbench.reportError);
