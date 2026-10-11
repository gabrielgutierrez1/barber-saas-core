import type { MetadataRoute } from 'next';
export const dynamic = 'force-dynamic';
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  let name = 'Mi peluquería',
    color = '#bb865d';
  try {
    const r = await fetch(
      `${process.env.API_SERVER_URL || 'http://localhost:4000'}/api/public/info`,
      { cache: 'no-store', signal: AbortSignal.timeout(3000) },
    );
    if (r.ok) {
      const s = await r.json();
      name = s.name;
      color = s.primaryColor;
    }
  } catch {}
  return {
    id: '/',
    name,
    short_name: name.slice(0, 24),
    description: `Reservas en ${name}`,
    start_url: '/',
    display: 'standalone',
    background_color: '#f7f5f0',
    theme_color: color,
    lang: 'es',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
