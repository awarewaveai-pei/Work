import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const config = readFileSync(new URL('../../nginx/default.conf', import.meta.url), 'utf8');
const servers = [...config.matchAll(/^server \{\r?\n([\s\S]*?)^\}/gm)].map((match) => match[1]);

// Auth cookie chunks become one Cookie header; every hostname in the product block needs the same budget.
test('app, portal and all shared product doors accept auth headers over the default 8 KiB', () => {
  const product = servers.find((block) => /^    server_name\s+[^;]*\bsocial\.aware-wave\.com\b/m.test(block));
  assert.ok(product, 'shared product server must exist');
  const names = product.match(/^    server_name\s+([^;]+);/m)[1].trim().split(/\s+/);
  for (const name of ['app.aware-wave.com', 'portal.aware-wave.com', ...names]) {
    const matches = servers.filter((block) => {
      const hosts = block.match(/^    server_name\s+([^;]+);/m)?.[1].trim().split(/\s+/) ?? [];
      return hosts.includes(name);
    });
    assert.equal(matches.length, 1, `${name}: exactly one server`);
    assert.match(matches[0], /^    large_client_header_buffers\s+4\s+32k;/m, `${name}: auth cookie budget`);
  }
});
