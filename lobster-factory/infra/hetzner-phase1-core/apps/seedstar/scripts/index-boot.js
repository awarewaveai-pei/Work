(async () => {
  await SeedStar.ready;
  for (const item of []) {
    document.getElementById(item.id).textContent = JSON.stringify(
      await (await fetch(item.url)).json(),
    );
  }
  for (const file of [
    "generator-product.js",
    "generator-director.js",
    "generator-library.js",
    "generator-controls.js",
    "generator-results.js",
    "generator-conversation.js",
    "index-0.js",
    "workspaces.js",
    "index-1.js",
  ]) {
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "scripts/" + file;
      s.onload = resolve;
      s.onerror = reject;
      document.body.append(s);
    });
  }
  await generatorControlsInit();
})().catch(SeedStar.reportError);
