const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const EpisodeSpine = require('../shared/episode-spine.js'), Timebase = require('../shared/timebase.js');
const template = require('../backend/remotion.cjs').catalog[0];
const p = { id: 'edit', ratio: '16:9', timebase: { num: 30, den: 1 }, assets: [], clips: [
  { id: 'main', track: 'V1', startFrame: 0, durationFrames: 60 }, { id: 'voice', track: 'A1', startFrame: 0, durationFrames: 60 },
] };
const intro = { kind: 'template', templateId: template.id, fields: { headline: '已儲存的片頭' }, references: {}, seconds: 4, transition: 'crossfade', transitionSeconds: 0.5 };
let saved;
const ctx = vm.createContext({ console, structuredClone, crypto, EpisodeSpine, Timebase, document: { addEventListener() {} },
  ed: { title: {}, projects: [p], picks: new Set() }, edRegisterPane() {}, tool: 'other',
  VideoWorkbench: { assets: { list: async () => [] }, generations: { list: async () => [] }, capabilities: { remotion: true, remotionTemplates: [template] },
    spine: { setBookends: async (v) => { saved = v; } } },
  edSpineHit: () => ({ project: { id: 'project' }, episode: { id: 'ep', intro } }),
  edLines: () => [], EditorModel: require('../shared/editor-model.js'), esc: (x) => String(x ?? ''),
  edButton: () => '', edProbe: async (a) => a, edCheckpoint() {}, edMain: () => 'V1',
  edTime: (p, c, timing) => Object.assign(c, timing, { durationFrames: timing.duration ? Timebase.toFrames(timing.duration, p.timebase) : c.durationFrames }),
  edCommit: async () => {}, p,
});
vm.runInContext(fs.readFileSync(require.resolve('../scripts/editor-panes/text.js'), 'utf8'), ctx);
vm.runInContext('edTitlePane(p)', ctx);
assert.equal(ctx.ed.title.templateId, template.id);
assert.equal(ctx.ed.title.fields.headline, '已儲存的片頭');
assert.equal(ctx.ed.title.seconds, 4);
(async () => {
  ctx.end = intro;
  await vm.runInContext('edTitleInsert(p, { id: "intro", url: "/generated/intro.mp4", duration: 4 }, end)', ctx);
  assert.equal(saved.projectId, 'project');
  assert.equal(saved.intro.fields.headline, '已儲存的片頭');
  assert.equal(p.clips.find((c) => c.id === 'main').startFrame, 120);
  assert.equal(p.clips.find((c) => c.id === 'voice').startFrame, 120);
  assert.equal(p.clips.find((c) => c.id === 'main').transition, '溶解');
  assert.equal(p.clips.find((c) => c.id === 'main').transitionFrames, 15);
  assert.equal(p.clips.filter((c) => c.bookend === 'intro').length, 1);
  await assert.rejects(vm.runInContext('edTitleInsert(p, { id: "intro", duration: 4 }, end)', ctx), /已有片頭/);
  console.log('PASS U8.5: saved episode form, synchronized insertion, default transition, duplicate guard');
})().catch((e) => { console.error(e); process.exitCode = 1; });
