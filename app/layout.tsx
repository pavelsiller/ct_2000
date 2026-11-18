import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Český Těšín 2000',
  description: 'Izometrická pixel-art mapa města Český Těšín ve stylu SimCity 2000 z otevřených dat (izomapa + brno2000).',
  openGraph: {
    title: 'Český Těšín 2000',
    description: 'Izometrická pixel-art mapa města Český Těšín ve stylu SimCity 2000 z otevřených dat (izomapa + brno2000).',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Český Těšín 2000',
    description: 'Izometrická pixel-art mapa města Český Těšín ve stylu SimCity 2000 z otevřených dat (izomapa + brno2000).',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
