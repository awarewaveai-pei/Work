(async () => {
  await SeedStar.ready;
  // Storyboard data is third-party reference material (backend/reference.cjs): staff only. Anyone else, or a failed
  // read, gets the empty state; "加入更多分鏡資料" (import) still works on it.
  let data = {};
  try {
    const caps = await VideoWorkbench.request("/capabilities", undefined, "GET");
    VideoWorkbench.capabilities = caps;
    if (caps.reference) {
      const response = await fetch("/reference/storyboards-data.json");
      if (response.ok)
        data = JSON.parse(
          (await response.text()).replace(/(?:\.\.\/)?assets\/image-/g, "/reference/image-"),
        );
    }
  } catch (error) {
    console.warn("[video-workbench] storyboard reference data unavailable:", error.message);
  }
  document.getElementById("aw-storyboard-state").textContent = JSON.stringify(data);
  if (!Array.isArray(data.cards))
    document.getElementById("empty").textContent = "還沒有分鏡資料";
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
