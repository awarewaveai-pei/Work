import { NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "../../../../../lib/ops-role";
import { withFeature } from "@/lib/entitlements/grant";
import { generateImageEditPrompt, type ImageEditPromptInput } from "../../../../../lib/studio/image-edit-prompt";

export const runtime = "nodejs";
export const maxDuration = 30;

// Library grantFor calls inherit this request's billing account and actor (ADR 018 §2 開門規則 2).
export const POST = withFeature("studio.edit-prompt", handlePost);

async function handlePost(request: Request) {
  const resolved = resolveOpsRole(request);
  if (!canCreateAiImageJob(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }

  let body: ImageEditPromptInput;
  try {
    body = (await request.json()) as ImageEditPromptInput;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const result = await generateImageEditPrompt({ ...body, actorRole: resolved.role });
  if ("editPlan" in result) return NextResponse.json(result);
  return NextResponse.json(result, { status: result.status });
}
