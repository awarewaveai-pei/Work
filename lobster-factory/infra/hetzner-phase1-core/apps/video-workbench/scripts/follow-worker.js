// Offline Google EfficientDet-Lite0 inference, away from the UI thread.
importScripts("/assets/vision/vision_bundle.js");
let detector;
const patchCanvas = new OffscreenCanvas(24, 32),
  patchContext = patchCanvas.getContext("2d", { willReadFrequently: true });
function describe(bitmap, box) {
  patchContext.drawImage(
    bitmap,
    box.x * bitmap.width,
    box.y * bitmap.height,
    box.w * bitmap.width,
    box.h * bitmap.height,
    0,
    0,
    24,
    32,
  );
  const pixels = patchContext.getImageData(0, 0, 24, 32).data,
    hist = Array(64).fill(0),
    patch = [];
  for (let i = 0; i < pixels.length; i += 4) {
    hist[
      (pixels[i] >> 6) * 16 + (pixels[i + 1] >> 6) * 4 + (pixels[i + 2] >> 6)
    ]++;
    patch.push(
      pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114,
    );
  }
  const mean = patch.reduce((a, b) => a + b, 0) / patch.length,
    norm = Math.sqrt(patch.reduce((sum, n) => sum + (n - mean) ** 2, 0));
  return {
    hist: hist.map((n) => n / (24 * 32)),
    patch: patch.map((n) => (norm > 1 ? (n - mean) / norm : 0)),
  };
}
function templateMatch(bitmap, track) {
  if (!track?.patch?.length) return null;
  let best = null;
  for (const scale of [0.88, 1, 1.14]) {
  const w = Math.max(0.03, Math.min(0.98, (track.referenceW || track.w) * 2.5, Math.max((track.referenceW || track.w) * 0.5, track.w * scale))),
    h = Math.max(0.03, Math.min(0.98, (track.referenceH || track.h) * 2.5, Math.max((track.referenceH || track.h) * 0.5, track.h * scale)));
  for (let ix = -6; ix <= 6; ix++)
    for (let iy = -4; iy <= 4; iy++) {
      const x = Math.max(0, Math.min(1 - w, track.cx - w / 2 + ix * 0.01)),
        y = Math.max(0, Math.min(1 - h, track.cy - h / 2 + iy * 0.01)),
        box = { ...track, x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
      const descriptor = describe(bitmap, box),
        correlation = descriptor.patch.reduce(
          (sum, n, i) => sum + n * track.patch[i],
          0,
        ),
        reference = track.referencePatch || track.patch,
        identity = descriptor.patch.reduce((sum, n, i) => sum + n * reference[i], 0),
        distractor = Math.max(-1, ...(track.negativePatches || []).map((patch) => descriptor.patch.reduce((sum, n, i) => sum + n * patch[i], 0))),
        score = correlation - Math.hypot(ix * 0.01, iy * 0.01) * 0.5 - Math.abs(Math.log(scale)) * 0.1;
      if (correlation > 0.78 && identity > 0.45 && !(distractor > 0.55 && distractor > identity + 0.08) && (!best || score > best.score))
        best = {
          ...box,
          hist: descriptor.hist,
          patch: descriptor.patch,
          referencePatch: reference,
          score,
          source: "template",
        };
    }
  }
  return best;
}
async function initialize() {
  if (!detector)
    detector = Vision.ObjectDetector.createFromOptions(
      await Vision.FilesetResolver.forVisionTasks("/assets/vision/wasm"),
      {
        baseOptions: {
          modelAssetPath: "/assets/vision/person-detector.tflite",
          delegate: "CPU",
        },
        runningMode: "IMAGE",
        categoryAllowlist: ["person"],
        scoreThreshold: 0.3,
        maxResults: 12,
      },
    ).catch((error) => {
      detector = null;
      throw error;
    });
  return detector;
}
self.onmessage = async (event) => {
  const { id, bitmap, track } = event.data;
  try {
    const model = await initialize();
    if (!bitmap) {
      self.postMessage({ id, ready: true });
      return;
    }
    const result = model.detect(bitmap);
    const boxes = result.detections
      .map((d) => {
        const b = d.boundingBox,
          x = Math.max(0, Math.min(bitmap.width - 1, b.originX)),
          y = Math.max(0, Math.min(bitmap.height - 1, b.originY)),
          w = Math.max(1, Math.min(bitmap.width - x, b.width)),
          h = Math.max(1, Math.min(bitmap.height - y, b.height));
        const box = {
          x: x / bitmap.width,
          y: y / bitmap.height,
          w: w / bitmap.width,
          h: h / bitmap.height,
          cx: (x + w / 2) / bitmap.width,
          cy: (y + h / 2) / bitmap.height,
          score: d.categories[0].score,
        };
        return { ...box, ...describe(bitmap, box) };
      })
      .filter((b) => b.w > 0 && b.h > 0);
    self.postMessage({ id, boxes, template: templateMatch(bitmap, track) });
  } catch (error) {
    self.postMessage({ id, error: String(error.message || error) });
  } finally {
    bitmap?.close();
  }
};
