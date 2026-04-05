#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const provider = (process.argv[2] || "openai").toLowerCase();

function requiredEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

async function callOpenAI(prompt, model) {
  const apiKey = requiredEnv("OPENAI_API_KEY");
  const chosenModel = model || process.env.OPENAI_MODEL || "gpt-4o-mini";

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: chosenModel,
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || "(empty response)";
}

async function callAnthropic(prompt, model) {
  const apiKey = requiredEnv("ANTHROPIC_API_KEY");
  const chosenModel = model || process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-latest";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: chosenModel,
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!res.ok) throw new Error(`Anthropic error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = (data?.content || []).filter((b) => b?.type === "text").map((b) => b.text).join("\n");
  return text || "(empty response)";
}

async function callGemini(prompt, model) {
  const apiKey = requiredEnv("GEMINI_API_KEY");
  const chosenModel = model || process.env.GEMINI_MODEL || "gemini-2.5-flash";

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(chosenModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    })
  });

  if (!res.ok) throw new Error(`Gemini error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts.map((p) => p?.text).filter(Boolean).join("\n");
  return text || "(empty response)";
}

async function callProvider(prompt, model) {
  if (provider === "openai") return callOpenAI(prompt, model);
  if (provider === "anthropic") return callAnthropic(prompt, model);
  if (provider === "gemini") return callGemini(prompt, model);
  throw new Error(`Unsupported provider: ${provider}`);
}

function buildSummarizePrompt(text, style, maxBullets) {
  return [
    "You are a concise business assistant.",
    `Summarize the following content in ${maxBullets} bullets.`,
    `Summary style: ${style}.`,
    "Use Traditional Chinese unless the input is clearly in another language.",
    "",
    "Content:",
    text
  ].join("\n");
}

function buildTranslatePrompt(text, targetLanguage, tone) {
  return [
    "You are a professional translator.",
    `Translate the following text to ${targetLanguage}.`,
    `Keep tone: ${tone}.`,
    "Do not add explanations, return only translated text.",
    "",
    "Text:",
    text
  ].join("\n");
}

function buildActionItemsPrompt(text) {
  return [
    "You are an operations assistant.",
    "Extract action items from the content below.",
    "Return a markdown table with columns: Owner | Action | Deadline | Priority.",
    "If some fields are unknown, use TBD.",
    "",
    "Content:",
    text
  ].join("\n");
}

function buildReplyDraftPrompt(context, goal, tone) {
  return [
    "You are an executive communication assistant.",
    `Draft a reply based on the context and goal below.`,
    `Tone: ${tone}.`,
    "Output format:",
    "1) Subject",
    "2) Message body",
    "3) Optional short follow-up line",
    "",
    "Context:",
    context,
    "",
    "Goal:",
    goal
  ].join("\n");
}

function buildMeetingNotesPrompt(text) {
  return [
    "You are a project manager assistant.",
    "Convert the meeting notes into this structure:",
    "1) Decisions",
    "2) Risks/Blockers",
    "3) Action Items",
    "4) Next Meeting Agenda",
    "Use concise bullets.",
    "",
    "Meeting notes:",
    text
  ].join("\n");
}

const server = new Server(
  { name: `local-${provider}-mcp-wrapper`, version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "ask",
      description: `Send a prompt to ${provider}`,
      inputSchema: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Prompt text" },
          model: { type: "string", description: "Optional model override" }
        },
        required: ["prompt"],
        additionalProperties: false
      }
    },
    {
      name: "summarize_text",
      description: "Summarize long text into concise bullets",
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string", description: "Source text to summarize" },
          style: { type: "string", description: "summary style: executive|brief|detailed" },
          max_bullets: { type: "number", description: "maximum number of bullet points" },
          model: { type: "string", description: "Optional model override" }
        },
        required: ["text"],
        additionalProperties: false
      }
    },
    {
      name: "translate_text",
      description: "Translate text with tone control",
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string", description: "Source text to translate" },
          target_language: { type: "string", description: "Target language (e.g. English, Traditional Chinese)" },
          tone: { type: "string", description: "Tone style, e.g. professional, friendly, formal" },
          model: { type: "string", description: "Optional model override" }
        },
        required: ["text", "target_language"],
        additionalProperties: false
      }
    },
    {
      name: "extract_action_items",
      description: "Extract actionable tasks with owners and deadlines",
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string", description: "Source notes or transcript" },
          model: { type: "string", description: "Optional model override" }
        },
        required: ["text"],
        additionalProperties: false
      }
    },
    {
      name: "draft_reply",
      description: "Draft email/chat replies based on context and goal",
      inputSchema: {
        type: "object",
        properties: {
          context: { type: "string", description: "Conversation context or incoming message" },
          goal: { type: "string", description: "What outcome the reply should achieve" },
          tone: { type: "string", description: "Tone style, e.g. concise, diplomatic, direct" },
          model: { type: "string", description: "Optional model override" }
        },
        required: ["context", "goal"],
        additionalProperties: false
      }
    },
    {
      name: "meeting_notes_to_plan",
      description: "Turn meeting notes into decisions, risks, actions, and agenda",
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string", description: "Raw meeting notes or transcript" },
          model: { type: "string", description: "Optional model override" }
        },
        required: ["text"],
        additionalProperties: false
      }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const args = request.params.arguments || {};
  const model = typeof args.model === "string" ? args.model : undefined;
  let prompt = "";

  if (request.params.name === "ask") {
    prompt = typeof args.prompt === "string" ? args.prompt : "";
    if (!prompt.trim()) {
      throw new Error("'prompt' is required and must be a non-empty string");
    }
  } else if (request.params.name === "summarize_text") {
    const text = typeof args.text === "string" ? args.text : "";
    const style = typeof args.style === "string" && args.style.trim() ? args.style.trim() : "executive";
    const maxBullets = Number.isFinite(args.max_bullets) ? Math.max(3, Math.min(15, Math.floor(args.max_bullets))) : 7;
    if (!text.trim()) {
      throw new Error("'text' is required and must be a non-empty string");
    }
    prompt = buildSummarizePrompt(text, style, maxBullets);
  } else if (request.params.name === "translate_text") {
    const text = typeof args.text === "string" ? args.text : "";
    const targetLanguage = typeof args.target_language === "string" ? args.target_language : "";
    const tone = typeof args.tone === "string" && args.tone.trim() ? args.tone.trim() : "professional";
    if (!text.trim() || !targetLanguage.trim()) {
      throw new Error("'text' and 'target_language' are required and must be non-empty strings");
    }
    prompt = buildTranslatePrompt(text, targetLanguage, tone);
  } else if (request.params.name === "extract_action_items") {
    const text = typeof args.text === "string" ? args.text : "";
    if (!text.trim()) {
      throw new Error("'text' is required and must be a non-empty string");
    }
    prompt = buildActionItemsPrompt(text);
  } else if (request.params.name === "draft_reply") {
    const context = typeof args.context === "string" ? args.context : "";
    const goal = typeof args.goal === "string" ? args.goal : "";
    const tone = typeof args.tone === "string" && args.tone.trim() ? args.tone.trim() : "concise";
    if (!context.trim() || !goal.trim()) {
      throw new Error("'context' and 'goal' are required and must be non-empty strings");
    }
    prompt = buildReplyDraftPrompt(context, goal, tone);
  } else if (request.params.name === "meeting_notes_to_plan") {
    const text = typeof args.text === "string" ? args.text : "";
    if (!text.trim()) {
      throw new Error("'text' is required and must be a non-empty string");
    }
    prompt = buildMeetingNotesPrompt(text);
  } else {
    throw new Error(`Unknown tool: ${request.params.name}`);
  }

  const output = await callProvider(prompt, model);
  return {
    content: [{ type: "text", text: output }]
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);
