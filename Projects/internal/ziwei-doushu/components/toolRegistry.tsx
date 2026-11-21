import type { ComponentType } from 'react';
import type { Dictionary } from '@/lib/i18n/dictionaries';
import { isLocale, type Locale } from '@/lib/i18n/config';
import { PAGE_SLUGS, type PageSlug } from '@/lib/site';
import AstrologyTool from '@/components/AstrologyTool';
import BaziTool from '@/components/BaziTool';
import DailyTool from '@/components/DailyTool';
import FengshuiTool from '@/components/FengshuiTool';
import HehunTool from '@/components/HehunTool';
import IChingTool from '@/components/IChingTool';
import QianTool from '@/components/QianTool';
import QimenTool from '@/components/QimenTool';
import TarotTool from '@/components/TarotTool';
import VedicTool from '@/components/VedicTool';
import ZeriTool from '@/components/ZeriTool';
import ZiweiTool from '@/components/ZiweiTool';

/**
 * slug → 工具元件的單一對照(嵌入版 /embed/[lang]/[slug] 用)。
 * 鍵型別 = PageSlug:PAGE_SLUGS 加一頁卻沒在此登記 → tsc 紅。
 */
export type ToolProps = { dict: Dictionary; locale: Locale };

export const TOOL_COMPONENTS: Record<PageSlug, ComponentType<ToolProps>> = {
  ziwei: ZiweiTool,
  bazi: BaziTool,
  hehun: HehunTool,
  iching: IChingTool,
  tarot: TarotTool,
  qian: QianTool,
  astrology: AstrologyTool,
  vedic: VedicTool,
  fengshui: FengshuiTool,
  qimen: QimenTool,
  zeri: ZeriTool,
  daily: DailyTool,
};

export function isPageSlug(value: string): value is PageSlug {
  return (PAGE_SLUGS as readonly string[]).includes(value);
}

/** 路由參數驗證;不合法回 null(呼叫端 notFound())。 */
export function resolveToolRoute(
  lang: string,
  slug: string,
): { locale: Locale; slug: PageSlug } | null {
  if (!isLocale(lang) || !isPageSlug(slug)) return null;
  return { locale: lang, slug };
}
