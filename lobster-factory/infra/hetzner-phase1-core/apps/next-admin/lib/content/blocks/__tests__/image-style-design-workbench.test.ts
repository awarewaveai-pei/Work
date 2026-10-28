import { afterEach, describe, expect, it, vi } from "vitest";

import "../register-all";
import { byKind, listAll } from "../registry";

describe("image/style-design-workbench block", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENAI_API_KEY;
  });

  it("registers image and ai blocks separately", () => {
    const manifest = listAll();
    expect(manifest).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "image/style-design-workbench",
          kind: "image",
          enabled: true,
        }),
        expect.objectContaining({
          id: "ai/image-edit-prompt",
          kind: "ai",
          enabled: true,
        }),
      ]),
    );
  });

  it("builds a reusable styleAnchor", async () => {
    const block = byKind("image").find((b) => b.id === "image/style-design-workbench");
    expect(block).toBeDefined();

    const result = await block!.run({
      model: "flux-dev",
      mode: "image",
      style: "minimalist vector poster",
      subject: "a fluffy orange cat",
      referenceImages: ["data:image/png;base64,abc"],
      seed: 42,
      aspectRatio: "4:5",
      target: "pod",
      providerOptions: { printQuality: true },
    });

    expect(result).toMatchObject({
      ok: true,
      styleAnchor: {
        model: "flux-dev",
        mode: "image",
        stylePrompt: "minimalist vector poster",
        subject: "a fluffy orange cat",
        refs: ["data:image/png;base64,abc"],
        seed: 42,
        aspectRatio: "4:5",
        target: "pod",
        providerOptions: { printQuality: true },
      },
    });
  });

  it("builds an AI edit prompt plan using the shared text model menu", async () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: "Adjust the existing artwork into a brighter sunrise scene while preserving the central character, composition, linework, and cohesive watercolor style." } }],
      usage: { prompt_tokens: 12, completion_tokens: 18 },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const block = byKind("ai").find((b) => b.id === "ai/image-edit-prompt");
    expect(block).toBeDefined();

    const result = await block!.run({
      aiModel: "gpt-5.4-mini",
      imageModel: "flux-dev",
      editInstruction: "背景改成日出，人物和風格不要變",
      currentPrompt: "moody watercolor portrait",
      sourceImage: "data:image/png;base64,abc",
      target: "pod",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      ok: true,
      editPlan: {
        aiModel: "gpt-5.4-mini",
        aiModelGroup: "OpenAI",
        editInstruction: "背景改成日出，人物和風格不要變",
        sourceImage: "data:image/png;base64,abc",
        target: "pod",
        nextAction: {
          route: "/api/tools/studio/generate",
          body: {
            model: "flux-dev",
            referenceImages: ["data:image/png;base64,abc"],
            seed: null,
          },
        },
      },
    });
  });
});
