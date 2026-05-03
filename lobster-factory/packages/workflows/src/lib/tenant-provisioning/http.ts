export async function readJsonSafe(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export function summarizeApiError(status: number, body: unknown): string {
  if (body && typeof body === "object" && body !== null && "message" in body) {
    return `HTTP ${status}: ${String((body as { message?: unknown }).message)}`;
  }
  const s = typeof body === "string" ? body.slice(0, 400) : JSON.stringify(body).slice(0, 400);
  return `HTTP ${status}: ${s}`;
}
