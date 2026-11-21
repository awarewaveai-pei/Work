/**
 * 密碼學亂數的無偏整數 [0, n)。拒絕取樣:丟掉 2^32 尾端不足一整輪的區段,避免 % n 偏向小值。
 * globalThis.crypto 在瀏覽器與 Node ≥ 19 皆有。塔羅、易經、求籤的伺服器端抽選共用。
 */
export function secureInt(n: number): number {
  if (!Number.isInteger(n) || n < 1 || n > 2 ** 32) throw new Error(`secureInt 範圍錯誤: ${n}`);
  const limit = 2 ** 32 - (2 ** 32 % n);
  const buf = new Uint32Array(1);
  do {
    globalThis.crypto.getRandomValues(buf);
  } while (buf[0] >= limit);
  return buf[0] % n;
}

