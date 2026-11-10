(async () => {
  await SeedStar.ready;
  // Our own examples (examples/storyboards.json, public) load for everyone and come first. The third-party seedstar
  // reference cards (backend/reference.cjs) are added for staff only. Empty state only when neither exists; "加入更多分鏡資料"
  // (import) works either way.
  const cards = [];
  try {
    const own = await (await fetch("/examples/storyboards.json")).json();
    if (Array.isArray(own.cards)) cards.push(...own.cards);
  } catch (error) {
    console.warn("[video-workbench] storyboard examples unavailable:", error.message);
  }
  try {
    const caps = await VideoWorkbench.request("/capabilities", undefined, "GET");
    VideoWorkbench.capabilities = caps;
    if (caps.reference) {
      const response = await fetch("/reference/storyboards-data.json");
      if (response.ok) {
        const data = JSON.parse(
          (await response.text()).replace(/(?:\.\.\/)?assets\/image-/g, "/reference/image-"),
        );
        if (Array.isArray(data.cards)) cards.push(...data.cards);
      }
    }
  } catch (error) {
    console.warn("[video-workbench] storyboard reference data unavailable:", error.message);
  }
  document.getElementById("aw-storyboard-state").textContent = JSON.stringify({ cards });
  if (!cards.length) document.getElementById("empty").textContent = "還沒有分鏡資料";
  await VideoWorkbench.loadScripts(["storyboards-0.js"], "../scripts/");
})().catch(SeedStar.reportError);
