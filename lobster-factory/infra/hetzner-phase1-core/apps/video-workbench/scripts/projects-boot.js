(async () => {
  await VideoWorkbench.ready;
  for (const item of []) {
    document.getElementById(item.id).textContent = JSON.stringify(
      await (await fetch(item.url)).json(),
    );
  }
  for (const file of ["projects-0.js"]) {
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "../scripts/" + file;
      s.onload = resolve;
      s.onerror = reject;
      document.body.append(s);
    });
  }
})().catch(VideoWorkbench.reportError);
