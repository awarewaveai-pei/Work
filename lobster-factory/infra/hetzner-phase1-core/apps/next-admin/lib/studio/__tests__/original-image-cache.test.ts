// 改邊緣的原圖只下載一次（lib/studio/original-image-cache.ts）。2026-11-15：每換一個筆刷 DesignsGallery 都重抓整張原圖
// （download route 回 no-store；5362617a4 把 5 分鐘可重用的 proxy-image 換成這條），五次筆刷 = 五次 3.9 MB 經歐洲主機。
import { describe, expect, it, vi } from "vitest";
import { createOriginalImageCache } from "../original-image-cache";

function make() {
  const fetch = vi.fn(async (href: string) => ({ ok: true, status: 200, blob: async () => new Blob([href]) }));
  const revoked: string[] = [];
  let n = 0;
  const cache = createOriginalImageCache({ fetch, createObjectURL: () => `blob:${++n}`, revokeObjectURL: (u) => revoked.push(u) });
  return { fetch, revoked, cache };
}

describe("original-image-cache", () => {
  it("同一 asset 連套兩種樣式 → fetch 只呼叫一次，兩次拿到同一個 blob: URL（下載中就等它）", async () => {
    const { fetch, cache } = make();
    const [first, second] = await Promise.all([cache.get("a", "/dl/a"), cache.get("a", "/dl/a")]); // 第二筆刷在下載完成前就按
    const third = await cache.get("a", "/dl/a"); // 下載完成後再換一種
    expect(first).toBe("blob:1");
    expect(second).toBe("blob:1");
    expect(third).toBe("blob:1");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("/dl/a");
  });

  it("換另一張設計 → 重抓，舊 objectURL 被 revoke；release 也 revoke", async () => {
    const { fetch, revoked, cache } = make();
    expect(await cache.get("a", "/dl/a")).toBe("blob:1");
    expect(await cache.get("b", "/dl/b")).toBe("blob:2");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(revoked).toEqual(["blob:1"]);
    cache.release();
    expect(revoked).toEqual(["blob:1", "blob:2"]);
    cache.release(); // 沒東西可放也不炸、不重複 revoke
    expect(revoked).toEqual(["blob:1", "blob:2"]);
  });

  it("下載中關掉再開同一張 → 第一次的 URL 自己 revoke、不蓋掉第二次的（Codex 2026-11-15）", async () => {
    const { revoked, cache } = make();
    const first = cache.get("a", "/dl/a");
    cache.release(); // 關閉改邊緣，下載還沒回來
    const second = cache.get("a", "/dl/a"); // 再開同一張
    await expect(first).rejects.toThrow(/original_replaced/);
    expect(await second).toBe("blob:2");
    expect(revoked).toEqual(["blob:1"]);
    cache.release();
    expect(revoked).toEqual(["blob:1", "blob:2"]);
  });
});
