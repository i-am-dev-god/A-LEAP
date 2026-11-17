import type { Metadata, Viewport } from 'next';
import 'maplibre-gl/dist/maplibre-gl.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'OU Spatial Engine — 3D Campus Navigation · Osmania University',
  description:
    'A self-hosted 3D spatial navigation and campus intelligence twin for Osmania University, Hyderabad. A* pedestrian routing, real-time solar lighting, GPU foliage and a live campus pulse — with zero external map APIs.',
  applicationName: 'OU Spatial Engine',
  keywords: [
    'Osmania University',
    'campus navigation',
    '3D map',
    'MapLibre',
    'Three.js',
    'A* routing',
    'Hyderabad',
    'spatial engine',
  ],
  authors: [{ name: 'OU Spatial Engine' }],
  openGraph: {
    title: 'OU Spatial Engine',
    description:
      'Self-rendered 3D campus navigation for Osmania University — A* routing, solar lighting, live campus pulse.',
    type: 'website',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#04070d',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="h-full bg-ink font-sans text-white antialiased">{children}</body>
    </html>
  );
}
