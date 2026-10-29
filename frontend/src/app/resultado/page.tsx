'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Clock3, CheckCircle2, AlertCircle, CalendarDays, Scissors } from 'lucide-react';
import { apiFetch, money } from '../../lib/types';

import { loadBookingStatus } from '../../lib/booking-return';

type Status = 'PENDING_PAYMENT' | 'CONFIRMED' | 'EXPIRED' | 'CANCELLED' | 'PAYMENT_REVIEW' | '';

type ReservationDetail = {
  id: string;
  status: Status;
  startsAt: string;
  endsAt: string;
  serviceName: string;
  professional: { name: string };
  priceSnapshot: number;
  timeZone: string;
  customerName: string;
};

export default function ResultPage() {
  const [salonName, setSalonName] = useState('Mi salón');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');

  const [status, setStatus] = useState<Status>('');
  const [detail, setDetail] = useState<ReservationDetail | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    apiFetch<{ name: string; contactPhone: string; contactEmail: string }>('/api/public/info')
      .then((s) => {
        setSalonName(s.name);
        setContactPhone(s.contactPhone);
        setContactEmail(s.contactEmail);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const result = await loadBookingStatus<ReservationDetail>(localStorage);
        if (active) {
          setStatus(result.status);
          setDetail(result);
          setErr('');
          if (result.status !== 'PENDING_PAYMENT') clearInterval(timer);
        }
      } catch (error) {
        if (active)
          setErr(error instanceof Error ? error.message : 'No se pudo consultar el estado');
      }
    };
    const timer = setInterval(() => void check(), 5000);
    void check();
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const confirmed = status === 'CONFIRMED';
  const review = status === 'PAYMENT_REVIEW';

  const fmt = (iso: string, tz: string) =>
    new Date(iso).toLocaleString('es-CL', {
      timeZone: tz,
      dateStyle: 'full',
      timeStyle: 'short',
    });

  return (
    <main className="min-h-screen flex flex-col">
      <header className="border-b border-[#252834] bg-[#0f1014]/85 backdrop-blur-md">
        <div className="shell w-full py-6 flex items-center justify-between">
          <Link href="/" className="brand-script">
            {salonName}
            <span style={{ color: 'var(--brand)' }}>.</span>
          </Link>
          <Link href="/" className="nav-link inline-flex items-center">
            <ArrowLeft size={15} className="mr-2" />
            Volver al estudio
          </Link>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center shell py-14">
        <div className="surface w-full max-w-xl p-9 md:p-14 text-center">
          {/* Status icon */}
          <div className="mx-auto mb-7 w-20 h-20 bg-[#20232e] border border-[#2d3140] rounded-2xl flex items-center justify-center">
            {confirmed ? (
              <CheckCircle2 size={40} color="#34d399" />
            ) : review ? (
              <AlertCircle size={40} color="#f59e0b" />
            ) : (
              <Clock3 size={40} color="#d97757" />
            )}
          </div>

          <p className="mini-label mb-3">ESTADO DE RESERVA</p>
          <h1 className="serif uppercase text-4xl sm:text-5xl mb-5">
            {confirmed
              ? '¡Reserva confirmada!'
              : review
                ? 'Pago en revisión'
                : status === 'CANCELLED'
                  ? 'Reserva cancelada'
                  : status === 'EXPIRED'
                    ? 'Reserva vencida'
                    : err && !status
                      ? 'No pudimos consultar tu reserva'
                      : 'Verificando tu pago…'}
          </h1>
          <p className="text-[#9498a6] leading-7 mb-7 text-sm sm:text-base">
            {confirmed
              ? 'Mercado Pago confirmó tu pago. ¡Tu silla te espera!'
              : review
                ? 'El pago requiere revisión manual del estudio. No consideres el horario confirmado hasta recibir respuesta.'
                : status === 'CANCELLED'
                  ? 'La reserva fue cancelada. Si pagaste, contacta al estudio para coordinar la devolución.'
                  : status === 'EXPIRED'
                    ? 'El bloqueo del horario venció. Si pagaste, contacta al estudio antes de reservar de nuevo.'
                    : 'Mercado Pago puede tardar unos momentos en notificar el resultado. No cierres esta página si quieres revisar el estado.'}
          </p>

          {/* Reservation summary */}
          {detail && (confirmed || review) && (
            <dl className="text-left space-y-3 text-sm bg-[#12141b] border border-[#252834] rounded-xl p-5 mb-7">
              <div className="flex justify-between gap-4 border-b border-[#252834] pb-2.5">
                <dt className="text-[#9498a6]">Cliente</dt>
                <dd className="font-semibold">{detail.customerName}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-[#252834] pb-2.5">
                <dt className="text-[#9498a6] flex items-center gap-1.5">
                  <Scissors size={13} style={{ color: 'var(--brand)' }} /> Servicio
                </dt>
                <dd className="font-semibold">{detail.serviceName}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-[#252834] pb-2.5">
                <dt className="text-[#9498a6]">Profesional</dt>
                <dd className="font-semibold">{detail.professional.name}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-[#252834] pb-2.5">
                <dt className="text-[#9498a6] flex items-center gap-1.5">
                  <CalendarDays size={13} style={{ color: 'var(--brand)' }} /> Fecha
                </dt>
                <dd className="font-semibold text-right">
                  {fmt(detail.startsAt, detail.timeZone)}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[#9498a6]">Importe</dt>
                <dd className="serif font-bold" style={{ color: 'var(--brand)' }}>
                  {money(detail.priceSnapshot)}
                </dd>
              </div>
            </dl>
          )}

          {/* Contact when review */}
          {review && (contactPhone || contactEmail) && (
            <div className="status-info mb-7 text-left text-sm">
              Para consultas sobre tu pago contacta directamente al estudio:{' '}
              {contactPhone && (
                <a href={`tel:${contactPhone}`} className="font-semibold underline">
                  {contactPhone}
                </a>
              )}
              {contactPhone && contactEmail && ' · '}
              {contactEmail && (
                <a href={`mailto:${contactEmail}`} className="underline">
                  {contactEmail}
                </a>
              )}
            </div>
          )}

          {err && (
            <div role="alert" className="status-error mb-6">
              {err}
            </div>
          )}
          {!err && !confirmed && status !== 'CANCELLED' && status !== 'EXPIRED' && (
            <div className="status-info mb-7 text-left">
              No basta con volver a esta pantalla: la confirmación depende del pago verificado
              mediante la notificación segura.
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/mi-reserva" className="btn-outline inline-block">
              Ver mi reserva
            </Link>
            <Link href="/" className="btn-dark inline-block">
              Volver al estudio
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
