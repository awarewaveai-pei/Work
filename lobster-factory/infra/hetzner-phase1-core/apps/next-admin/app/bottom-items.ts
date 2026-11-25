// The phone bottom bar's page links (blueprint §9.1, §19.4); 「更多」 is MobileShell's own button. Only pages that exist:
// 搜尋 waits for its card (U18), and 我的工具 is the same page as 工作台 (blueprint §2), so it is not listed twice.
export interface BottomItem {
  label: string;
  href: string;
}

export type BottomViewer =
  /** the staff console; visible = a restricted staff member's hrefs (null = all) */
  | { kind: "staff"; visible: readonly string[] | null }
  /** staff on a product door: the console is another host (undefined = none configured, no link) */
  | { kind: "staff-door"; staffOrigin: string | undefined }
  /** a customer on a product door: their workspace is on the portal host */
  | { kind: "member"; portalOrigin: string };

const STAFF: BottomItem[] = [{ label: "工作台", href: "/" }, { label: "客戶", href: "/ops/clients" }];

export function bottomItems(v: BottomViewer): BottomItem[] {
  if (v.kind === "member") {
    return [{ label: "工作台", href: `${v.portalOrigin}/launcher` }, { label: "點數與合約", href: `${v.portalOrigin}/wallet` }];
  }
  if (v.kind === "staff-door") return v.staffOrigin ? STAFF.map((i) => ({ ...i, href: `${v.staffOrigin}${i.href}` })) : [];
  return STAFF.filter((i) => !v.visible || v.visible.includes(i.href));
}
