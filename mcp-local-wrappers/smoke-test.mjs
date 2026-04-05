const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

async function testOpenAI(model, marker) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: `Reply exactly: ${marker}` }],
      temperature: 0,
    }),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, body: text.slice(0, 300) };
}

async function testAnthropic(model, marker) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 30,
      messages: [{ role: "user", content: `Reply exactly: ${marker}` }],
    }),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, body: text.slice(0, 300) };
}

async function testGemini(model, marker) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `Reply exactly: ${marker}` }] }],
    }),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, body: text.slice(0, 300) };
}

const tests = [
  ["chatgpt-fast", () => testOpenAI("gpt-4o-mini", "CHATGPT_FAST_OK")],
  ["chatgpt-latest", () => testOpenAI("gpt-4.1", "CHATGPT_LATEST_OK")],
  ["claude-fast", () => testAnthropic("claude-3-haiku-20240307", "CLAUDE_FAST_OK")],
  ["claude-latest", () => testAnthropic("claude-sonnet-4-20250514", "CLAUDE_LATEST_OK")],
  ["gemini-fast", () => testGemini("gemini-2.5-flash", "GEMINI_FAST_OK")],
  ["gemini-latest", () => testGemini("gemini-2.5-pro", "GEMINI_LATEST_OK")],
];

for (const [name, fn] of tests) {
  try {
    const out = await fn();
    console.log(`\n=== ${name} ===`);
    console.log(`ok=${out.ok} status=${out.status}`);
    console.log(out.body);
  } catch (e) {
    console.log(`\n=== ${name} ===`);
    console.log(`exception: ${e.message}`);
  }
}
