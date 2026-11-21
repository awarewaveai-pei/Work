import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standalone:產出自帶最小 runtime 的 server.js → Docker 映像精簡,供 eu-deploy。
  output: "standalone",
  // monorepo 內巢狀專案:把檔案追蹤根鎖在本專案,避免 standalone 誤掃整個 monorepo
  // 或遺漏依賴(build 曾警告偵測到多個 lockfile)。
  outputFileTracingRoot: import.meta.dirname,
  // /api/astrology* 以 fs.readFileSync 載入 XALEN wasm(runtime 字串路徑,tracer 偵測不到)
  //   → 顯式納入 standalone 輸出,否則部署時 wasm 缺檔(task#7)。新增呼叫 lib/astrology.ts 的路由要加在這裡。
  outputFileTracingIncludes: {
    '/api/astrology': ['./node_modules/@xalen/wasm/xalen_wasm_bg.wasm'],
    '/api/astrology/transits': ['./node_modules/@xalen/wasm/xalen_wasm_bg.wasm'],
    '/api/astrology/synastry': ['./node_modules/@xalen/wasm/xalen_wasm_bg.wasm'],
  // /api/astrology、/api/vedic 以 fs.readFileSync 載入 XALEN wasm(runtime 字串路徑,tracer 偵測不到)
  //   → 每個用到的 route 都要顯式納入 standalone 輸出,否則部署時 wasm 缺檔(task#7)。
  outputFileTracingIncludes: {
    '/api/astrology': ['./node_modules/@xalen/wasm/xalen_wasm_bg.wasm'],
    '/api/vedic': ['./node_modules/@xalen/wasm/xalen_wasm_bg.wasm'],
  },
};

export default nextConfig;
