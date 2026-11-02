// Local adapter following AwareWave collect/net: validate every redirect and pin
// the TLS connection to the validated DNS answer. No cookies or credentials.
const https = require('node:https'), dns = require('node:dns/promises'), net = require('node:net');
const refused = () => Object.assign(Error('只接受公開 HTTPS 網址；無法讀取時可使用手動商品資料。'), { status: 400 });
function publicAddress(address) {
  if (net.isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && [0, 168].includes(b)) || (a === 198 && [18, 19].includes(b)));
  }
  return net.isIP(address) === 6 && /^[23][0-9a-f]{3}:/i.test(address) && !/^200[12]:/i.test(address);
}
async function gate(raw, lookup = dns.lookup) {
  let url; try { url = new URL(raw); } catch { throw refused(); }
  const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !host.includes('.') && !net.isIP(host) || /(^|\.)(localhost|local|internal)$/.test(host)) throw refused();
  const records = net.isIP(host) ? [{ address: host, family: net.isIP(host) }] : await lookup(host, { all: true, verbatim: true });
  if (!records.length || records.some(r => !publicAddress(r.address))) throw refused();
  return { url, record: records.find(r => r.family === 4) || records[0] };
}
async function publicGet(raw, { maxBytes = 2000000, accept = ['text/html', 'application/xhtml+xml'], lookup, request = https.request } = {}) {
  const deadline = Date.now() + 20000;
  let current = raw;
  for (let hop = 0; hop <= 4; hop++) {
    let timer;
    const checked = await Promise.race([gate(current, lookup), new Promise((_, reject) => { timer = setTimeout(() => reject(Error('商品網站回應逾時')), Math.max(1, deadline - Date.now())); })]).finally(() => clearTimeout(timer));
    const remaining = deadline - Date.now(); if (remaining <= 0) throw Error('商品網站回應逾時');
    const response = await new Promise((resolve, reject) => {
      const req = request(checked.url, {
        agent: false, headers: { Accept: accept.join(','), 'User-Agent': 'AwareWave-ProductPreview/1.0', 'Accept-Encoding': 'identity' },
        lookup: (_host, options, callback) => options?.all ? callback(null, [checked.record]) : callback(null, checked.record.address, checked.record.family),
      }, res => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode)) { res.destroy(); resolve({ redirect: res.headers.location }); return; }
        if (res.statusCode !== 200 || !accept.includes(String(res.headers['content-type'] || '').split(';')[0].trim().toLowerCase()) || !['', 'identity'].includes(res.headers['content-encoding'] || '')) { res.destroy(); reject(Error('商品網站未提供可讀取的公開內容；可改用手動輸入。')); return; }
        let size = 0; const chunks = [];
        res.on('data', chunk => { size += chunk.length; if (size > maxBytes) { req.destroy(Error('商品內容過大，請改用手動輸入')); return; } chunks.push(chunk); });
        res.on('end', () => resolve({ bytes: Buffer.concat(chunks), contentType: res.headers['content-type'].split(';')[0].trim().toLowerCase(), url: checked.url.href }));
        res.on('error', reject);
      });
      const timeout = setTimeout(() => req.destroy(Error('商品網站回應逾時')), remaining);
      req.on('close', () => clearTimeout(timeout)); req.on('error', reject); req.end();
    });
    if (!('redirect' in response)) return response;
    if (!response.redirect || hop === 4) throw Error('商品網站轉址次數過多');
    current = new URL(response.redirect, checked.url).href;
  }
}
function decode(text) {
  return String(text).replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (all, code) => {
    if (code[0] !== '#') return ({ amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' })[code.toLowerCase()];
    const value = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
    return value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : '';
  }).replace(/\s+/g, ' ').trim();
}
function parsePage(html, base) {
  const meta = {}, images = [], texts = [];
  const addImage = value => { if (!value) return; try { const url = new URL(decode(value), base); if (url.protocol === 'https:' && !url.username && !url.password && !images.includes(url.href) && images.length < 12) images.push(url.href); } catch {} };
  const addText = value => { const clean = decode(String(value).replace(/<[^<>]*>/g, ' ')).slice(0, 1200); if (clean.length > 5 && !texts.includes(clean) && texts.length < 12) texts.push(clean); };
  // Remove executable/non-visible blocks using a linear scanner before reading tags.
  const lower = html.replace(/[A-Z]/g, c => c.toLowerCase());
  let visible = '', cursor = 0;
  while (cursor < html.length) {
    const positions = ['script', 'style', 'noscript'].map(name => ({ name, at: lower.indexOf('<' + name, cursor) })).filter(x => x.at >= 0).sort((a, b) => a.at - b.at);
    if (!positions.length) { visible += html.slice(cursor); break; }
    const next = positions[0]; visible += html.slice(cursor, next.at);
    const close = lower.indexOf('</' + next.name, next.at), end = close < 0 ? -1 : lower.indexOf('>', close);
    if (end < 0) break; cursor = end + 1;
  }
  for (const match of visible.matchAll(/<(meta|img)\b[^<>]{0,8192}>/gi)) {
    const attrs = {};
    for (const attr of match[0].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) attrs[attr[1].toLowerCase()] = attr[2] ?? attr[3] ?? attr[4];
    if (match[1].toLowerCase() === 'meta') meta[(attrs.property || attrs.name || '').toLowerCase()] = attrs.content || '';
  }
  const title = decode(meta['og:title'] || visible.match(/<title\b[^<>]{0,500}>([^<>]{0,1000})<\/title>/i)?.[1] || '未命名商品');
  addImage(meta['og:image']); addImage(meta['twitter:image']);
  addText(meta['og:description'] || meta.description || '');
  for (const match of visible.matchAll(/<(?:p|h[1-3]|li)\b[^<>]{0,500}>([^<>]{6,1500})<\/(?:p|h[1-3]|li)>/gi)) addText(match[1]);
  // Candidate images are imported only when the operator selects them.
  for (const match of visible.matchAll(/<img\b[^<>]{0,8192}>/gi)) {
    const src = match[0].match(/\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)')/i); if (src) addImage(src[1] || src[2]);
  }
  const price = meta['product:price:amount'] ? decode(meta['product:price:currency'] || '') + ' ' + decode(meta['product:price:amount']) : '價格待確認';
  return { product: { title, price, description: texts.join('\n') }, images, texts, sourceUrl: base, note: '擷取公開頁面文字與圖片候選；請確認商品事實。需登入或 JavaScript 才顯示的內容請手動補充。' };
}
async function inspect(url) { const page = await publicGet(url); return parsePage(page.bytes.toString('utf8'), page.url); }
module.exports = { publicAddress, gate, publicGet, parsePage, inspect };
