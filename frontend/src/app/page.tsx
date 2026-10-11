import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight, CalendarDays, Clock3, CheckCircle2 } from 'lucide-react';
import { BookingWidget } from './reservation-widget';
import type { SalonService, Salon } from '../lib/types';
export const dynamic = 'force-dynamic';
async function fetchSalon(): Promise<{ salon: Salon; services: SalonService[] } | null> {
  const api =
    process.env.API_SERVER_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  try {
    const [t, s] = await Promise.all([
      fetch(`${api}/api/public/info`, { cache: 'no-store' }),
      fetch(`${api}/api/public/services`, { cache: 'no-store' }),
    ]);
    if (!t.ok || !s.ok) return null;
    return { salon: await t.json(), services: await s.json() };
  } catch {
    return null;
  }
}
export async function generateMetadata(): Promise<Metadata> {
  const data = await fetchSalon();
  return {
    title: data?.salon.name || 'Salón',
    description: data?.salon.description || 'Reserva tu próxima visita',
  };
}
export default async function Home() {
  const data = await fetchSalon();
  if (!data)
    return (
      <main className="shell py-24">
        <h1 className="serif text-5xl">El salón no está disponible</h1>
        <p className="mt-6">Verifica la configuración de esta instancia.</p>
      </main>
    );
  const { salon, services } = data;
  const brandStyle = { '--brand': salon.primaryColor } as CSSProperties;
  return (
    <main style={brandStyle}>
      <div className="bg-[#292a25] text-[#f1eee7] text-[11px] tracking-[.12em] text-center py-2.5">
        AGENDA EN LÍNEA · TU MOMENTO EMPIEZA AQUÍ
      </div>
      <header className="shell py-7 flex items-center justify-between border-b border-[#e8e5dc]">
        <Link href={'/'} className="brand-script">
          {salon.logoUrl && (
            <img
              src={salon.logoUrl}
              alt=""
              className="inline-block h-10 w-10 object-contain mr-3"
            />
          )}
          {salon.name}
          <span style={{ color: 'var(--brand)' }}>.</span>
        </Link>
        <nav className="flex items-center gap-6">
          <a href="#servicios" className="nav-link hidden sm:inline">
            Servicios
          </a>
          <a href="#reservar" className="nav-link">
            Reservar <ArrowUpRight size={14} className="inline" />
          </a>
        </nav>
      </header>
      <section className="shell grid lg:grid-cols-[1.05fr_.95fr] gap-6 lg:gap-14 py-10 lg:py-16">
        <div className="flex flex-col justify-center py-8 lg:py-12">
          <div className="mini-label mb-7 flex gap-3 items-center">
            <span className="w-8 h-[1px] bg-[#ba8359]" /> BELLEZA · ESTILO · CUIDADO
          </div>
          <h1 className="serif text-[58px] sm:text-[76px] xl:text-[93px] leading-[.98] mb-9">
            Tu estilo,
            <br />
            <em>tu momento.</em>
          </h1>
          <p className="text-[#77796f] max-w-md text-lg leading-8 mb-10">
            {salon.description ||
              'Un espacio dedicado a tu bienestar y estilo. Reserva cuando quieras, sin llamadas ni esperas.'}
          </p>
          <div>
            <a href="#reservar" className="btn-dark inline-block">
              Agendar mi visita <ArrowUpRight size={17} className="inline ml-6" />
            </a>
          </div>
          <div className="flex items-center gap-8 mt-14 text-xs text-[#6c6f65]">
            <span>
              <CalendarDays size={16} className="inline mr-2" />
              {salon.workDays
                .map((d) => ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'][d])
                .join(' · ')}
            </span>
            <span>
              <Clock3 size={16} className="inline mr-2" />
              {salon.openingHour}:00–{salon.closingHour}:00
            </span>
          </div>
        </div>
        <div className="hero-art min-h-[390px] lg:min-h-[560px]">
          <div className="orb" />
          <div className="absolute left-8 bottom-8 z-10 text-[#fff8e9]">
            <p className="mini-label text-[#ead4b9] mb-2">ESTUDIO & ESTILO</p>
            <p className="serif text-4xl">Siéntete tú.</p>
          </div>
          <div className="absolute z-10 top-8 right-8 text-[#f4eada] text-xs tracking-[.2em]">
            EST. 2026
          </div>
        </div>
      </section>
      <section className="bg-[#eae6df] py-5 text-center">
        <span className="mini-label text-[#626358]">
          UN BUEN CAMBIO EMPIEZA CON UNA BUENA RESERVA
        </span>
      </section>
      <section id="servicios" className="shell py-20 lg:py-28">
        <div className="flex items-end justify-between gap-5 flex-wrap mb-10">
          <div>
            <p className="mini-label mb-4" style={{ color: 'var(--brand)' }}>
              NUESTRA CARTA
            </p>
            <h2 className="serif text-5xl lg:text-6xl">
              Servicios pensados <em>para ti.</em>
            </h2>
          </div>
          <p className="text-[#77796f] max-w-[230px] text-sm leading-6">
            Todo lo que necesitas para sentirte bien, en un solo lugar.
          </p>
        </div>
        <BookingWidget salon={salon} services={services} />
      </section>
      <section className="bg-[#252721] text-[#fbf8f1] py-20">
        <div className="shell grid md:grid-cols-2 gap-10 items-center">
          <div>
            <p className="mini-label text-[#c49b79] mb-4">SIN COMPLICACIONES</p>
            <h2 className="serif text-5xl lg:text-6xl leading-tight">
              Tu próximo espacio
              <br />
              <em>ya te espera.</em>
            </h2>
          </div>
          <div className="space-y-5">
            <p className="text-[#c3c4bb] text-sm leading-7">
              Elige tu servicio, encuentra tu horario y realiza el pago para confirmar tu reserva.
            </p>
            <p className="text-sm flex items-center gap-3">
              <CheckCircle2 size={19} color="#c49b79" /> Horarios en tiempo real
            </p>
            <p className="text-sm flex items-center gap-3">
              <CheckCircle2 size={19} color="#c49b79" /> Pago protegido por Mercado Pago
            </p>
          </div>
        </div>
      </section>
      <footer className="shell flex justify-between flex-wrap gap-5 items-center py-12">
        <Link href={'/'} className="brand-script">
          {salon.name}.
        </Link>
        <div className="text-xs text-[#898b82]">
          © 2026 · Reservas online ·{' '}
          <Link className="underline" href="/admin">
            Acceso administración
          </Link>
        </div>
      </footer>
    </main>
  );
}
