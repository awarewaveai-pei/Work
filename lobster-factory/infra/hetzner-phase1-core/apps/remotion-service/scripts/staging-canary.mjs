const token = process.env.RENDER_AUTH_TOKEN;
if (!token) throw new Error("RENDER_AUTH_TOKEN is required");

const headers = { "content-type": "application/json", "x-render-token": token };
const submit = await fetch("http://127.0.0.1:8733/render", {
  method: "POST",
  headers,
  body: JSON.stringify({
    templateId: "dynamic-slideshow",
    props: { scenes: [{ durationInSeconds: 1, text: "staging canary" }] },
    durationInFrames: 30,
  }),
});
console.log(`submit_http=${submit.status}`);
if (!submit.ok) process.exit(2);
const { jobId } = await submit.json();

// R5: on every way it gives up (180 s, a failed poll) the canary cancels, so it never holds the one-at-a-time queue
let ended = false;
try {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const response = await fetch(`http://127.0.0.1:8733/status/${encodeURIComponent(jobId)}`, { headers, signal: AbortSignal.timeout(15000) });
    const result = await response.json();
    if (result.status === "done") {
      ended = true;
      console.log(`render_status=done url_https=${String(result.url ?? "").startsWith("https://")}`);
      process.exit(0);
    }
    if (result.status === "error" || result.status === "cancelled") {
      ended = true;
      console.log(`render_status=${result.status}`);
      process.exit(3);
    }
  }
  console.log("render_status=timeout");
} catch (e) {
  console.log(`render_status=poll_failed ${String(e?.message ?? e)}`);
} finally {
  if (!ended) {
    const cancel = await fetch(`http://127.0.0.1:8733/render/${encodeURIComponent(jobId)}`, { method: "DELETE", headers, signal: AbortSignal.timeout(10000) }).catch((e) => ({ status: String(e?.message ?? e) }));
    console.log(`cancel_http=${cancel.status}`);
  }
}
process.exit(4);
