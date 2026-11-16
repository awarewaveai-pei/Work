// What the vendors that run on a main-system internal route share (caption-reburn.cjs U7, quick-render.cjs U5): submit
// once through main.call (backend/main-system.cjs), poll until done, fetch the finished file.
const fail = (message, status) => Object.assign(Error(message), status ? { status } : {});
const refusal = (what, r) => fail(what + "：" + String(r.value?.error || "HTTP " + r.status).slice(0, 200));

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(timer), reject(signal.reason)), { once: true });
  });
}

// One main.call; a network error answers null (poll again) unless the job was cancelled.
async function tryCall(main, route, options) {
  try {
    return await main.call(route, options);
  } catch (e) {
    if (options.signal?.aborted) throw e;
    return null;
  }
}

// Waits everyMs, then runs step() until it answers true; past limitMs throws `timeout`.
async function poll({ signal, everyMs, limitMs, timeout, step }) {
  const deadline = Date.now() + limitMs;
  for (;;) {
    await sleep(everyMs, signal);
    if (Date.now() > deadline) throw fail(timeout);
    if (await step()) return;
  }
}

// The finished file's bytes, refused past `max`; `what` names it in the error.
async function download(url, { fetchImpl, signal, max, what, timeoutMs = 300000 }) {
  let file;
  try {
    file = await fetchImpl(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) });
  } catch (e) {
    if (signal.aborted) throw e;
    throw fail(what + "下載失敗");
  }
  if (!file.ok) throw fail(what + "下載失敗（HTTP " + file.status + "）");
  if (Number(file.headers?.get?.("content-length")) > max) throw fail(what + "檔案過大");
  const buffer = Buffer.from(await file.arrayBuffer());
  if (!buffer.length || buffer.length > max) throw fail(what + "檔案大小無效");
  return buffer;
}

module.exports = { fail, refusal, sleep, tryCall, poll, download };
