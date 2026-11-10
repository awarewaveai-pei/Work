(async () => {
  await VideoWorkbench.ready;
  try { VideoWorkbench.capabilities = await VideoWorkbench.request('/capabilities', undefined, 'GET'); } catch (error) { VideoWorkbench.reportError(error); }
  for (const item of []) {
    document.getElementById(item.id).textContent = JSON.stringify(
      await (await fetch(item.url)).json(),
    );
  }
  await VideoWorkbench.loadScripts(["../shared/subtitles.js","tool-processing.js","tools-workflows.js","tools-overlays.js","tools-voice-music.js","../shared/subtitle-parse.js","tools-subtitles.js","../shared/timebase.js","../shared/project-envelope.js","../shared/editor-model.js","tools-editor.js","editor-panes/assets.js","editor-panes/text.js","editor-panes/audio.js","editor-panes/transition.js","editor-panes/effects.js","editor-panes/stickers.js","editor-panes/subtitles.js","editor-panes/fillers.js","editor-export-dialog.js","editor-project-list.js","tools-short.js","../shared/follow-math.js","tools-follow.js","tools-engine-host.js","tools-0.js","../shared/rig.js","../shared/compositor.js","tools-rig.js","tools-compositor.js","tools-3d.js"], "../scripts/");
})().catch(VideoWorkbench.reportError);
