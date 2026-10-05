import './globals.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Metadata, Viewport } from 'next';
import { BackgroundCopy } from './components/BackgroundCopy';
import { wordmark } from './fonts';

export const metadata: Metadata = {
  title: 'Afterglow',
  // Added to an iPhone's home screen: its icon and name, opening full-screen.
  appleWebApp: { capable: true, title: 'Afterglow', statusBarStyle: 'default' },
  icons: { apple: '/icons/apple-touch-icon.png' },
};

// The browser's and the installed app's bars in the top bar's green.
export const viewport: Viewport = { themeColor: '#3f5c4b' };

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
