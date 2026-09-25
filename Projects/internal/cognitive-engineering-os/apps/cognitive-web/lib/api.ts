export class ApiError extends Error {
  constructor(public status: number, public detail: unknown) { super(`API ${status}`); }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const prefix = process.env.NEXT_PUBLIC_API_PREFIX ?? "/api";
  const response = await fetch(`${prefix}${path}`, { ...init, credentials: "same-origin", headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, payload?.detail ?? payload);
  return payload as T;
}
