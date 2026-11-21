import { Geist, Geist_Mono, Noto_Serif_TC } from "next/font/google";
import { notFound } from "next/navigation";
import "../../globals.css";
import { locales, isLocale } from "@/lib/i18n/config";

/**
 * 嵌入版根版面(WordPress 頁面以同網域 iframe 載入 /embed/<語言>/<工具>)。
 * 與 app/[lang]/layout.tsx 是兩個 root layout:不放 SystemNav;html/body 不撐滿視窗
 *   (h-full/min-h-full 會讓框內 scrollHeight 只增不減),父頁量的是 #aw-oracle-root。
 * 字型設定與 app/[lang]/layout.tsx 同一組(同變數名);改一邊要改另一邊。
 */
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const notoSerifTC = Noto_Serif_TC({
  variable: "--font-noto-serif-tc",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap",
});

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

// globals.css 的 `html, body { height: 100% }` 在嵌入版要取消,高度跟內容走。
const AUTO_HEIGHT = { height: "auto", minHeight: 0 } as const;

export default async function EmbedLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  return (
    <html
      lang={lang}
      className={`${geistSans.variable} ${geistMono.variable} ${notoSerifTC.variable}`}
      style={AUTO_HEIGHT}
    >
      <body className="antialiased" style={AUTO_HEIGHT}>
        {children}
      </body>
    </html>
  );
}
