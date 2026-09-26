import type { MetadataRoute } from 'next';

// "Add to Home Screen" installs incha.tv as a full-screen app — no app store needed.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'incha.tv',
    short_name: 'incha.tv',
    description: 'For the fans, by the fans. Moments, live matches and fandoms from INCHA Studios.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0c0c0d',
    theme_color: '#0c0c0d',
    categories: ['sports', 'entertainment', 'social'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ],
    shortcuts: [
      { name: 'Watch', url: '/watch' },
      { name: 'Matches', url: '/matches' },
      { name: 'Post a moment', url: '/upload' }
    ]
  };
}
