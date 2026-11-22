import { describe, expect, it } from 'vitest';
import { API_CSP, newNonce, pageCsp } from './csp';

/** 指令名 → 來源清單 */
function directives(policy: string): Map<string, string[]> {
  return new Map(
    policy.split(';').map((d) => {
      const [name, ...sources] = d.trim().split(/\s+/);
      return [name, sources] as [string, string[]];
    }),
  );
}

describe('頁面 CSP', () => {
  const nonce = 'abc123==';
  const prod = directives(pageCsp(nonce));

  it('必含的指令', () => {
    expect(prod.get('default-src')).toEqual(["'self'"]);
    expect(prod.get('script-src')).toEqual(["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"]);
    expect(prod.get('object-src')).toEqual(["'none'"]);
    expect(prod.get('base-uri')).toEqual(["'self'"]);
    expect(prod.get('form-action')).toEqual(["'self'"]);
    expect(prod.get('frame-ancestors')).toEqual(["'self'"]);
    expect(prod.get('connect-src')).toEqual(["'self'"]);
    expect(prod.get('frame-src')).toEqual(["'none'"]);
  });

  it('script-src 不含 unsafe-inline／unsafe-eval／wasm-unsafe-eval(production)', () => {
    const script = prod.get('script-src')!;
    for (const bad of ["'unsafe-inline'", "'unsafe-eval'", "'wasm-unsafe-eval'", '*', 'data:', 'blob:']) {
      expect(script).not.toContain(bad);
    }
  });

  it('style-src 不放 nonce(否則瀏覽器忽略 unsafe-inline,style 屬性全被擋)', () => {
    expect(prod.get('style-src')!.some((s) => s.startsWith("'nonce-"))).toBe(false);
  });

  it('dev 只多 unsafe-eval,其餘相同', () => {
    const dev = directives(pageCsp(nonce, true));
    expect(dev.get('script-src')).toEqual([...prod.get('script-src')!, "'unsafe-eval'"]);
    dev.delete('script-src');
    const rest = new Map(prod);
    rest.delete('script-src');
    expect(dev).toEqual(rest);
  });
});

describe('API CSP', () => {
  it('不載入任何來源、不准被框住', () => {
    expect(directives(API_CSP)).toEqual(
      new Map([
        ['default-src', ["'none'"]],
        ['frame-ancestors', ["'none'"]],
      ]),
    );
  });
});

describe('nonce', () => {
  it('每次不同、16 位元組 base64、不含會破壞標頭的字元', () => {
    const a = newNonce();
    const b = newNonce();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });
});
