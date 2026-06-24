'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { locales, type Locale } from '@/lib/i18n/config';
import type { Dictionary } from '@/lib/i18n/dictionaries';

const SYSTEMS = ['ziwei', 'bazi', 'iching', 'tarot', 'daily'] as const;

export default function SystemNav({
  dict,
  locale,
}: {
  dict: Dictionary;
  locale: Locale;
}) {
  const pathname = usePathname();
  const base = `/${locale}`;
  const other = locales.find((l) => l !== locale) ?? locale;
  const switchHref = pathname.replace(/^\/[^/]+/, `/${other}`);

  return (
    <nav className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
        <Link href={base} className="font-bold text-indigo-700">
          {dict.hub.title}
        </Link>
        {SYSTEMS.map((s) => {
          const href = `${base}/${s}`;
          const active = pathname === href;
          return (
            <Link
              key={s}
              href={href}
              className={active ? 'font-semibold text-indigo-600' : 'text-slate-500 hover:text-slate-800'}
            >
              {dict.nav[s]}
            </Link>
          );
        })}
        <Link href={switchHref} className="ml-auto rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-50">
          {locale === 'en' ? '中文' : 'EN'}
        </Link>
      </div>
    </nav>
  );
}
