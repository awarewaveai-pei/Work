const assert = require('node:assert/strict');
const math = require('../shared/follow-math.js');
// Two similarly dressed people: proximity and a whole-frame color histogram alone
// favor the wrong subject. The selected patch and known distractor must matter.
const targetPatch = [0.5, -0.5, 0.5, -0.5], otherPatch = [0.5, 0.5, -0.5, -0.5];
const previous = { x: .3, y: .1, cx: .4, cy: .5, w: .2, h: .8, hist: [1, 0], patch: targetPatch, negativePatches: [otherPatch] };
const target = { ...previous, x: .32, cx: .42, score: .8 };
const distractor = { ...previous, x: .3, cx: .4, patch: otherPatch, score: .9 };
assert.equal(math.match([distractor, target], previous, previous.hist), target);
assert.equal(math.match([distractor], previous, previous.hist), null);
assert.equal(math.match([distractor], { ...previous, patch: otherPatch, referencePatch: targetPatch, negativePatches: [] }, previous.hist), null, 'gradually changed recent patch must not replace the selected identity reference');
assert.equal(math.match([{ ...target, score: .32 }], previous, previous.hist), null);
assert.equal(math.match([target, { ...target }], previous, previous.hist), null);
const points = [
  { time: 0, x: .2, y: .5 },
  { time: .125, x: .2, y: .5, lost: true },
  { time: .25, x: .2, y: .5, lost: true },
  { time: .375, x: .8, y: .5 },
  { time: .5, x: .8, y: .5, lost: true },
];
assert.deepEqual(math.reviews(points), [
  { time: .125, end: .25, key: '0.125' }, { time: .5, end: .5, key: '0.500' },
]);
assert.equal(math.smooth(points)[1].x, .2, 'uncertain hold must not drift toward a later correction');
console.log('PASS similarly dressed crossing subjects, known distractor rejection, weak detection rejection, ambiguous match rejection, distinct review intervals and held crop');
// Exercise the actual asynchronous state machine with deterministic frame observations.
// The real-video/model/export check is separate; this regression covers missed-frame locks
// and confirms that restoring an old confirmation cannot bypass a new review.
const vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
(async () => {
  const context = vm.createContext({
    console, FollowMath: math, structuredClone, setTimeout, clearTimeout,
    document: { addEventListener() {}, querySelector() { return null; } },
    window: { addEventListener() {} }, values: { followStart: 0, followEnd: 5, followAnchors: [{ time: 0, box: previous }] },
    files: { src: { url: '/test.mp4', duration: 5 } }, tool: 'follow', render() {}, saveDraft() {},
    outputCalls: 0, VideoWorkbench: { generations: { create: async () => ({ id: 'test' }) }, showJob() {} },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../scripts/tools-follow.js'), 'utf8'), context);
  vm.runInContext(`
    let observed = 0;
    followMedia = async () => ({});
    followRelease = () => {};
    followBitmap = async () => ({ close() {} });
    followWorkerCall = async () => {
      observed++;
      return observed <= 3 ? { boxes: [${JSON.stringify(target)}], template: null }
        : { boxes: [${JSON.stringify(distractor)}], template: null };
    };
    VideoWorkbench.generations.create = async () => { outputCalls++; return { id: 'test' }; };
  `, context);
  await vm.runInContext('followTrack()', context);
  assert.equal(vm.runInContext('observed', context), 7, 'four misses must stop automatic reacquisition');
  assert(vm.runInContext('values.followTrack.filter(p => p.time > 1).every(p => p.lost)', context));
  assert(vm.runInContext('followNeedsReview()', context));
  await assert.rejects(vm.runInContext('toolFollowAction("follow-render")', context), /未確認/);
  assert.equal(context.outputCalls, 0);
  const key = vm.runInContext('followReviews()[0].key', context);
  await vm.runInContext(`toolFollowAction("follow-keep:${key}")`, context);
  assert(!vm.runInContext('followNeedsReview()', context));
  context.values.followReviewed.fingerprint = 'old-project';
  assert(vm.runInContext('followNeedsReview()', context));
  await vm.runInContext('followTrack()', context);
  assert.equal(context.values.followReviewed.keys.length, 0, 'retracking clears confirmation');
  await vm.runInContext('toolFollowAction("follow-clear")', context);
  assert.equal(context.values.followReviewed, undefined);
  console.log('PASS real follow state machine: four misses lock reacquisition; unresolved export blocked; explicit hold and fingerprint binding; retracking/clearing removes confirmation');
})().catch((error) => { console.error(error); process.exitCode = 1; });
