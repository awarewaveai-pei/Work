/** Next 內建的 path-to-regexp(proxy.test.ts 用它照 Next 的語法解 matcher／source);Next 沒附型別。 */
declare module 'next/dist/compiled/path-to-regexp' {
  export function pathToRegexp(path: string): RegExp;
}
