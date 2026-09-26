import type { Metadata, Viewport } from 'next';
import { AuthProvider } from '@/lib/auth';
import { SITE_URL } from '@/lib/api';
import Header from '@/components/Header';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'incha.tv — for the fans, by the fans', template: '%s · incha.tv' },
  description: 'incha.tv is where fans post the moments: goals, tifos, away days, and everything in between. By INCHA Studios.',
  openGraph: { siteName: 'incha.tv', type: 'website' },
  twitter: { card: 'summary_large_image' }
};

export const viewport: Viewport = { themeColor: '#0c0c0d', viewportFit: 'cover' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <AuthProvider>
          <Header />
          <main>{children}</main>
          <footer className="site-footer">
            <div className="wrap">
              <span className="motto">En las buenas y en las malas.</span>
              <span className="mono muted">incha.tv · an INCHA Studios project · Philadelphia</span>
            </div>
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
