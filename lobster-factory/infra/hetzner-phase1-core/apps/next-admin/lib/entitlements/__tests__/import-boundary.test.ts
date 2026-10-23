import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../../..");
const SDK = /^(?:@anthropic-ai\/sdk|openai|replicate|@fal-ai(?:\/[^/]+)?|@google\/(?:genai|generative-ai))(?:\/|$)/;
const TABLES = new Set(["plans", "organization_entitlements", "organization_product_subscriptions", "media_credit_ledger", "payment_events", "credit_wallet_holds"]);
// These are separate boundaries: portal pages may read subscription state, but may not import SDKs.
const sdkAllowed = (file: string) => file === "lib/ai/gateway.ts" || file.startsWith("lib/entitlements/");
const tableAllowed = (file: string) => file.startsWith("lib/entitlements/") || file.startsWith("app/portal/");
// Raw HTTP to a paid model provider: the origin may only be spelled in the gateway (providerUrl asserts the grant).
const PROVIDER_HOST = /(?:api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com|api\.replicate\.com)/i;   // hosts are case-insensitive
const PROVIDER_ADAPTERS = new Set(["lib/payments/woo.ts", "lib/auth/sources/awarewave-wp.ts", "lib/crm/fluentcrm.ts"]);

function providerDependency(spec: string, file: string): boolean {
  // Consumers may call a public adapter; vendor packages and the old bridge transport are private.
  const resolved = spec.startsWith("@/") ? spec.slice(2)
    : spec.startsWith(".") ? path.posix.normalize(path.posix.join(path.posix.dirname(file), spec)) : null;
  if (resolved) {
    if (PROVIDER_ADAPTERS.has(`${resolved.replace(/\.[cm]?[jt]sx?$/, "")}.ts`)) return false;
    return /(?:^|\/)(?:wp-bridge[^/]*|woocommerce[^/]*|fluentcrm[^/]*)(?:\/|$)/i.test(resolved);
  }
  return /(?:^|[/@-])(?:wp-bridge|wordpress|woocommerce|fluentcrm)(?:[/@-]|$)/i.test(spec);
}

const isPlus = (n: ts.Node): n is ts.BinaryExpression => ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken;
const unwrap = (n: ts.Node): ts.Node => (ts.isParenthesizedExpression(n) ? unwrap(n.expression) : n);
const insidePlus = (n: ts.Node): boolean => {
  let p = n.parent;
  while (p && ts.isParenthesizedExpression(p)) p = p.parent;
  return !!p && isPlus(p);
};
/** A string literal, template or `+` chain that is not itself part of a bigger `+` chain (checked once, whole). */
function isStringTop(n: ts.Node): boolean {
  return (ts.isStringLiteralLike(n) || ts.isTemplateExpression(n) || isPlus(n)) && !insidePlus(n);
}
/** The literal text a string expression contributes; a non-literal operand contributes nothing (joins its neighbours). */
function joinedText(n: ts.Node): string {
  const u = unwrap(n);
  if (ts.isStringLiteralLike(u)) return u.text;
  if (ts.isTemplateExpression(u)) return u.head.text + u.templateSpans.map((s) => joinedText(s.expression) + s.literal.text).join("");
  if (isPlus(u)) return joinedText(u.left) + joinedText(u.right);
  return "";
}

function violations(content: string, file: string): string[] {
  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true,
    /\.tsx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found: string[] = [];
  const dependency = (specifier: string) => {
    if (SDK.test(specifier) && !sdkAllowed(file)) found.push(`SDK ${specifier}`);
    if (TABLES.has(specifier) && !tableAllowed(file)) found.push(`table ${specifier}`);
    if (providerDependency(specifier, file) && !PROVIDER_ADAPTERS.has(file)) found.push(`provider ${specifier}`);
  };
  const visit = (node: ts.Node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
      dependency(node.moduleSpecifier.text);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)
      && node.moduleReference.expression && ts.isStringLiteralLike(node.moduleReference.expression)) {
      dependency(node.moduleReference.expression.text);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteralLike(node.argument.literal)) {
      dependency(node.argument.literal.text);
    } else if (file !== "lib/ai/gateway.ts" && isStringTop(node)) {
      // The whole string a piece of code can build: "api." + "openai.com" and `https://api.${x}openai.com` count too.
      const text = joinedText(node);
      if (PROVIDER_HOST.test(text)) found.push(`provider host ${PROVIDER_HOST.exec(text)?.[0]} outside lib/ai/gateway.ts providerUrl`);
    }
    if (ts.isCallExpression(node)) {
      const call = node.expression;
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteralLike(arg)) {
        if (call.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(call) && call.text === "require")) dependency(arg.text);
        const from = ts.isPropertyAccessExpression(call) ? call.name.text
          : ts.isElementAccessExpression(call) && call.argumentExpression && ts.isStringLiteralLike(call.argumentExpression) ? call.argumentExpression.text : null;
        if (from === "from" && TABLES.has(arg.text) && !tableAllowed(file)) found.push(`table ${arg.text}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (["__tests__", "node_modules", ".next"].includes(entry.name)) return [];
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? files(file) : /\.[cm]?[jt]sx?$/.test(entry.name) && !/\.(?:test|spec|d)\.[cm]?[jt]sx?$/.test(entry.name) ? [file] : [];
  });
}

describe("paid entry import boundaries (ADR 017)", () => {
  it("scans every app/lib source with independent SDK, entitlement table and provider allowlists", () => {
    const sources = ["app", "lib"].flatMap((dir) => files(path.join(ROOT, dir)));
    expect(sources.length).toBeGreaterThan(400);
    const failures = sources.flatMap((file) => {
      const relative = path.relative(ROOT, file).replace(/\\/g, "/");
      return violations(readFileSync(file, "utf8"), relative).map((message) => `${relative}: ${message}`);
    });
    expect(failures).toEqual([]);
  });

  it("every gateway loader call passes a grant and only can() mints one (step 3)", () => {
    const sources = ["app", "lib"].flatMap((dir) => files(path.join(ROOT, dir)));
    const failures = sources.flatMap((file) => {
      const relative = path.relative(ROOT, file).split(path.sep).join("/");
      const text = readFileSync(file, "utf8");
      const found: string[] = [];
      if (/\bload(?:Anthropic|GoogleGenerativeAI)\(\s*\)/.test(text)) found.push("gateway loader called without a grant");
      if (relative !== "lib/entitlements/can.ts" && /\bnew Grant\(/.test(text)) found.push("Grant constructed outside can.ts");
      return found.map((message) => `${relative}: ${message}`);
    });
    expect(failures).toEqual([]);
  });

  it("detects the card's Replicate import and every loader spelling, including type imports", () => {
    const file = "lib/social/store.ts";
    for (const source of [
      'import Replicate from "replicate";',
      'export { default } from "@anthropic-ai/sdk";',
      'const sdk = await import("@google/generative-ai");',
      'const sdk = require("openai");',
      'import sdk = require("@fal-ai/client");',
      'type SDK = import("@google/genai").Client;',
    ]) expect(violations(source, file)).toHaveLength(1);
    expect(violations('import Replicate from "replicate";', "app/portal/page.tsx")).toHaveLength(1);
    expect(violations('import Replicate from "replicate";', "lib/ai/gateway.ts")).toEqual([]);
  });

  it("a paid provider's host outside the gateway is a violation (raw fetch would skip the grant)", () => {
    expect(violations('await fetch("https://api.openai.com/v1/chat/completions", {});', "lib/content/x.ts")).toHaveLength(1);
    expect(violations('await fetch(`https://api.replicate.com/v1/models/${m}/predictions`);', "lib/tarot/x.ts")).toHaveLength(1);
    expect(violations('const u = `${a}https://generativelanguage.googleapis.com/x`;', "lib/outreach/x.ts")).toHaveLength(1);
    expect(violations('await fetch("https://api." + "openai.com/v1/chat/completions");', "lib/content/x.ts")).toHaveLength(1);
    expect(violations('const u = ("https://api.repl" + (`icate.com`)) + path;', "lib/studio/x.ts")).toHaveLength(1);
    expect(violations('const u = `https://api.${""}anthropic.com/v1/messages`;', "lib/outreach/x.ts")).toHaveLength(1);
    expect(violations('await fetch("https://API.OpenAI.com/v1/chat/completions");', "lib/content/x.ts")).toHaveLength(1);
    expect(violations('const o = { openai: "https://api.openai.com" };', "lib/ai/gateway.ts")).toEqual([]);
    expect(violations(["// see https://api.openai.com/docs", 'const site = "https://openai.com";'].join(String.fromCharCode(10)), "lib/content/x.ts")).toEqual([]);
  });

  it("detects real table and vendor dependencies without treating UI text or comments as imports", () => {
    expect(violations('db.from("plans"); db["from"]("media_credit_ledger");', "lib/social/store.ts")).toHaveLength(2);
    expect(violations('db.from("organization_entitlements");', "lib/ai/gateway.ts")).toHaveLength(1);
    expect(violations('db.from("organization_product_subscriptions");', "app/portal/page.tsx")).toEqual([]);
    expect(violations('import Woo from "@woocommerce/woocommerce-rest-api";', "lib/social/store.ts")).toHaveLength(1);
    expect(violations('import Woo from "@woocommerce/woocommerce-rest-api";', "lib/payments/woo.ts")).toEqual([]);
    expect(violations('import { bridgePost } from "@/lib/studio/wp-bridge-client";', "lib/social/store.ts")).toHaveLength(1);
    expect(violations('import { createNewsletter } from "@/lib/crm/fluentcrm";', "app/api/content/newsletter/route.ts")).toEqual([]);
    expect(violations('import { client } from "@/lib/vendor/fluentcrm-client";', "lib/social/store.ts")).toHaveLength(1);
    expect(violations('// import sdk from "replicate";\nconst label = "plans"; const catalog = ["woocommerce", "fluentcrm"];', "lib/catalog.ts")).toEqual([]);
  });
});
