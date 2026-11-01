const assert = require('node:assert/strict'), { EventEmitter } = require('node:events');
const { gate, publicAddress, publicGet, parsePage } = require('../backend/product-inspect.cjs');
(async () => {
  let dnsCalls = 0, requests = 0;
  const lookup = async () => { dnsCalls++; return [{ address: '93.184.216.34', family: 4 }]; };
  for (const url of ['http://example.com', 'https://127.0.0.1', 'https://2130706433', 'https://[::1]', 'https://[::ffff:7f00:1]', 'https://localhost.', 'https://service.internal', 'https://example.com:8443', 'https://user:password@example.com']) await assert.rejects(() => gate(url, lookup));
  for (const address of ['10.0.0.1', '169.254.169.254', '192.168.1.1', '100.64.1.1', 'fe80::1', '::ffff:127.0.0.1', '2002:7f00:1::']) assert.equal(publicAddress(address), false, address);
  await assert.rejects(() => gate('https://example.com', async () => [{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.1', family: 4 }]));
  const request = (url, options, onResponse) => {
    requests++;
    options.lookup(url.hostname, { all: true }, (error, records) => { assert.ifError(error); assert.equal(records[0].address, '93.184.216.34'); });
    assert.equal(options.agent, false); assert.equal(options.headers.Authorization, undefined); assert.equal(options.headers.Cookie, undefined);
    const req = new EventEmitter();
    req.destroy = error => { if (error) req.emit('error', error); req.emit('close'); };
    req.end = () => queueMicrotask(() => {
      const res = new EventEmitter(); res.statusCode = 200; res.headers = { 'content-type': 'text/html' }; res.destroy = () => req.emit('close');
      onResponse(res); res.emit('data', Buffer.from('<title>公開商品</title>')); res.emit('end'); req.emit('close');
    }); return req;
  };
  const result = await publicGet('https://example.com', { lookup, request }); assert.match(result.bytes.toString(), /公開商品/);
  assert.equal(requests, 1);
  await assert.rejects(() => publicGet('https://example.com', { lookup, request, maxBytes: 3 }), /過大/);
  const redirect = (url, options, onResponse) => {
    requests++; const req = new EventEmitter(); req.destroy = error => { if (error) req.emit('error', error); req.emit('close'); };
    req.end = () => queueMicrotask(() => { const res = new EventEmitter(); res.statusCode = 302; res.headers = { location: 'https://127.0.0.1/private' }; res.destroy = () => req.emit('close'); onResponse(res); }); return req;
  };
  const before = requests; await assert.rejects(() => publicGet('https://example.com', { lookup, request: redirect })); assert.equal(requests, before + 1);
  const parsed = parsePage('<title>杯 &amp; 碟</title><meta property="og:image" content="/cup.png"><meta name="description" content="陶瓷杯身與杯柄"><script><p>隱藏假文案</p><img src="/secret.png"></script><p>適合日常咖啡使用</p>', 'https://example.com/product');
  assert.equal(parsed.product.title, '杯 & 碟'); assert.deepEqual(parsed.images, ['https://example.com/cup.png']); assert.equal(parsed.texts.some(x => x.includes('隱藏')), false);
  assert.equal(parsePage('<title>沒有圖片</title>', 'https://example.com').images.length, 0);
  console.log('PASS 公開 HTTPS、私網/混合 DNS/轉址拒絕、連線固定已驗證 IP、大小上限、商品文案與圖片候選擷取（零真實網路）');
})().catch(e => { console.error(e); process.exitCode = 1; });
