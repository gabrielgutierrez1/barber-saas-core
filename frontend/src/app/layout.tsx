import type { Metadata, Viewport } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: { default: 'Reserva en línea', template: '%s' },
  description: 'Reserva tu próximo corte o tratamiento desde tu celular.',
  manifest: '/manifest.webmanifest',
};
export const viewport: Viewport = { themeColor: '#f7f5f0', width: 'device-width', initialScale: 1 };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
