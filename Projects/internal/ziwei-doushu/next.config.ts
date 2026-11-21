import type { NextConfig } from "next";

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
  // 嵌入版(WordPress 同網域 iframe):不單獨收錄、內容歸父頁;只允許同源框住。只加在 /embed/*。
  async headers() {
    return [
      {
        source: '/embed/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, indexifembedded' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
