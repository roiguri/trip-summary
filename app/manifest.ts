import type { MetadataRoute } from 'next';

// Installable app (DESIGN.md, "Installable app"): opens full-screen from the home screen with the
// sun icon, in the rail green. Nothing works offline (no service worker), by decision.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Afterglow',
    short_name: 'Afterglow',
    description: 'Trip journals: each day, its places and photos.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#fffdfa',
    theme_color: '#3f5c4b',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
