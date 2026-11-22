import type { Metadata, Viewport } from 'next';
import { Cairo } from 'next/font/google';
import Link from 'next/link';
import './globals.css';
import Header from '@/components/Header';

const cairo = Cairo({ subsets: ['arabic', 'latin'], variable: '--font-cairo', display: 'swap' });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: 'وَصَل — منصة المفقودين والموجودين في مصر', template: '%s | وَصَل' },
  description: 'بلّغ عن شخص أو غرض مفقود أو موجود في مصر. الموقع بيقارن الصور والبيانات ويوصّلك بصاحب الشأن.',
  openGraph: { siteName: 'وَصَل', locale: 'ar_EG', type: 'website' },
};

export const viewport: Viewport = { themeColor: '#0d8758', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={cairo.variable}>
      <body>
        <Header />
        <main className="mx-auto min-h-[70vh] max-w-6xl px-4 py-6">{children}</main>
        <footer className="mt-10 border-t border-stone-200 bg-white py-6 text-center text-sm text-stone-500">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-6 gap-y-2 px-4">
            <span>وَصَل © {new Date().getFullYear()}</span>
            <Link href="/privacy" className="hover:text-brand-700">سياسة الخصوصية</Link>
            <Link href="/terms" className="hover:text-brand-700">شروط الاستخدام</Link>
          </div>
          <p className="mt-2 px-4 text-xs">في حالات الطوارئ أو الخطر على الحياة اتصل بالشرطة على 122 أو الإسعاف على 123.</p>
        </footer>
      </body>
    </html>
  );
}
