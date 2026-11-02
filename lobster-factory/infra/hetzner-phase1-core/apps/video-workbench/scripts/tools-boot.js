(async () => {
  await SeedStar.ready;
  try { SeedStar.capabilities = await SeedStar.request('/capabilities', undefined, 'GET'); } catch (error) { SeedStar.reportError(error); }
  for (const item of []) {
    document.getElementById(item.id).textContent = JSON.stringify(
      await (await fetch(item.url)).json(),
    );
  }
  for (const file of ["../shared/subtitles.js","tool-processing.js","tools-workflows.js","tools-overlays.js","tools-voice-music.js","../shared/subtitle-parse.js","tools-subtitles.js","../shared/timebase.js","../shared/project-envelope.js","../shared/editor-model.js","tools-editor.js","tools-short.js","../shared/follow-math.js","tools-follow.js","tools-0.js"]) {
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "../scripts/" + file;
      s.onload = resolve;
      s.onerror = reject;
      document.body.append(s);
    });
  }
})().catch(SeedStar.reportError);
