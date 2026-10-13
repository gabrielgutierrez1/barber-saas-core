'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Clock3, CheckCircle2, AlertCircle, CalendarDays, Scissors } from 'lucide-react';
import { apiFetch, money } from '../../lib/types';

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
    const raw = localStorage.getItem('lastBooking');
    if (!raw) {
      setErr('No tenemos una reserva en esta sesión.');
      return;
    }
    let data: { id: string; bookingToken: string };
    try {
      data = JSON.parse(raw);
    } catch {
      setErr('Datos de reserva inválidos');
      return;
    }

    let active = true;
    const check = async () => {
      try {
        const result = await apiFetch<ReservationDetail>(
          `/api/public/reservations/${data.id}/status`,
          { method: 'POST', body: JSON.stringify({ bookingToken: data.bookingToken }) },
        );
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
      <header className="shell w-full py-8 flex items-center justify-between">
        <Link href="/" className="brand-script">
          {salonName}
        </Link>
        <Link href="/" className="nav-link">
          <ArrowLeft size={15} className="inline mr-2" />
          Volver al salón
        </Link>
      </header>

      <div className="flex-1 flex items-center justify-center shell py-14">
        <div className="surface w-full max-w-xl p-9 md:p-14 text-center">
          {/* Status icon */}
          <div className="mx-auto mb-7 w-20 h-20 bg-[#e9eee5] rounded-full flex items-center justify-center">
            {confirmed ? (
              <CheckCircle2 size={40} color="#567857" />
            ) : review ? (
              <AlertCircle size={40} color="#9b624d" />
            ) : (
              <Clock3 size={40} color="#ad835e" />
            )}
          </div>

          <p className="mini-label mb-4" style={{ color: '#a17c59' }}>
            ESTADO DE RESERVA
          </p>
          <h1 className="serif text-5xl mb-6">
            {confirmed
              ? '¡Reserva confirmada!'
              : review
                ? 'Pago en revisión'
                : status === 'CANCELLED'
                  ? 'Reserva cancelada'
                  : status === 'EXPIRED'
                    ? 'Reserva vencida'
                    : 'Estamos verificando tu pago.'}
          </h1>
          <p className="text-[#74766e] leading-7 mb-7">
            {confirmed
              ? 'Mercado Pago confirmó tu pago. ¡Te esperamos!'
              : review
                ? 'El pago requiere revisión manual del salón. No consideres el horario confirmado hasta recibir respuesta.'
                : status === 'CANCELLED'
                  ? 'La reserva fue cancelada. Si pagaste, contacta al salón para coordinar la devolución.'
                  : status === 'EXPIRED'
                    ? 'El bloqueo del horario venció. Si pagaste, contacta al salón antes de reservar de nuevo.'
                    : 'Mercado Pago puede tardar unos momentos en notificar el resultado. No cierres esta página si quieres revisar el estado.'}
          </p>

          {/* Reservation summary */}
          {detail && (confirmed || review) && (
            <dl className="text-left space-y-3 text-sm bg-[#f7f5f0] p-5 mb-7">
              <div className="flex justify-between gap-4 border-b pb-2">
                <dt className="text-[#77796f]">Cliente</dt>
                <dd className="font-medium">{detail.customerName}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b pb-2">
                <dt className="text-[#77796f] flex items-center gap-1"><Scissors size={13} /> Servicio</dt>
                <dd className="font-medium">{detail.serviceName}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b pb-2">
                <dt className="text-[#77796f]">Profesional</dt>
                <dd className="font-medium">{detail.professional.name}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b pb-2">
                <dt className="text-[#77796f] flex items-center gap-1"><CalendarDays size={13} /> Fecha</dt>
                <dd className="font-medium text-right">{fmt(detail.startsAt, detail.timeZone)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[#77796f]">Importe</dt>
                <dd className="font-bold">{money(detail.priceSnapshot)}</dd>
              </div>
            </dl>
          )}

          {/* Contact when review */}
          {review && (contactPhone || contactEmail) && (
            <div className="status-info mb-7 text-left text-sm">
              Para consultas sobre tu pago contacta directamente al salón:{' '}
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
              Volver al salón
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
