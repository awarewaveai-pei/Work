// A 409 LOGIN_CHOOSE_WORKSPACE from POST /auth/login (one email, several workspaces): the login page and the invite page
// both show each workspace as a button.
import { ApiError } from "./api";

export type Workspace = { tenant_id: string; name: string };

/** The workspaces a 409 LOGIN_CHOOSE_WORKSPACE offers; anything else is not a choice. */
export function workspacesOf(reason: unknown): Workspace[] | null {
  if (!(reason instanceof ApiError) || reason.status !== 409) return null;
  const detail = reason.detail as { code?: unknown; workspaces?: unknown } | null;
  if (!detail || detail.code !== "LOGIN_CHOOSE_WORKSPACE" || !Array.isArray(detail.workspaces)) return null;
  return detail.workspaces.filter((item): item is Workspace => typeof item?.tenant_id === "string" && typeof item?.name === "string");
}
