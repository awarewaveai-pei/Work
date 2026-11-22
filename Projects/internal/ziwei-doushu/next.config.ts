import type { NextConfig } from "next";
import { API_CSP } from "./lib/http/csp";

const nextConfig: NextConfig = {
  // standalone:產出自帶最小 runtime 的 server.js → Docker 映像精簡,供 eu-deploy。
  output: "standalone",
  // monorepo 內巢狀專案:把檔案追蹤根鎖在本專案,避免 standalone 誤掃整個 monorepo
  // 或遺漏依賴(build 曾警告偵測到多個 lockfile)。
  outputFileTracingRoot: import.meta.dirname,
  // lib/astrology.ts 以 fs.readFileSync 載入 XALEN wasm(runtime 字串路徑,tracer 偵測不到)
  //   → 顯式納入 standalone 輸出,否則部署時 wasm 缺檔(task#7)。一條規則涵蓋所有 API 路由
  //   (/api/astrology*、/api/vedic、/api/v1/**),新路由不必再逐條登記。
  outputFileTracingIncludes: {
    '/api/**/*': ['./node_modules/@xalen/wasm/xalen_wasm_bg.wasm'],
  },
  // CSP 唯一定義在 lib/http/csp.ts:頁面(含 /embed/*,frame-ancestors 'self')由 proxy.ts 逐請求帶 nonce 送;
  //   這裡只送 API 的。同一回應不可再加第二個 CSP 標頭(兩個都會生效)。
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [{ key: 'Content-Security-Policy', value: API_CSP }],
      },
      // 嵌入版(WordPress 同網域 iframe):不單獨收錄、內容歸父頁。
      {
        source: '/embed/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, indexifembedded' }],
      },
    ];
  },
};

export default nextConfig;
