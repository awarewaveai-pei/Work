import { NextResponse } from "next/server";
import { optionalRendererAuthHeaders } from "@/lib/content/video/renderer-auth";
import { allowedMediaProviders } from "@/lib/content/video/provider-policy";

export const dynamic = "force-dynamic";

function videoServiceHeaders(): Record<string, string> {
  return optionalRendererAuthHeaders("quick");
}

export async function GET() {
  const base = process.env.VIDEO_SERVICE_URL ?? "http://127.0.0.1:8732";
  try {
    const res = await fetch(`${base}/health`, {
      headers: videoServiceHeaders(),
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      capabilities?: {
        format_assets?: boolean;
        native_multiformat?: boolean;
        output_dimensions?: boolean;
        openai_tts?: boolean;
      };
      formats?: string[];
    };
    return NextResponse.json({
      ok: res.ok && body.ok === true,
      capabilities: {
        formatAssets: body.capabilities?.format_assets === true,
        nativeMultiformat: body.capabilities?.native_multiformat === true,
        outputDimensions: body.capabilities?.output_dimensions === true,
        openaiTts: body.capabilities?.openai_tts === true,
      },
      formats: Array.isArray(body.formats) ? body.formats : [],
      providers: allowedMediaProviders(),
    });
  } catch (e: unknown) {
    // Served on the video door: log the cause, answer a fixed message (the raw error can name internal hosts).
    console.warn(`[video/capabilities] ${e instanceof Error ? e.message : String(e)}`);
    return NextResponse.json({
      ok: false,
      capabilities: {
        formatAssets: false,
        nativeMultiformat: false,
        outputDimensions: false,
        openaiTts: false,
      },
      formats: [],
      providers: allowedMediaProviders(),
      error: "video-service capability check failed",
    }, { status: 503 });
  }
}
