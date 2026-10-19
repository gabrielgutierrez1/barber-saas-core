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
import { imageUrl } from '../lib/types';

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
  const brandColor =
    !salon.primaryColor || salon.primaryColor.toLowerCase() === '#bb865d'
      ? '#d97757'
      : salon.primaryColor;
  const brandStyle = { '--brand': brandColor } as CSSProperties;

  const hasContact = salon.contactPhone || salon.contactEmail || content.address;
  const hasPolicies = content.cancellationPolicy || content.privacyPolicy;
  const hasFaqs = content.faqs.length > 0;
  const hasTeam = professionals.length > 0;
  const hasGallery = content.gallery && content.gallery.length > 0;

  return (
    <main style={brandStyle} className="min-h-screen">
      {/* ── Topbar ─────────────────────────────────────── */}
      <div className="bg-[#090a0d] border-b border-[#1f222d] text-[#9498a6] text-[11px] font-semibold tracking-[.18em] text-center py-2.5 flex items-center justify-center gap-2.5">
        <span
          className="inline-block w-2 h-2 rounded-full animate-pulse"
          style={{ background: 'var(--brand)' }}
        />
        AGENDA EN LÍNEA 24/7 · TU ESTILO EMPIEZA AQUÍ
      </div>

      {/* ── Header / Nav ───────────────────────────────── */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-[#0f1014]/85 border-b border-[#252834]">
        <div className="shell py-5 flex items-center justify-between gap-4">
          <Link href={'/'} className="brand-script flex items-center">
            {salon.logoUrl && (
              <img
                src={salon.logoUrl}
                alt=""
                className="inline-block h-9 w-9 object-contain mr-3 rounded-md"
              />
            )}
            <span>{salon.name}</span>
            <span style={{ color: 'var(--brand)' }}>.</span>
          </Link>
          <nav className="flex items-center gap-3 sm:gap-6">
            <a href="#servicios" className="nav-link hidden md:inline">
              Servicios
            </a>
            {hasGallery && (
              <a href="#galeria" className="nav-link hidden md:inline">
                Galería
              </a>
            )}
            {hasTeam && (
              <a href="#equipo" className="nav-link hidden md:inline">
                Equipo
              </a>
            )}
            {hasContact && (
              <a href="#contacto" className="nav-link hidden lg:inline">
                Ubicación
              </a>
            )}
            <Link
              href="/mi-reserva"
              className="nav-link text-[11px] sm:text-xs px-2.5 py-1.5 rounded-md border border-[#282b37] bg-[#171920] hover:border-[var(--brand)]"
            >
              Mi reserva
            </Link>
            <a href="#reservar" className="btn-dark text-xs py-2.5 px-4 sm:py-3 sm:px-5">
              Reservar <ArrowUpRight size={14} className="inline ml-1" />
            </a>
          </nav>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────── */}
      <section className="shell grid lg:grid-cols-[1.08fr_.92fr] gap-8 lg:gap-14 py-12 lg:py-20 items-center">
        <div className="flex flex-col justify-center">
          <div className="mini-label mb-6 flex gap-3 items-center">
            <span className="w-8 h-[2px]" style={{ background: 'var(--brand)' }} />
            BARBERÍA · ESTUDIO · CUIDADO PERSONAL
          </div>
          <h1 className="serif uppercase text-[50px] sm:text-[68px] xl:text-[84px] leading-[.94] mb-8">
            Tu estilo,
            <br />
            <em>sin límites.</em>
          </h1>
          <p className="text-[#9498a6] max-w-lg text-base sm:text-lg leading-relaxed mb-9">
            {salon.description ||
              'Cortes de precisión, perfilado y cuidado personal en un ambiente urbano. Agenda tu turno en segundos, sin llamadas ni esperas.'}
          </p>
          <div className="flex flex-wrap gap-3.5">
            <a href="#reservar" className="btn-dark inline-flex items-center gap-3">
              <span>Agendar mi turno</span>
              <ArrowUpRight size={17} />
            </a>
            <Link href="/mi-reserva" className="btn-outline inline-flex items-center">
              Consultar mi reserva
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-12 text-xs text-[#b4b8c5]">
            <span className="surface px-4 py-2.5 inline-flex items-center gap-2 rounded-lg">
              <CalendarDays size={15} style={{ color: 'var(--brand)' }} />
              {salon.workDays
                .map((d) => ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'][d])
                .join(' · ')}
            </span>
            <span className="surface px-4 py-2.5 inline-flex items-center gap-2 rounded-lg">
              <Clock3 size={15} style={{ color: 'var(--brand)' }} />
              {salon.openingHour}:00 – {salon.closingHour}:00 hrs
            </span>
          </div>
        </div>
        <div className="hero-art min-h-[380px] lg:min-h-[540px]">
          <div className="orb" />
          <div className="absolute z-10 top-8 left-8 bg-[#0f1014]/80 backdrop-blur-md border border-[#2b2f3d] px-3.5 py-1.5 rounded-full text-[11px] font-bold tracking-[.18em] text-[#f4f4f6]">
            EST. 2026
          </div>
          <div className="absolute z-10 top-8 right-8 text-xs font-mono tracking-[.2em] text-[#9498a6]">
            // STUDIO
          </div>
          <div className="absolute left-8 right-8 bottom-8 z-10 bg-[#0f1014]/75 backdrop-blur-md border border-[#2b2f3d] p-5 rounded-xl flex items-end justify-between gap-4">
            <div>
              <p className="mini-label mb-1.5">PRECISIÓN &amp; ACTITUD</p>
              <p className="serif text-2xl sm:text-3xl uppercase">Domina tu imagen.</p>
            </div>
            <span
              className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 text-[#0f1014]"
              style={{ background: 'var(--brand)' }}
            >
              <ArrowUpRight size={20} />
            </span>
          </div>
        </div>
      </section>

      {/* ── Band ───────────────────────────────────────── */}
      <section className="bg-[#14161d] border-y border-[#252834] py-4 text-center">
        <span className="mini-label tracking-[.25em] text-[#c4c8d4]">
          CORTE DE PRECISIÓN &nbsp;·&nbsp; AGENDA EN TIEMPO REAL &nbsp;·&nbsp; CONFIRMACIÓN INMEDIATA
        </span>
      </section>

      {/* ── Servicios + Widget ─────────────────────────── */}
      <section id="servicios" className="shell py-20 lg:py-28">
        <div className="flex items-end justify-between gap-5 flex-wrap mb-12">
          <div>
            <p className="mini-label mb-3">CATÁLOGO DE SERVICIOS</p>
            <h2 className="serif uppercase text-4xl sm:text-5xl lg:text-6xl">
              Elige tu <em>servicio.</em>
            </h2>
          </div>
          <p className="text-[#9498a6] max-w-xs text-sm leading-6">
            Selecciona un servicio de la carta para ver disponibilidad en vivo y reservar tu hora.
          </p>
        </div>
        <BookingWidget salon={salon} services={services} />
      </section>

      {/* ── Sobre el salón (si existe) ─────────────────── */}
      {content.about && (
        <section className="bg-[#13151c] border-y border-[#252834] py-20">
          <div className="shell max-w-4xl">
            <p className="mini-label mb-3">NUESTRA ESENCIA</p>
            <h2 className="serif uppercase text-4xl sm:text-5xl mb-6">
              Más que un <em>corte.</em>
            </h2>
            <p className="text-[#b4b8c5] text-base sm:text-lg leading-8 whitespace-pre-line">
              {content.about}
            </p>
          </div>
        </section>
      )}

      {/* ── Equipo ─────────────────────────────────────── */}
      {hasTeam && (
        <section id="equipo" className="py-20 lg:py-28 border-t border-[#222530]">
          <div className="shell">
            <div className="mb-12">
              <p className="mini-label mb-3 flex items-center gap-2">
                <Users size={14} /> STAFF PROFESIONAL
              </p>
              <h2 className="serif uppercase text-4xl sm:text-5xl lg:text-6xl">
                Nuestro <em>equipo.</em>
              </h2>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {professionals.map((pro) => (
                <div
                  key={pro.id}
                  className="surface p-7 flex flex-col gap-5 hover:border-[#3b4052] transition-colors"
                >
                  <div className="flex items-center gap-4">
                    {pro.photoUrl ? (
                      <img
                        src={pro.photoUrl}
                        alt={pro.name}
                        className="w-16 h-16 rounded-full object-cover border-2"
                        style={{ borderColor: 'var(--brand)' }}
                      />
                    ) : (
                      <div
                        className="w-16 h-16 rounded-full bg-[#222530] border-2 flex items-center justify-center text-xl font-bold"
                        style={{ borderColor: 'var(--brand)', color: 'var(--brand)' }}
                      >
                        {pro.name[0]}
                      </div>
                    )}
                    <div>
                      <h3 className="serif text-2xl uppercase">{pro.name}</h3>
                      {pro.specialties && (
                        <p className="text-xs font-semibold tracking-wider uppercase mt-1" style={{ color: 'var(--brand)' }}>
                          {pro.specialties}
                        </p>
                      )}
                    </div>
                  </div>
                  {pro.bio && (
                    <p className="text-sm text-[#9498a6] leading-6">{pro.bio}</p>
                  )}
                  {pro.services.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-auto pt-3 border-t border-[#252834]">
                      {pro.services.map((s) => (
                        <span
                          key={s.id}
                          className="text-[11px] font-medium tracking-wide bg-[#20232e] text-[#c4c8d4] border border-[#2d3140] px-2.5 py-1 rounded-md"
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

      {/* ── Galería (si existe) ────────────────────────── */}
      {hasGallery && (
        <section id="galeria" aria-labelledby="gallery-title" className="py-20 lg:py-28 border-t border-[#222530]">
          <div className="shell">
            <div className="mb-12">
              <p className="mini-label mb-3">PORTAFOLIO</p>
              <h2 id="gallery-title" className="serif uppercase text-4xl sm:text-5xl lg:text-6xl">
                Nuestro <em>trabajo.</em>
              </h2>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {content.gallery.map((item, i) => (
                <figure key={`${item.url}-${i}`} className="surface overflow-hidden group">
                  <div className="aspect-[4/3] overflow-hidden bg-[#111318]">
                    <img
                      src={imageUrl(item.url)}
                      alt={item.caption || 'Trabajo del estudio'}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                  {item.caption && (
                    <figcaption className="p-4 text-xs text-[#9498a6] tracking-wide">
                      {item.caption}
                    </figcaption>
                  )}
                </figure>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Cómo funciona ──────────────────────────────── */}
      <section className="bg-[#14161d] border-y border-[#252834] py-20">
        <div className="shell grid md:grid-cols-2 gap-10 items-center">
          <div>
            <p className="mini-label mb-4">RESERVA RÁPIDA</p>
            <h2 className="serif uppercase text-4xl sm:text-5xl lg:text-6xl leading-tight">
              Tu silla lista
              <br />
              <em>cuando llegues.</em>
            </h2>
          </div>
          <div className="space-y-4">
            <p className="text-[#9498a6] text-sm leading-7 mb-4">
              Elige tu servicio, selecciona a tu profesional de confianza y asegura tu hora en menos de un minuto.
            </p>
            <div className="surface p-4 flex items-center gap-3.5">
              <CheckCircle2 size={20} style={{ color: 'var(--brand)' }} className="shrink-0" />
              <span className="text-sm font-medium">Disponibilidad actualizada en tiempo real</span>
            </div>
            <div className="surface p-4 flex items-center gap-3.5">
              <CheckCircle2 size={20} style={{ color: 'var(--brand)' }} className="shrink-0" />
              <span className="text-sm font-medium">Pago online protegido por Mercado Pago</span>
            </div>
            <div className="surface p-4 flex items-center gap-3.5">
              <CheckCircle2 size={20} style={{ color: 'var(--brand)' }} className="shrink-0" />
              <span className="text-sm font-medium">
                Gestiona o reprograma tu cita desde{' '}
                <Link href="/mi-reserva" className="underline" style={{ color: 'var(--brand)' }}>
                  Mi reserva
                </Link>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Contacto y ubicación ───────────────────────── */}
      {hasContact && (
        <section id="contacto" className="shell py-20 lg:py-28">
          <div className="mb-12">
            <p className="mini-label mb-3 flex items-center gap-2">
              <MapPin size={14} /> DÓNDE ESTAMOS
            </p>
            <h2 className="serif uppercase text-4xl sm:text-5xl lg:text-6xl">
              Contacto <em>y ubicación.</em>
            </h2>
          </div>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="surface p-8 space-y-6">
              {salon.contactPhone && (
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-[#20232e] flex items-center justify-center shrink-0">
                    <Phone size={18} style={{ color: 'var(--brand)' }} />
                  </div>
                  <div>
                    <p className="mini-label text-[#9498a6] mb-1">TELÉFONO / WHATSAPP</p>
                    <a
                      href={`tel:${salon.contactPhone}`}
                      className="text-lg font-semibold hover:underline"
                    >
                      {salon.contactPhone}
                    </a>
                  </div>
                </div>
              )}
              {salon.contactEmail && (
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-[#20232e] flex items-center justify-center shrink-0">
                    <Mail size={18} style={{ color: 'var(--brand)' }} />
                  </div>
                  <div>
                    <p className="mini-label text-[#9498a6] mb-1">CORREO</p>
                    <a
                      href={`mailto:${salon.contactEmail}`}
                      className="text-lg font-semibold hover:underline"
                    >
                      {salon.contactEmail}
                    </a>
                  </div>
                </div>
              )}
              {content.address && (
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-[#20232e] flex items-center justify-center shrink-0">
                    <MapPin size={18} style={{ color: 'var(--brand)' }} />
                  </div>
                  <div>
                    <p className="mini-label text-[#9498a6] mb-1">DIRECCIÓN</p>
                    <p className="text-base font-medium leading-7">{content.address}</p>
                  </div>
                </div>
              )}
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-[#20232e] flex items-center justify-center shrink-0">
                  <CalendarDays size={18} style={{ color: 'var(--brand)' }} />
                </div>
                <div>
                  <p className="mini-label text-[#9498a6] mb-1">HORARIO DE ATENCIÓN</p>
                  <p className="leading-7 text-sm text-[#c4c8d4]">
                    {salon.workDays
                      .map((d) => ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'][d])
                      .join(' · ')}
                    <br />
                    <strong className="text-[#f4f4f6]">
                      {salon.openingHour}:00 – {salon.closingHour}:00 hrs
                    </strong>
                  </p>
                </div>
              </div>
            </div>
            {content.address && (
              <div className="surface p-8 flex flex-col justify-between pattern min-h-[260px]">
                <div>
                  <span className="mini-label">CÓMO LLEGAR</span>
                  <h3 className="serif text-3xl uppercase mt-2 mb-3">{salon.name}</h3>
                  <p className="text-sm text-[#9498a6] leading-6">{content.address}</p>
                </div>
                <div className="mt-8">
                  <a
                    href={`https://maps.google.com/?q=${encodeURIComponent(content.address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-outline inline-flex items-center gap-2"
                  >
                    Abrir ubicación en Google Maps <ArrowUpRight size={15} />
                  </a>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── FAQs ───────────────────────────────────────── */}
      {hasFaqs && (
        <section id="faq" className="py-20 lg:py-28 border-t border-[#222530]">
          <div className="shell">
            <div className="mb-10">
              <p className="mini-label mb-3 flex items-center gap-2">
                <HelpCircle size={14} /> PREGUNTAS FRECUENTES
              </p>
              <h2 className="serif uppercase text-4xl sm:text-5xl lg:text-6xl">
                Dudas <em>frecuentes.</em>
              </h2>
            </div>
            <div className="max-w-3xl space-y-4">
              {content.faqs.map((faq, i) => (
                <details key={i} className="surface p-6 group">
                  <summary className="cursor-pointer font-semibold text-base list-none flex justify-between items-center gap-4">
                    <span>{faq.question}</span>
                    <span
                      className="text-xl font-bold shrink-0 transition-transform duration-200 group-open:rotate-45"
                      style={{ color: 'var(--brand)' }}
                    >
                      +
                    </span>
                  </summary>
                  <p className="mt-4 text-sm text-[#9498a6] leading-7 border-t border-[#252834] pt-4">
                    {faq.answer}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Políticas ──────────────────────────────────── */}
      {hasPolicies && (
        <section id="politicas" className="shell py-20 lg:py-28 border-t border-[#222530]">
          <div className="mb-10">
            <p className="mini-label mb-3 flex items-center gap-2">
              <ShieldCheck size={14} /> POLÍTICAS DEL ESTUDIO
            </p>
            <h2 className="serif uppercase text-4xl sm:text-5xl lg:text-6xl">
              Condiciones <em>y privacidad.</em>
            </h2>
          </div>
          <div className="grid md:grid-cols-2 gap-8 max-w-5xl">
            {content.cancellationPolicy && (
              <div className="surface p-7">
                <div className="flex items-center gap-3 mb-4">
                  <BookOpen size={18} style={{ color: 'var(--brand)' }} />
                  <h3 className="font-bold text-lg">Cancelación y reprogramación</h3>
                </div>
                <p className="text-sm text-[#9498a6] leading-7 whitespace-pre-line">
                  {content.cancellationPolicy}
                </p>
              </div>
            )}
            {content.privacyPolicy && (
              <div className="surface p-7">
                <div className="flex items-center gap-3 mb-4">
                  <ShieldCheck size={18} style={{ color: 'var(--brand)' }} />
                  <h3 className="font-bold text-lg">Privacidad</h3>
                </div>
                <p className="text-sm text-[#9498a6] leading-7 whitespace-pre-line">
                  {content.privacyPolicy}
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Footer ─────────────────────────────────────── */}
      <footer className="bg-[#090a0d] border-t border-[#1f222d] text-[#9498a6]">
        <div className="shell py-14 grid sm:grid-cols-2 md:grid-cols-3 gap-8">
          <div>
            <Link href={'/'} className="brand-script text-[#f4f4f6] block mb-3">
              {salon.name}
              <span style={{ color: 'var(--brand)' }}>.</span>
            </Link>
            {content.address && <p className="text-xs leading-6">{content.address}</p>}
          </div>
          <div className="space-y-2 text-xs">
            <p className="mini-label mb-3">CONTACTO</p>
            {salon.contactPhone && (
              <p>
                <a href={`tel:${salon.contactPhone}`} className="hover:text-[#f4f4f6] transition-colors">
                  {salon.contactPhone}
                </a>
              </p>
            )}
            {salon.contactEmail && (
              <p>
                <a href={`mailto:${salon.contactEmail}`} className="hover:text-[#f4f4f6] transition-colors">
                  {salon.contactEmail}
                </a>
              </p>
            )}
          </div>
          <div className="space-y-2.5 text-xs">
            <p className="mini-label mb-3">NAVEGACIÓN</p>
            <p>
              <a href="#servicios" className="hover:text-[#f4f4f6] transition-colors">
                Servicios
              </a>
            </p>
            <p>
              <a href="#reservar" className="hover:text-[#f4f4f6] transition-colors">
                Reservar
              </a>
            </p>
            <p>
              <Link href="/mi-reserva" className="hover:text-[#f4f4f6] transition-colors">
                Mi reserva
              </Link>
            </p>
            {hasContact && (
              <p>
                <a href="#contacto" className="hover:text-[#f4f4f6] transition-colors">
                  Contacto
                </a>
              </p>
            )}
            {hasFaqs && (
              <p>
                <a href="#faq" className="hover:text-[#f4f4f6] transition-colors">
                  Preguntas frecuentes
                </a>
              </p>
            )}
            {hasPolicies && (
              <p>
                <a href="#politicas" className="hover:text-[#f4f4f6] transition-colors">
                  Políticas
                </a>
              </p>
            )}
          </div>
        </div>
        <div className="shell border-t border-[#191c26] py-6 flex justify-between flex-wrap gap-4 text-xs">
          <span>© 2026 · {salon.name}</span>
          <Link className="hover:text-[#f4f4f6] transition-colors" href="/admin">
            Acceso administración →
          </Link>
        </div>
      </footer>
    </main>
  );
}
