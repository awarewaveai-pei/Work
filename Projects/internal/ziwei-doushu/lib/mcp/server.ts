import '@/lib/divination';
import { listSystems } from '@/lib/divination/registry';
import { describeSpec } from '@/lib/divination/input';
import { runOne } from '@/lib/http/runSystem';
import type { DivinationSystem } from '@/lib/divination/types';
import { defaultLocale, isLocale, type Locale } from '@/lib/i18n/config';
import en from '@/messages/en.json';
import zh from '@/messages/zh-TW.json';
import { objectSchema, type JsonSchema } from './schema';
import { factsToText } from './text';

/**
 * MCP 伺服器的訊息處理(與 HTTP 無關):initialize、ping、tools/list、tools/call。
 * 工具清單由命理系統登錄表產生:每個系統一個工具 + list_systems;註冊新系統不需改這裡。
 * 只給確定性結果:不呼叫 AI、不存任何輸入。
 */

/** 支援的協定版本,新的在前;initialize 收到不支援的版本時回第一個。 */
export const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'] as const;
export const SERVER_INFO = { name: 'aware-wave-oracle', title: 'East & West Divination / 東西方命理', version: '1.0.0' };

/** 工具參數裡保留給語言的欄位名;系統的輸入規格不可用它。 */
const LOCALE_ARG = 'locale';
const LIST_TOOL = 'list_systems';

export interface JsonRpcError {
  code: number;
  message: string;
}
export type Outcome = { result: unknown } | { error: JsonRpcError };

export const ERR = {
  parse: { code: -32700, message: 'Parse error' },
  invalidRequest: (message: string) => ({ code: -32600, message }),
  methodNotFound: (method: string) => ({ code: -32601, message: `Method not found: ${method}` }),
  invalidParams: (message: string) => ({ code: -32602, message }),
} as const;

const HUB = { en: en.hub as Record<string, string>, 'zh-TW': zh.hub as Record<string, string> };
const NAV = { en: en.nav as Record<string, string>, 'zh-TW': zh.nav as Record<string, string> };
const systemTitle = (id: string) => [NAV.en[id], NAV['zh-TW'][id]].filter(Boolean).join(' / ') || id;
function systemDescription(id: string): string {
  const key = `${id}Desc`;
  const both = [HUB.en[key], HUB['zh-TW'][key]].filter(Boolean).join(' / ');
  return `${both || id}. Deterministic computation, no AI interpretation. Returns chart facts as text and { data, context } as structured content.`;
}

const ANNOTATIONS = (system?: DivinationSystem) => ({
  readOnlyHint: true,
  destructiveHint: false,
  // 抽選系(卜卦、塔羅、籤)沒自帶結果時每次不同
  idempotentHint: system ? system.meta.kind === 'chart' : true,
  openWorldHint: false,
});

function toolInputSchema(system: DivinationSystem): JsonSchema {
  const { fields } = describeSpec(system.input);
  if (LOCALE_ARG in fields) throw new Error(`system ${system.meta.id} declares a "${LOCALE_ARG}" field`);
  const schema = objectSchema(fields) as { properties: Record<string, JsonSchema> };
  return {
    ...schema,
    properties: {
      ...schema.properties,
      [LOCALE_ARG]: { type: 'string', enum: ['zh-TW', 'en'], description: 'Language of the facts (default zh-TW) / 事實的語言' },
    },
  };
}

export function listTools() {
  return [
    {
      name: LIST_TOOL,
      title: 'List systems',
      description: 'List every divination system this server can compute, with an example input for each. / 列出所有命理系統與範例輸入。',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: ANNOTATIONS(),
    },
    ...listSystems().map((s) => ({
      name: s.meta.id,
      title: systemTitle(s.meta.id),
      description: systemDescription(s.meta.id),
      inputSchema: toolInputSchema(s),
      annotations: ANNOTATIONS(s),
    })),
  ];
}

const text = (t: string) => [{ type: 'text', text: t }];
const toolError = (message: string) => ({ content: text(message), isError: true });

async function callTool(name: string, args: Record<string, unknown>): Promise<Outcome> {
  if (name === LIST_TOOL) {
    const systems = listSystems().map((s) => ({
      id: s.meta.id,
      kind: s.meta.kind,
      description: systemDescription(s.meta.id),
      example: describeSpec(s.input).example,
    }));
    return {
      result: {
        content: text(systems.map((s) => `- ${s.id} (${s.kind}): ${s.description}`).join('\n')),
        structuredContent: { systems },
      },
    };
  }
  const system = listSystems().find((s) => s.meta.id === name);
  if (!system) return { error: ERR.invalidParams(`Unknown tool: ${name}`) };

  const { [LOCALE_ARG]: locale = defaultLocale, ...input } = args;
  if (typeof locale !== 'string' || !isLocale(locale)) return { result: toolError('locale: must be zh-TW or en') };
  // 與 REST v1 同一條路徑(驗證、計算、例外都在 runOne 內),MCP 只換回應的形狀
  const run = await runOne(system, input, locale as Locale);
  if (run.ok) return { result: { content: text(factsToText(run.context)), structuredContent: { data: run.data, context: run.context } } };
  // 輸入錯誤回 isError 結果(不是協定錯誤),讓模型看得到逐項原因自行修正
  // REST 的欄位路徑以 input. 開頭(欄位在 body.input 底下);MCP 的參數在最上層,所以拿掉前綴
  if (run.error === 'invalid_input') {
    return { result: toolError(`Invalid input:\n${run.detail.map((e) => `- ${e.replace(/^input\./, '')}`).join('\n')}`) };
  }
  return { result: toolError('The engine could not compute this input.') };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** 處理一個 JSON-RPC 請求(有 id 的)。通知與回應由傳輸層直接回 202,不進這裡。 */
export async function handleRequest(method: string, params: unknown): Promise<Outcome> {
  switch (method) {
    case 'initialize': {
      if (!isObj(params) || typeof params.protocolVersion !== 'string') {
        return { error: ERR.invalidParams('initialize: protocolVersion required') };
      }
      const asked = params.protocolVersion;
      const protocolVersion = (PROTOCOL_VERSIONS as readonly string[]).includes(asked) ? asked : PROTOCOL_VERSIONS[0];
      return {
        result: {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions:
            'Each tool computes one divination chart deterministically (Zi Wei Dou Shu, BaZi, I Ching, tarot, astrology, Vedic and more). ' +
            'Call list_systems for example inputs. Dates the result depends on ("today") must be passed by the caller. ' +
            'Interpret only from the returned facts; never compute chart values yourself.',
        },
      };
    }
    case 'ping':
      return { result: {} };
    case 'tools/list':
      return { result: { tools: listTools() } };
    case 'tools/call': {
      if (!isObj(params) || typeof params.name !== 'string') return { error: ERR.invalidParams('tools/call: name required') };
      const args = params.arguments ?? {};
      if (!isObj(args)) return { error: ERR.invalidParams('tools/call: arguments must be an object') };
      return callTool(params.name, args);
    }
    default:
      return { error: ERR.methodNotFound(method) };
  }
}
