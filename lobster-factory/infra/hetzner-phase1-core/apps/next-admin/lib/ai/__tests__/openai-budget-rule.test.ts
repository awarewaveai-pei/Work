// K21: an OpenAI reasoning model spends its thinking inside max_completion_tokens, so every limit sent to OpenAI comes
// from openAiCompletionBudget (text-model-options.ts). Written into a request body: the value is that call. Through the
// shared caller (openai-text.ts, which sends `a.maxTokens` as it is): every openAiText / askOpenAiText call passes it.
// A short article on gpt-6.2-sol was cut off at the FAQ (production, 2026-11-23) because one call site sent the bare limit.
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { ROOT, posix, sources } from "../../portal/__tests__/code-scan";

const SHARED_CALLER = "lib/ai/openai-text.ts";
const BUDGET = /^openAiCompletionBudget\(/;

function offenders(): string[] {
  const out: string[] = [];
  for (const file of [...sources(path.join(ROOT, "lib")), ...sources(path.join(ROOT, "app"))]) {
    const text = readFileSync(file, "utf8");
    if (!/max_completion_tokens|openAiText\(|askOpenAiText\(/.test(text)) continue;
    const rel = posix(file);
    const src = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, /\.tsx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const at = (n: ts.Node) => `${rel}:${src.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;
    const visit = (n: ts.Node): void => {
      if (ts.isPropertyAssignment(n) && n.name.getText(src) === "max_completion_tokens") {
        const v = n.initializer.getText(src);
        if (!(rel === SHARED_CALLER ? v === "a.maxTokens" : BUDGET.test(v))) out.push(`${at(n)} max_completion_tokens: ${v}`);
      }
      if (ts.isShorthandPropertyAssignment(n) && n.name.text === "max_completion_tokens") out.push(`${at(n)} max_completion_tokens (shorthand)`);
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && ["openAiText", "askOpenAiText"].includes(n.expression.text) && rel !== SHARED_CALLER) {
        const arg = n.arguments[0];
        const prop = arg && ts.isObjectLiteralExpression(arg)
          ? arg.properties.find((p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && p.name.getText(src) === "maxTokens") : undefined;
        if (!prop || !BUDGET.test(prop.initializer.getText(src))) out.push(`${at(n)} ${n.expression.text}({ maxTokens: ${prop?.initializer.getText(src) ?? "?"} })`);
      }
      ts.forEachChild(n, visit);
    };
    visit(src);
  }
  return out;
}

describe("every OpenAI output limit leaves room for thinking", () => {
  it("max_completion_tokens and openAiText/askOpenAiText maxTokens come from openAiCompletionBudget", () => {
    expect(offenders()).toEqual([]);
  });
});
