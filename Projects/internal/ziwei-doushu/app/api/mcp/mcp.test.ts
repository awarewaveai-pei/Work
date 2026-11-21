import { beforeEach, describe, expect, it } from 'vitest';
import { GET, POST } from './route';
import { listSystems } from '@/lib/divination/registry';
import { describeSpec } from '@/lib/divination/input';
import { __resetRateLimit } from '@/lib/http/rateLimit';
import { factsToText } from '@/lib/mcp/text';
import { SITE_URL } from '@/lib/site';

let nextId = 1;
const rpc = (method: string, params?: unknown, headers: Record<string, string> = {}) =>
  POST(
    new Request('http://localhost/api/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', host: 'localhost', ...headers },
      body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, ...(params === undefined ? {} : { params }) }),
    }),
  );

beforeEach(() => __resetRateLimit());

describe('MCP /api/mcp', () => {
  it('initialize 回協定版本、tools 能力與伺服器資訊', async () => {
    const r = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.result.protocolVersion).toBe('2025-06-18');
    expect(body.result.capabilities).toEqual({ tools: { listChanged: false } });
    expect(body.result.serverInfo.name).toBe('aware-wave-oracle');
  });

  it('tools/list:工具數 = 登錄表系統數 + 1,全部唯讀', async () => {
    const { result } = await (await rpc('tools/list')).json();
    expect(result.tools).toHaveLength(listSystems().length + 1);
    for (const t of result.tools) {
      expect(t.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
      expect(t.inputSchema.type).toBe('object');
    }
  });

  it.each(listSystems().map((s) => s.meta.id))('tools/call %s:規格範例輸入 → 文字事實 + structuredContent', async (id) => {
    const example = describeSpec(listSystems().find((s) => s.meta.id === id)!.input).example;
    const { result } = await (await rpc('tools/call', { name: id, arguments: { ...example, locale: 'en' } })).json();
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent.context.systemId).toBe(id);
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toBe(factsToText(result.structuredContent.context));
  });

  it('list_systems 列出每個系統與範例', async () => {
    const { result } = await (await rpc('tools/call', { name: 'list_systems', arguments: {} })).json();
    expect(result.structuredContent.systems).toHaveLength(listSystems().length);
  });

  it('輸入錯誤 → isError 結果逐項列出;未知工具與未知方法 → JSON-RPC 錯誤', async () => {
    const bad = await (await rpc('tools/call', { name: 'qian', arguments: { lot: 101, extra: 1 } })).json();
    expect(bad.result.isError).toBe(true);
    // 欄位名與工具參數同層(不帶 REST 的 input. 前綴)
    expect(bad.result.content[0].text.split('\n')).toEqual(expect.arrayContaining(['- lot: must be 1..100', '- extra: unknown field']));
    expect((await (await rpc('tools/call', { name: 'nope', arguments: {} })).json()).error.code).toBe(-32602);
    expect((await (await rpc('resources/list')).json()).error.code).toBe(-32601);
  });

  it('通知回 202;壞 JSON、批次、跨站 Origin、不支援的協定版本被拒', async () => {
    const post = (body: string, headers: Record<string, string> = {}) =>
      POST(new Request('http://localhost/api/mcp', { method: 'POST', headers: { host: 'localhost', ...headers }, body }));
    expect((await post(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }))).status).toBe(202);
    const parse = await post('{');
    expect(parse.status).toBe(400);
    expect((await parse.json()).error.code).toBe(-32700);
    expect((await post('[]')).status).toBe(400);
    expect((await rpc('ping', undefined, { origin: 'https://evil.example' })).status).toBe(403);
    expect((await rpc('ping', undefined, { origin: 'http://localhost' })).status).toBe(200);
    // DNS rebinding:Origin 與 Host 同為攻擊網域也要拒絕(允許清單來自設定,不看 Host)
    expect((await rpc('ping', undefined, { origin: 'https://evil.example', host: 'evil.example' })).status).toBe(403);
    expect((await rpc('ping', undefined, { origin: new URL(SITE_URL).origin })).status).toBe(200);
    // 有 id 但 method 不是字串:回 -32600 並帶回 id;客戶端送來的回應仍回 202
    const noMethod = await post(JSON.stringify({ jsonrpc: '2.0', id: 7, method: 5 }));
    expect(noMethod.status).toBe(400);
    expect(await noMethod.json()).toMatchObject({ id: 7, error: { code: -32600 } });
    expect((await post(JSON.stringify({ jsonrpc: '2.0', id: 7, result: {} }))).status).toBe(202);
    expect((await rpc('ping', undefined, { 'mcp-protocol-version': '1999-01-01' })).status).toBe(400);
    expect(GET().status).toBe(405);
  });
});

describe('factsToText', () => {
  it('快照', () => {
    expect(
      factsToText({
        systemId: 'qian',
        locale: 'zh-TW',
        headline: '第 1 籤 · 鍾離成道 · 上上',
        facts: [
          { label: 'lotNumber', value: '1' },
          { label: 'grade', value: '上上' },
        ],
      }),
    ).toMatchInlineSnapshot(`
      "# 第 1 籤 · 鍾離成道 · 上上
      命盤事實(確定性計算結果,不含 AI 解讀;解讀請只依下列事實)
      - lotNumber: 1
      - grade: 上上"
    `);
  });
});
