import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Incident } from "@/lib/ops-inbox/types";

export async function summarizeIncidentWithGemini(incident: Incident): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("missing GEMINI_API_KEY");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  const prompt = [
    "You are an SRE assistant. Summarize this incident in Traditional Chinese.",
    "Respond in 1-2 concise sentences with probable root cause + first action.",
    "",
    `Source: ${incident.source}`,
    `Severity: ${incident.severity}`,
    `Service: ${incident.service ?? "(host-level)"}`,
    `Environment: ${incident.environment}`,
    `Title: ${incident.title}`,
    incident.message ? `Message: ${incident.message}` : "",
    `Occurrences: ${incident.occurrence_count}`,
    `Raw: ${JSON.stringify(incident.raw).slice(0, 5000)}`,
  ]
    .filter(Boolean)
    .join("\n");

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  return text || "Gemini 未回傳內容";
}
