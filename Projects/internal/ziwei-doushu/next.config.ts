import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standalone:產出自帶最小 runtime 的 server.js → Docker 映像精簡,供 eu-deploy。
  output: "standalone",
  // monorepo 內巢狀專案:把檔案追蹤根鎖在本專案,避免 standalone 誤掃整個 monorepo
  // 或遺漏依賴(build 曾警告偵測到多個 lockfile)。
  outputFileTracingRoot: import.meta.dirname,
  // /api/astrology 以 fs.readFileSync 載入 XALEN wasm(runtime 字串路徑,tracer 偵測不到)
  //   → 顯式納入 standalone 輸出,否則部署時 wasm 缺檔(task#7)。
  outputFileTracingIncludes: {
    '/api/astrology': ['./node_modules/@xalen/wasm/xalen_wasm_bg.wasm'],
  },
};

export default nextConfig;
