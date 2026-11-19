const assert = require('node:assert/strict'), S = require('../shared/episode-spine.js');
// N13: a cut made by 快速輸出 never goes through an edit file, so 剪輯/聲音/字幕 read "optional", not "todo". Expected arrays were taken from the code before N13.
const shots = [{ id: 's1', image: '/shot.png' }], rev = { reviewed: true, drafted: true };
const cutOf = (tool, step) => ({ steps: [{ id: 'j', step, tool, jobId: 'j', from: [], output: { url: '/cut.mp4' } }], outputs: [{ url: '/cut.mp4', jobId: 'j', editRevision: null, derivedFrom: null }] });

const quick = { shots, ...cutOf('quick-render', 'export') };
assert.deepEqual(S.stepStates(quick, [], rev), ['done', 'done', 'done', 'optional', 'optional', 'optional', 'optional', 'optional', 'done', 'optional', 'done', 'done']);
assert.equal(S.nextAction(S.stepStates(quick, [], { reviewed: false, drafted: false })).key, 'review', 'next action unchanged: 審片');
assert.equal(S.nextAction(S.stepStates(quick, [], rev)).key, 'done');
// Real work on a quick episode is still shown as done.
assert.equal(S.stepStates({ ...quick, steps: [...quick.steps, { id: 'v', step: 'sound', tool: 'voice', jobId: 'v', target: 'line:s1', from: [], output: { url: '/v.mp3' } }] }, [], rev)[6], 'done');

// With an edit file the three steps are what they were (done, and stale when a shot changed since the clip was made).
const row = (url) => ({ id: 'p1', clips: [{ kind: 'video', slot: 'shot:s1', asset: { url } }] }),
  edit = { engine: 'workbench-editor', projectId: 'p1' };
assert.deepEqual(S.stepStates({ shots, edit, ...cutOf('quick-render', 'export') }, [row('/shot.png')], rev), ['done', 'done', 'done', 'optional', 'optional', 'done', 'todo', 'todo', 'done', 'optional', 'done', 'done']);
assert.deepEqual(S.stepStates({ shots, edit, ...cutOf('quick-render', 'export') }, [row('/old.png')], rev), ['done', 'done', 'done', 'optional', 'optional', 'stale', 'todo', 'todo', 'done', 'optional', 'done', 'done']);
assert.deepEqual(S.stepStates({ shots, edit, ...cutOf('edit', 'edit') }, [row('/shot.png')], rev), ['done', 'done', 'done', 'optional', 'optional', 'done', 'todo', 'todo', 'done', 'optional', 'done', 'done']);
// A cut from the edit tool without a file (file deleted) is not a quick cut.
assert.deepEqual(S.stepStates({ shots, ...cutOf('edit', 'edit') }, [], rev).slice(5, 8), ['todo', 'todo', 'todo']);

// An older quick cut followed by a newer cut from the edit tool (edit file since deleted): the newest cut decides.
const mixed = { shots, steps: [...cutOf('quick-render', 'export').steps, { id: 'k', step: 'edit', tool: 'edit', jobId: 'k', from: [], output: { url: '/cut2.mp4' } }], outputs: [{ url: '/cut.mp4', jobId: 'j', editRevision: null, derivedFrom: null }, { url: '/cut2.mp4', jobId: 'k', editRevision: null, derivedFrom: null }] };
assert.deepEqual(S.stepStates(mixed, [], rev).slice(5, 8), ['todo', 'todo', 'todo']);

// Episodes without steps/outputs (spec §3.2): all 12 states as before.
assert.deepEqual(S.stepStates({ shots, outputs: [{ url: '/cut.mp4', jobId: 'j', editRevision: null }] }, [], rev), ['done', 'done', 'done', 'optional', 'optional', 'todo', 'todo', 'todo', 'done', 'optional', 'done', 'done']);
assert.deepEqual(S.stepStates({ shots: [] }, []), ['done', 'todo', 'todo', 'optional', 'optional', 'todo', 'todo', 'todo', 'todo', 'optional', 'optional', 'optional']);
assert.deepEqual(S.stepStates(undefined, undefined), S.stepStates({ shots: [] }, []));
console.log('PASS N13 quick-output cut: 剪輯/聲音/字幕 optional only without an edit file');
