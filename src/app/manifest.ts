import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'NITPY Hostel System',
    short_name: 'NITPY Hostel',
    description: 'Advanced biometric hostel management system',
    start_url: '/',
    display: 'standalone',
    background_color: '#003366',
    theme_color: '#003366',
    icons: [
      {
        src: '/logo.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/logo.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}
