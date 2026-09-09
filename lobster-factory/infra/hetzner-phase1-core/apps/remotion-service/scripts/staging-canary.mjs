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

for (let attempt = 0; attempt < 180; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const response = await fetch(`http://127.0.0.1:8733/status/${encodeURIComponent(jobId)}`, { headers });
  const result = await response.json();
  if (result.status === "done") {
    console.log(`render_status=done url_https=${String(result.url ?? "").startsWith("https://")}`);
    process.exit(0);
  }
  if (result.status === "error") {
    console.log("render_status=error");
    process.exit(3);
  }
}
console.log("render_status=timeout");
process.exit(4);
