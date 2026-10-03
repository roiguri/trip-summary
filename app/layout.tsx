import './globals.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import { BackgroundCopy } from './components/BackgroundCopy';
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <BackgroundCopy />
      </body>
    </html>
  );
}
