import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'NITPY Student Portal',
    short_name: 'NITPY Portal',
    description: 'Advanced biometric student management portal',
    start_url: '/',
    display: 'standalone',
    background_color: '#003366',
    theme_color: '#003366',
    icons: [
      {
        src: '/logo.webp',
        sizes: '192x192',
        type: 'image/webp',
        purpose: 'maskable',
      },
      {
        src: '/logo.webp',
        sizes: '512x512',
        type: 'image/webp',
        purpose: 'any',
      },
    ],
  };
}
