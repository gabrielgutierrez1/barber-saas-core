import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowUpRight,
  CalendarDays,
  Clock3,
  CheckCircle2,
  MapPin,
  Phone,
  Mail,
  Users,
  HelpCircle,
  ShieldCheck,
  BookOpen,
} from 'lucide-react';
import { BookingWidget } from './reservation-widget';
import type { SalonService, Salon } from '../lib/types';

export const dynamic = 'force-dynamic';

type Content = {
  address: string;
  about: string;
  cancellationPolicy: string;
  privacyPolicy: string;
  faqs: { question: string; answer: string }[];
  gallery: { url: string; caption: string }[];
};

type PublicProfessional = {
  id: string;
  name: string;
  bio: string | null;
  photoUrl: string | null;
  specialties: string | null;
  services: { id: string; name: string }[];
};

async function fetchSalon(): Promise<{
  salon: Salon;
  services: SalonService[];
  content: Content;
  professionals: PublicProfessional[];
} | null> {
  const api =
    process.env.API_SERVER_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  try {
    const [t, s, c, p] = await Promise.all([
      fetch(`${api}/api/public/info`, { cache: 'no-store' }),
      fetch(`${api}/api/public/services`, { cache: 'no-store' }),
      fetch(`${api}/api/public/content`, { cache: 'no-store' }),
      fetch(`${api}/api/public/professionals`, { cache: 'no-store' }),
    ]);
    if (!t.ok || !s.ok) return null;
    return {
      salon: await t.json(),
      services: await s.json(),
      content: c.ok ? await c.json() : { address: '', about: '', cancellationPolicy: '', privacyPolicy: '', faqs: [], gallery: [] },
      professionals: p.ok ? await p.json() : [],
    };
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
  const { salon, services, content, professionals } = data;
  const brandStyle = { '--brand': salon.primaryColor } as CSSProperties;

  const hasContact = salon.contactPhone || salon.contactEmail || content.address;
  const hasPolicies = content.cancellationPolicy || content.privacyPolicy;
  const hasFaqs = content.faqs.length > 0;
  const hasTeam = professionals.length > 0;
  const hasGallery = content.gallery.length > 0;

  return (
    <main style={brandStyle}>
      {/* ── Topbar ─────────────────────────────────────── */}
      <div className="bg-[#292a25] text-[#f1eee7] text-[11px] tracking-[.12em] text-center py-2.5">
        AGENDA EN LÍNEA · TU MOMENTO EMPIEZA AQUÍ
      </div>

      {/* ── Header / Nav ───────────────────────────────── */}
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
        <nav className="flex items-center gap-3 sm:gap-5">
          <a href="#servicios" className="nav-link text-xs sm:text-sm">
            Servicios
          </a>
          {hasContact && (
            <a href="#contacto" className="nav-link hidden md:inline">
              Contacto
            </a>
          )}
          {hasGallery && (
            <a href="#galeria" className="nav-link hidden md:inline">
              Galería
            </a>
          )}
          <Link href="/mi-reserva" className="nav-link hidden sm:inline">
            Mi reserva
          </Link>
          <a href="#reservar" className="btn-dark text-xs sm:text-sm py-2 px-3 sm:py-3 sm:px-5">
            Reservar <ArrowUpRight size={14} className="inline ml-1" />
          </a>
        </nav>
      </header>

      {/* ── Hero ───────────────────────────────────────── */}
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
          <div className="flex flex-wrap gap-4">
            <a href="#reservar" className="btn-dark inline-block">
              Agendar mi visita <ArrowUpRight size={17} className="inline ml-6" />
            </a>
            <Link href="/mi-reserva" className="btn-outline inline-block">
              Consultar mi reserva
            </Link>
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
            <p className="mini-label text-[#ead4b9] mb-2">ESTUDIO &amp; ESTILO</p>
            <p className="serif text-4xl">Siéntete tú.</p>
          </div>
          <div className="absolute z-10 top-8 right-8 text-[#f4eada] text-xs tracking-[.2em]">
            EST. 2026
          </div>
        </div>
      </section>

      {/* ── Band ───────────────────────────────────────── */}
      <section className="bg-[#eae6df] py-5 text-center">
        <span className="mini-label text-[#626358]">
          UN BUEN CAMBIO EMPIEZA CON UNA BUENA RESERVA
        </span>
      </section>

      {/* ── Servicios + Widget ─────────────────────────── */}
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

      {hasGallery && (
        <section id="galeria" aria-labelledby="gallery-title" className="shell py-20 lg:py-28">
          <div className="mb-10">
            <p className="mini-label mb-4" style={{ color: 'var(--brand)' }}>
              NUESTRO TRABAJO
            </p>
            <h2 id="gallery-title" className="serif text-5xl lg:text-6xl">Galería</h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {content.gallery.map((item, index) => (
              <figure key={`${item.url}-${index}`} className="surface overflow-hidden">
                <img
                  src={item.url}
                  alt={item.caption}
                  loading="lazy"
                  decoding="async"
                  className="aspect-[4/5] w-full object-cover"
                />
                <figcaption className="p-5 text-sm text-[#626358]">
                  {item.caption}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {/* ── Equipo ─────────────────────────────────────── */}
      {hasTeam && (
        <section id="equipo" className="bg-[#f7f5f0] py-20 lg:py-28">
          <div className="shell">
            <div className="mb-12">
              <p className="mini-label mb-4 flex items-center gap-2" style={{ color: 'var(--brand)' }}>
                <Users size={14} /> NUESTRO EQUIPO
              </p>
              <h2 className="serif text-5xl lg:text-6xl">
                Profesionales <em>a tu servicio.</em>
              </h2>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {professionals.map((pro) => (
                <div key={pro.id} className="surface p-7 flex flex-col gap-4">
                  {pro.photoUrl ? (
                    <img
                      src={pro.photoUrl}
                      alt={pro.name}
                      className="w-20 h-20 rounded-full object-cover border-2 border-[#e5ded1]"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-[#e9eee5] flex items-center justify-center text-2xl font-bold text-[#567857]">
                      {pro.name[0]}
                    </div>
                  )}
                  <div>
                    <h3 className="serif text-2xl mb-1">{pro.name}</h3>
                    {pro.specialties && (
                      <p className="text-xs tracking-widest text-[#a17c59] uppercase mb-2">
                        {pro.specialties}
                      </p>
                    )}
                    {pro.bio && (
                      <p className="text-sm text-[#77796f] leading-6">{pro.bio}</p>
                    )}
                  </div>
                  {pro.services.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-auto">
                      {pro.services.map((s) => (
                        <span
                          key={s.id}
                          className="text-[11px] tracking-wide bg-[#eae6df] text-[#626358] px-3 py-1"
                        >
                          {s.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Cómo funciona ──────────────────────────────── */}
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
            <p className="text-sm flex items-center gap-3">
              <CheckCircle2 size={19} color="#c49b79" /> Consulta tu reserva desde cualquier
              dispositivo en{' '}
              <Link href="/mi-reserva" className="underline">
                Mi reserva
              </Link>
            </p>
          </div>
        </div>
      </section>

      {/* ── Contacto y ubicación ───────────────────────── */}
      {hasContact && (
        <section id="contacto" className="shell py-20 lg:py-28">
          <div className="mb-10">
            <p className="mini-label mb-4 flex items-center gap-2" style={{ color: 'var(--brand)' }}>
              <MapPin size={14} /> DÓNDE ENCONTRARNOS
            </p>
            <h2 className="serif text-5xl lg:text-6xl">
              Contacto <em>y ubicación.</em>
            </h2>
          </div>
          <div className="grid md:grid-cols-2 gap-10">
            <div className="space-y-6">
              {salon.contactPhone && (
                <div className="flex items-start gap-4">
                  <Phone size={20} className="mt-0.5 text-[#a17c59] shrink-0" />
                  <div>
                    <p className="mini-label text-[#898b82] mb-1">TELÉFONO</p>
                    <a
                      href={`tel:${salon.contactPhone}`}
                      className="text-lg hover:underline"
                    >
                      {salon.contactPhone}
                    </a>
                  </div>
                </div>
              )}
              {salon.contactEmail && (
                <div className="flex items-start gap-4">
                  <Mail size={20} className="mt-0.5 text-[#a17c59] shrink-0" />
                  <div>
                    <p className="mini-label text-[#898b82] mb-1">CORREO</p>
                    <a
                      href={`mailto:${salon.contactEmail}`}
                      className="text-lg hover:underline"
                    >
                      {salon.contactEmail}
                    </a>
                  </div>
                </div>
              )}
              {content.address && (
                <div className="flex items-start gap-4">
                  <MapPin size={20} className="mt-0.5 text-[#a17c59] shrink-0" />
                  <div>
                    <p className="mini-label text-[#898b82] mb-1">DIRECCIÓN</p>
                    <p className="text-lg leading-7">{content.address}</p>
                    <a
                      href={`https://maps.google.com/?q=${encodeURIComponent(content.address)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm underline text-[#77796f] mt-1 inline-block"
                    >
                      Ver en Google Maps <ArrowUpRight size={12} className="inline" />
                    </a>
                  </div>
                </div>
              )}
              <div className="flex items-start gap-4">
                <CalendarDays size={20} className="mt-0.5 text-[#a17c59] shrink-0" />
                <div>
                  <p className="mini-label text-[#898b82] mb-1">HORARIO</p>
                  <p className="leading-7">
                    {salon.workDays
                      .map((d) => ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'][d])
                      .join(' · ')}
                    <br />
                    {salon.openingHour}:00 – {salon.closingHour}:00
                  </p>
                </div>
              </div>
            </div>
            {content.address && (
              <div className="bg-[#eae6df] min-h-[260px] flex items-center justify-center text-[#898b82] text-sm">
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(content.address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Abrir en Google Maps
                </a>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── FAQs ───────────────────────────────────────── */}
      {hasFaqs && (
        <section id="faq" className="bg-[#f7f5f0] py-20 lg:py-28">
          <div className="shell">
            <div className="mb-10">
              <p className="mini-label mb-4 flex items-center gap-2" style={{ color: 'var(--brand)' }}>
                <HelpCircle size={14} /> PREGUNTAS FRECUENTES
              </p>
              <h2 className="serif text-5xl lg:text-6xl">
                Dudas <em>frecuentes.</em>
              </h2>
            </div>
            <div className="max-w-3xl space-y-4">
              {content.faqs.map((faq, i) => (
                <details key={i} className="surface p-6 group">
                  <summary className="cursor-pointer font-semibold text-base list-none flex justify-between items-center gap-4">
                    {faq.question}
                    <span className="text-[#a17c59] shrink-0">+</span>
                  </summary>
                  <p className="mt-4 text-sm text-[#77796f] leading-7">{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Políticas ──────────────────────────────────── */}
      {hasPolicies && (
        <section id="politicas" className="shell py-20 lg:py-28">
          <div className="mb-10">
            <p className="mini-label mb-4 flex items-center gap-2" style={{ color: 'var(--brand)' }}>
              <ShieldCheck size={14} /> POLÍTICAS
            </p>
            <h2 className="serif text-5xl lg:text-6xl">
              Condiciones <em>y privacidad.</em>
            </h2>
          </div>
          <div className="grid md:grid-cols-2 gap-8 max-w-5xl">
            {content.cancellationPolicy && (
              <div className="surface p-7">
                <div className="flex items-center gap-3 mb-4">
                  <BookOpen size={18} className="text-[#a17c59]" />
                  <h3 className="font-bold">Cancelación y reprogramación</h3>
                </div>
                <p className="text-sm text-[#77796f] leading-7 whitespace-pre-line">
                  {content.cancellationPolicy}
                </p>
              </div>
            )}
            {content.privacyPolicy && (
              <div className="surface p-7">
                <div className="flex items-center gap-3 mb-4">
                  <ShieldCheck size={18} className="text-[#a17c59]" />
                  <h3 className="font-bold">Privacidad</h3>
                </div>
                <p className="text-sm text-[#77796f] leading-7 whitespace-pre-line">
                  {content.privacyPolicy}
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Footer ─────────────────────────────────────── */}
      <footer className="bg-[#252721] text-[#b4b5aa]">
        <div className="shell py-12 grid sm:grid-cols-2 md:grid-cols-3 gap-8">
          <div>
            <Link href={'/'} className="brand-script text-[#f1eee7] block mb-3">
              {salon.name}.
            </Link>
            {content.address && (
              <p className="text-xs leading-6">{content.address}</p>
            )}
          </div>
          <div className="space-y-2 text-xs">
            <p className="mini-label text-[#898b82] mb-3">CONTACTO</p>
            {salon.contactPhone && (
              <p><a href={`tel:${salon.contactPhone}`} className="hover:underline">{salon.contactPhone}</a></p>
            )}
            {salon.contactEmail && (
              <p><a href={`mailto:${salon.contactEmail}`} className="hover:underline">{salon.contactEmail}</a></p>
            )}
          </div>
          <div className="space-y-2 text-xs">
            <p className="mini-label text-[#898b82] mb-3">NAVEGACIÓN</p>
            <p><a href="#servicios" className="hover:underline">Servicios</a></p>
            <p><a href="#reservar" className="hover:underline">Reservar</a></p>
            <p><Link href="/mi-reserva" className="hover:underline">Mi reserva</Link></p>
            {hasContact && <p><a href="#contacto" className="hover:underline">Contacto</a></p>}
            {hasFaqs && <p><a href="#faq" className="hover:underline">Preguntas frecuentes</a></p>}
            {hasPolicies && <p><a href="#politicas" className="hover:underline">Políticas</a></p>}
          </div>
        </div>
        <div className="shell border-t border-[#393a34] py-6 flex justify-between flex-wrap gap-4 text-xs">
          <span>© 2026 · {salon.name}</span>
          <Link className="hover:underline" href="/admin">
            Acceso administración
          </Link>
        </div>
      </footer>
    </main>
  );
}
