import { NextResponse } from "next/server";
import { canCreateAiImageJob, resolveOpsRole } from "../../../../../lib/ops-role";
import { generateTarotImage, type TarotProvider } from "../../../../../lib/tarot/image-gen";

export const runtime = "nodejs";
export const maxDuration = 60;

interface GenerateBody {
  provider?: string;
  prompt?: string;
  referenceImage?: string | null;
  seed?: number | null;
}

function isProvider(v: unknown): v is TarotProvider {
  return v === "flux" || v === "openai";
}

export async function POST(request: Request) {
  const resolved = resolveOpsRole(request);
  if (!canCreateAiImageJob(resolved.role)) {
    return NextResponse.json({ ok: false, error: "forbidden_role", role: resolved.role }, { status: 403 });
  }

  let body: GenerateBody;
  try {
    body = (await request.json()) as GenerateBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!isProvider(body.provider)) {
    return NextResponse.json({ ok: false, error: "provider must be 'flux' or 'openai'" }, { status: 400 });
  }
  if (!body.prompt || body.prompt.trim().length < 3) {
    return NextResponse.json({ ok: false, error: "prompt is required (min length 3)" }, { status: 400 });
  }
  if (body.referenceImage != null) {
    if (!/^data:image\/(png|jpe?g|webp);base64,/.test(body.referenceImage)) {
      return NextResponse.json(
        { ok: false, error: "referenceImage must be a base64 image data URL (png/jpeg/webp)" },
        { status: 400 },
      );
    }
    if (body.referenceImage.length > 12_000_000) {
      return NextResponse.json({ ok: false, error: "referenceImage too large (max ~9MB)" }, { status: 413 });
    }
  }
  if (body.seed != null && (!Number.isInteger(body.seed) || body.seed < 0)) {
    return NextResponse.json({ ok: false, error: "seed must be a non-negative integer" }, { status: 400 });
  }

  const result = await generateTarotImage({
    provider: body.provider,
    prompt: body.prompt,
    referenceImage: body.referenceImage ?? null,
    seed: body.seed ?? null,
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: 502 });
  }
  return NextResponse.json(result);
}
