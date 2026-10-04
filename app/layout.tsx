import './globals.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Metadata } from 'next';
import { BackgroundCopy } from './components/BackgroundCopy';
import { wordmark } from './fonts';

export const metadata: Metadata = { title: 'Afterglow' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={wordmark.variable}>
      <body>
        {children}
        <BackgroundCopy />
      </body>
    </html>
  );
}
