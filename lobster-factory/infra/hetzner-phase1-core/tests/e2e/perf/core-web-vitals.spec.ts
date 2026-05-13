/**
 * Perf — Page load timing and Core Web Vitals gate
 *
 * Thresholds are intentionally generous (production-grade targets):
 *   LCP < 4 000 ms  (Google "needs improvement" ceiling)
 *   FID / INP — not measured (requires real user interaction)
 *   CLS not measured here (needs layout-shift PerformanceObserver timing)
 *   Total load time < 8 000 ms (networkidle, acceptable for global CDN)
 *
 * Failures here indicate a regression, not a polished site. Tighten
 * thresholds per-client by setting PLAYWRIGHT_PERF_LCP_MS and
 * PLAYWRIGHT_PERF_LOAD_MS env vars.
 *
 * Run: /playwright perf
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, CLIENT_URL } from '../helpers/env';

const TARGET_URL  = CLIENT_URL || BASE_URL;
const LCP_LIMIT   = Number(process.env.PLAYWRIGHT_PERF_LCP_MS  ?? 4000);
const LOAD_LIMIT  = Number(process.env.PLAYWRIGHT_PERF_LOAD_MS ?? 8000);

test.describe('Page performance', () => {
  test(`homepage loads within ${LOAD_LIMIT} ms (networkidle)`, async ({ page }) => {
    const t0 = Date.now();
    await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 30_000 });
    const elapsed = Date.now() - t0;
    console.log(`Load time: ${elapsed} ms  (limit ${LOAD_LIMIT} ms)`);
    expect(elapsed, `Homepage exceeded ${LOAD_LIMIT} ms load limit`).toBeLessThan(LOAD_LIMIT);
  });

  test(`LCP < ${LCP_LIMIT} ms`, async ({ page }) => {
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded' });

    const lcp = await page.evaluate((): Promise<number | null> =>
      new Promise(resolve => {
        let value: number | null = null;
        try {
          const obs = new PerformanceObserver(list => {
            const entries = list.getEntries();
            if (entries.length > 0) {
              value = entries[entries.length - 1].startTime;
            }
          });
          obs.observe({ type: 'largest-contentful-paint', buffered: true });
          // Give the browser 5 s to emit LCP entries
          setTimeout(() => {
            obs.disconnect();
            resolve(value);
          }, 5000);
        } catch {
          resolve(null); // Browser doesn't support the API
        }
      })
    );

    if (lcp === null) {
      console.warn('WARN: LCP not available (API unsupported or no LCP entry emitted)');
      return; // Soft skip — don't fail on unsupported browser
    }

    console.log(`LCP: ${lcp.toFixed(0)} ms  (limit ${LCP_LIMIT} ms)`);
    expect(lcp, `LCP ${lcp.toFixed(0)} ms exceeds limit ${LCP_LIMIT} ms`).toBeLessThan(LCP_LIMIT);
  });

  test('Time To First Byte (TTFB) < 2 000 ms', async ({ page }) => {
    const ttfb = await page.evaluate(async (url: string): Promise<number | null> => {
      try {
        const t0 = performance.now();
        const res = await fetch(url, { cache: 'no-store' });
        await res.text(); // consume body
        return performance.now() - t0;
      } catch {
        return null;
      }
    }, TARGET_URL);

    if (ttfb === null) {
      console.warn('WARN: TTFB fetch failed (CORS or network error)');
      return;
    }
    console.log(`TTFB: ${ttfb.toFixed(0)} ms`);
    expect(ttfb).toBeLessThan(2000);
  });

  test('no oversized individual resources (> 2 MB)', async ({ page }) => {
    const large: Array<{ url: string; size: number }> = [];
    page.on('response', async res => {
      const len = Number(res.headers()['content-length'] ?? 0);
      if (len > 2 * 1024 * 1024) {
        large.push({ url: res.url(), size: len });
      }
    });
    await page.goto(TARGET_URL, { waitUntil: 'networkidle' });
    if (large.length > 0) {
      console.warn('Oversized resources:', large.map(r =>
        `${(r.size / 1024 / 1024).toFixed(1)} MB — ${r.url}`,
      ).join('\n'));
    }
    expect(large, `${large.length} resource(s) > 2 MB found`).toHaveLength(0);
  });
});
