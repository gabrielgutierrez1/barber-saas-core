'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, AlertCircle, Clock3, CalendarDays, Scissors, RotateCcw } from 'lucide-react';
import { apiFetch, money } from '../../lib/types';

type Status = 'PENDING_PAYMENT' | 'CONFIRMED' | 'EXPIRED' | 'CANCELLED' | 'PAYMENT_REVIEW' | '';

type ReservationDetail = {
  id: string;
  status: Status;
  startsAt: string;
  endsAt: string;
  serviceName: string;
  serviceId: string;
  professionalId: string;
  professional: { name: string };
  priceSnapshot: number;
  timeZone: string;
  customerName: string;
};

type Professional = { id: string; name: string; services: { id: string }[] };

const STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: 'Pendiente de pago',
  CONFIRMED: 'Confirmada',
  EXPIRED: 'Vencida',
  CANCELLED: 'Cancelada',
  PAYMENT_REVIEW: 'Pago en revisión',
};

export default function MyReservationPage() {
  const [salonName, setSalonName] = useState('Mi salón');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [timeZone, setTimeZone] = useState('America/Santiago');

  // Recovery form state
  const [recoverEmail, setRecoverEmail] = useState('');
  const [recoverResId, setRecoverResId] = useState('');
  const [recoverSent, setRecoverSent] = useState(false);
  const [recoverBusy, setRecoverBusy] = useState(false);
  const [recoverError, setRecoverError] = useState('');

  // Reservation detail state
  const [token, setToken] = useState('');
  const [detail, setDetail] = useState<ReservationDetail | null>(null);
  const [fetchErr, setFetchErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  // Reschedule state
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleProId, setRescheduleProId] = useState('');
  const [rescheduleSlots, setRescheduleSlots] = useState<string[]>([]);
  const [rescheduleHour, setRescheduleHour] = useState('');
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [professionals, setProfessionals] = useState<Professional[]>([]);

  useEffect(() => {
    apiFetch<{ name: string; contactPhone: string; contactEmail: string; timeZone: string }>('/api/public/info')
      .then((s) => {
        setSalonName(s.name);
        setContactPhone(s.contactPhone);
        setContactEmail(s.contactEmail);
        setTimeZone(s.timeZone);
      })
      .catch(() => {});
    apiFetch<Professional[]>('/api/public/professionals')
      .then(setProfessionals)
      .catch(() => {});
  }, []);

  // On load: read id + token from hash
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const id = params.get('id');
    const t = params.get('token');
    if (id && t) {
      history.replaceState(null, '', location.pathname);
      fetchDetail(id, t);
    } else {
      // Try localStorage fallback
      try {
        const saved = JSON.parse(localStorage.getItem('lastBooking') || 'null');
        if (saved?.id && saved?.bookingToken) fetchDetail(saved.id, saved.bookingToken);
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchDetail(id: string, t: string) {
    setBusy(true);
    setFetchErr('');
    try {
      const r = await apiFetch<ReservationDetail>(`/api/public/reservations/${id}/status`, {
        method: 'POST',
        body: JSON.stringify({ bookingToken: t }),
      });
      setDetail(r);
      setToken(t);
      setRescheduleProId(r.professionalId);
    } catch (e) {
      setFetchErr(e instanceof Error ? e.message : 'No se pudo consultar la reserva');
    } finally {
      setBusy(false);
    }
  }

  async function handleRecover(e: React.FormEvent) {
    e.preventDefault();
    setRecoverBusy(true);
    setRecoverError('');
    try {
      await apiFetch('/api/public/reservations/recover', {
        method: 'POST',
        body: JSON.stringify({ reservationId: recoverResId.trim(), email: recoverEmail }),
      });
      setRecoverSent(true);
    } catch (err) {
      setRecoverError(err instanceof Error ? err.message : 'No se pudo enviar el acceso');
    } finally {
      setRecoverBusy(false);
    }
  }

  async function cancelReservation() {
    if (!detail || !window.confirm('¿Cancelar esta reserva?')) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/public/reservations/${detail.id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ bookingToken: token }),
      });
      setDetail({ ...detail, status: 'CANCELLED' });
      setNotice('Reserva cancelada.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cancelar');
    } finally {
      setBusy(false);
    }
  }

  // Load slots when reschedule panel is open and date/professional changes
  useEffect(() => {
    if (!showReschedule || !rescheduleDate || !rescheduleProId || !detail) {
      setRescheduleSlots([]);
      return;
    }
    let cancelled = false;
    setLoadingSlots(true);
    setRescheduleHour('');
    apiFetch<{ slots: string[] }>(`/api/public/reservations/${detail.id}/availability`, {
      method: 'POST',
      body: JSON.stringify({ bookingToken: token, professionalId: rescheduleProId, date: rescheduleDate }),
    })
      .then((r) => { if (!cancelled) setRescheduleSlots(r.slots); })
      .catch(() => { if (!cancelled) setRescheduleSlots([]); })
      .finally(() => { if (!cancelled) setLoadingSlots(false); });
    return () => { cancelled = true; };
  }, [showReschedule, rescheduleDate, rescheduleProId, detail, token]);

  async function doReschedule(e: React.FormEvent) {
    e.preventDefault();
    if (!detail || !rescheduleHour) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/public/reservations/${detail.id}/move`, {
        method: 'POST',
        body: JSON.stringify({ bookingToken: token, professionalId: rescheduleProId, date: rescheduleDate, time: rescheduleHour }),
      });
      setNotice('Reserva reprogramada correctamente.');
      setShowReschedule(false);
      await fetchDetail(detail.id, token);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo reprogramar');
    } finally {
      setBusy(false);
    }
  }

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('es-CL', { timeZone, dateStyle: 'full', timeStyle: 'short' });

  const statusIcon = (s: Status) => {
    if (s === 'CONFIRMED') return <CheckCircle2 size={38} color="#34d399" />;
    if (s === 'PAYMENT_REVIEW') return <AlertCircle size={38} color="#f59e0b" />;
    return <Clock3 size={38} color="#d97757" />;
  };

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

      <div className="flex-1 shell py-12 max-w-2xl mx-auto w-full">
        {busy && <p className="text-center text-[#9498a6] py-10">Cargando…</p>}

        {/* ── Reservation detail ─────────────────────── */}
        {!busy && detail && (
          <div className="surface p-8 md:p-12">
            <div className="mx-auto mb-6 w-16 h-16 bg-[#20232e] border border-[#2d3140] rounded-2xl flex items-center justify-center">
              {statusIcon(detail.status)}
            </div>
            <p className="mini-label text-center mb-3">TU RESERVA</p>
            <h1 className="serif uppercase text-3xl sm:text-4xl text-center mb-8">
              {STATUS_LABEL[detail.status] || detail.status}
            </h1>

            <dl className="space-y-4 text-sm bg-[#12141b] border border-[#252834] rounded-xl p-6">
              <div className="flex justify-between gap-4 border-b border-[#252834] pb-3">
                <dt className="text-[#9498a6]">Cliente</dt>
                <dd className="font-semibold text-right">{detail.customerName}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-[#252834] pb-3">
                <dt className="text-[#9498a6] flex items-center gap-2">
                  <Scissors size={14} style={{ color: 'var(--brand)' }} /> Servicio
                </dt>
                <dd className="font-semibold text-right">{detail.serviceName}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-[#252834] pb-3">
                <dt className="text-[#9498a6]">Profesional</dt>
                <dd className="font-semibold text-right">{detail.professional.name}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-[#252834] pb-3">
                <dt className="text-[#9498a6] flex items-center gap-2">
                  <CalendarDays size={14} style={{ color: 'var(--brand)' }} /> Fecha y hora
                </dt>
                <dd className="font-semibold text-right">{fmt(detail.startsAt)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[#9498a6]">Importe</dt>
                <dd className="serif text-base font-bold text-right" style={{ color: 'var(--brand)' }}>
                  {money(detail.priceSnapshot)}
                </dd>
              </div>
            </dl>

            {notice && <p role="status" className="status-info mt-6">{notice}</p>}
            {error && <p role="alert" className="status-error mt-6">{error}</p>}

            {detail.status === 'PAYMENT_REVIEW' && (
              <div className="status-info mt-6 text-sm">
                Tu pago está en revisión manual. No consideres el horario confirmado hasta recibir
                respuesta.{' '}
                {(contactPhone || contactEmail) && (
                  <>
                    Contacto directo: {contactPhone && <strong>{contactPhone}</strong>}
                    {contactPhone && contactEmail && ' · '}
                    {contactEmail && (
                      <a className="underline" href={`mailto:${contactEmail}`}>
                        {contactEmail}
                      </a>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Actions */}
            {detail.status === 'CONFIRMED' && (
              <div className="mt-8 space-y-4">
                <button
                  className="btn-outline w-full flex items-center justify-center gap-2"
                  disabled={busy}
                  onClick={() => setShowReschedule((v) => !v)}
                >
                  <RotateCcw size={16} />
                  {showReschedule ? 'Cerrar reprogramación' : 'Reprogramar cita'}
                </button>
                {showReschedule && (
                  <form onSubmit={doReschedule} className="bg-[#12141b] border border-[#282b37] rounded-xl p-6 space-y-5">
                    <h2 className="serif uppercase text-2xl mb-2">Nueva fecha</h2>
                    <label className="block text-sm">
                      <span className="field-label">Profesional</span>
                      <select
                        className="input"
                        value={rescheduleProId}
                        onChange={(e) => setRescheduleProId(e.target.value)}
                      >
                        {professionals
                          .filter((p) => p.services.some((s) => s.id === detail.serviceId))
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label className="block text-sm">
                      <span className="field-label">Fecha</span>
                      <input
                        className="input"
                        type="date"
                        required
                        min={new Date().toLocaleDateString('en-CA', { timeZone })}
                        value={rescheduleDate}
                        onChange={(e) => setRescheduleDate(e.target.value)}
                      />
                    </label>
                    {rescheduleDate && (
                      <div>
                        <span className="field-label">Horas disponibles</span>
                        {loadingSlots ? (
                          <p className="text-sm text-[#9498a6]">Consultando horarios…</p>
                        ) : rescheduleSlots.length ? (
                          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                            {rescheduleSlots.map((slot) => (
                              <button
                                type="button"
                                key={slot}
                                onClick={() => setRescheduleHour(slot)}
                                className={`py-3 text-sm font-semibold rounded-lg border transition-colors ${
                                  rescheduleHour === slot
                                    ? 'bg-[var(--brand)] text-[#0f1014] border-[var(--brand)]'
                                    : 'bg-[#171920] text-[#f4f4f6] border-[#2b2f3d] hover:border-[var(--brand)]'
                                }`}
                              >
                                {slot}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-[#9498a6] bg-[#171920] border border-[#2b2f3d] rounded-lg p-4">
                            No hay horas disponibles. Prueba otra fecha.
                          </p>
                        )}
                      </div>
                    )}
                    <button
                      className="btn-dark w-full"
                      type="submit"
                      disabled={busy || !rescheduleHour}
                    >
                      {busy ? 'Reprogramando…' : 'Confirmar nueva fecha'}
                    </button>
                  </form>
                )}
                <button
                  className="underline text-sm text-[#9498a6] hover:text-[#fca5a5] w-full text-center pt-2"
                  disabled={busy}
                  onClick={cancelReservation}
                >
                  Cancelar reserva
                </button>
              </div>
            )}

            {['CANCELLED', 'EXPIRED'].includes(detail.status) && (
              <div className="mt-8 text-center">
                <Link href="/#reservar" className="btn-dark inline-block">
                  Hacer nueva reserva
                </Link>
              </div>
            )}
          </div>
        )}

        {/* ── Error fetching ─────────────────────────── */}
        {!busy && fetchErr && (
          <div className="surface p-8 text-center mb-6">
            <p role="alert" className="status-error mb-6">{fetchErr}</p>
            <p className="text-sm text-[#9498a6]">
              Si llegaste desde un enlace de correo, verifica que no haya expirado (30 minutos).
            </p>
          </div>
        )}

        {/* ── Recovery form ─────────────────────────── */}
        {!busy && !detail && (
          <div className="space-y-6">
            {!fetchErr && (
              <div className="surface p-6 text-center text-[#9498a6] text-sm">
                No tienes una reserva activa guardada en este dispositivo.
              </div>
            )}
            <div className="surface p-8 md:p-10">
              <p className="mini-label mb-2">PORTAL CLIENTE</p>
              <h2 className="serif uppercase text-3xl mb-3">Consultar mi reserva</h2>
              <p className="text-sm text-[#9498a6] mb-7 leading-6">
                Ingresa el código de tu reserva (enviado a tu correo) y tu dirección de email. Te enviaremos un enlace de acceso directo.
              </p>
              {recoverSent ? (
                <p role="status" className="status-info">
                  Si los datos coinciden, recibirás un correo con el enlace de acceso en breve.
                </p>
              ) : (
                <form onSubmit={handleRecover} className="space-y-5">
                  <label className="block text-sm">
                    <span className="field-label">Código de reserva</span>
                    <input
                      className="input"
                      required
                      placeholder="Ej: a1b2c3d4-e5f6-..."
                      value={recoverResId}
                      onChange={(e) => setRecoverResId(e.target.value)}
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="field-label">Correo electrónico con el que reservaste</span>
                    <input
                      className="input"
                      type="email"
                      required
                      value={recoverEmail}
                      onChange={(e) => setRecoverEmail(e.target.value)}
                      placeholder="tu@correo.cl"
                    />
                  </label>
                  {recoverError && <p role="alert" className="status-error">{recoverError}</p>}
                  <button className="btn-dark w-full sm:w-auto" type="submit" disabled={recoverBusy}>
                    {recoverBusy ? 'Enviando…' : 'Enviar enlace de acceso'}
                  </button>
                </form>
              )}
            </div>
          </div>
        )}
      </div>

      <footer className="shell py-10 text-center text-xs text-[#9498a6]">
        © 2026 · {salonName}
      </footer>
    </main>
  );
}

