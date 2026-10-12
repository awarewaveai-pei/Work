"use client";
import React from "react";
import { ResultPage } from "./result/ResultPage";
import type { FormField } from "../lib/form-model";

type Demo = { display?: { name_zh?: string; name_en?: string; blurb_zh?: string } | null; fields: unknown[]; record: Record<string, unknown>; result: unknown; gateResults: unknown[]; manifest: unknown[] };

/** The 示範分析 page: the demo fixture on the real result page, in demo mode (nothing writes). */
export function DemoResult({ demo, names, lessons, lesson, families }: { demo: Demo; names: Record<string, string>; lessons: Record<string, string>; lesson: string | null; families: Record<string, string> }) {   // lessons are looked up on the server: they never ship in the bundle
  const result = demo.result as React.ComponentProps<typeof ResultPage>["result"];
  return <ResultPage demo result={result} record={demo.record} manifest={demo.manifest as React.ComponentProps<typeof ResultPage>["manifest"]}
    gateResults={demo.gateResults as React.ComponentProps<typeof ResultPage>["gateResults"]} display={demo.display ?? undefined}
    fields={demo.fields as FormField[]} names={names} lessons={lessons} lesson={lesson}
    family={families[result.method_id.split(".")[0]] ?? null} />;
}
