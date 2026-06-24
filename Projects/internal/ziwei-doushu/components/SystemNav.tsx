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
    <nav className="nav-bar">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3">
        <Link href={base} className="nav-brand">
          {dict.hub.title}
        </Link>

        <span className="mx-2 text-[var(--text-dim)] hidden sm:inline select-none">·</span>

        <div className="flex flex-wrap gap-x-1 gap-y-1">
          {SYSTEMS.map((s) => {
            const href = `${base}/${s}`;
            const active = pathname === href;
            return (
              <Link
                key={s}
                href={href}
                className={`nav-link${active ? ' active' : ''}`}
              >
                {dict.nav[s]}
              </Link>
            );
          })}
        </div>

        <Link href={switchHref} className="nav-lang ml-auto">
          {locale === 'en' ? '中文' : 'EN'}
        </Link>
      </div>
    </nav>
  );
}
