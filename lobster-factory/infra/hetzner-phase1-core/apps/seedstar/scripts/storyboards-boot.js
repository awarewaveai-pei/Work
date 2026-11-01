(async () => {
  await SeedStar.ready;
  for (const item of [
    { id: "aw-storyboard-state", url: "../assets/storyboards-data.json" },
  ]) {
    document.getElementById(item.id).textContent = JSON.stringify(
      await (await fetch(item.url)).json(),
    );
  }
  for (const file of ["storyboards-0.js"]) {
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "../scripts/" + file;
      s.onload = resolve;
      s.onerror = reject;
      document.body.append(s);
    });
  }
})().catch(SeedStar.reportError);
