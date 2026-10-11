'use client';
import { useEffect, useState } from 'react';
import { ArrowRight, CalendarDays, Clock3, Scissors, ShieldCheck, Sparkles } from 'lucide-react';
import { apiFetch, ApiError, money, SalonService, Salon } from '../lib/types';
export function BookingWidget({ salon, services }: { salon: Salon; services: SalonService[] }) {
  const [professionals, setProfessionals] = useState<
    { id: string; name: string; services: { id: string }[] }[]
  >([]);
  const [professionalId, setProfessionalId] = useState('');
  const [pending, setPending] = useState<any>(null);
  useEffect(() => {
    apiFetch<any[]>('/api/public/professionals')
      .then(setProfessionals)
      .catch((e) => setError(e.message));
    try {
      const saved = JSON.parse(localStorage.getItem('lastBooking') || 'null');
      if (saved?.payload) setPending(saved);
    } catch {}
  }, []);
  const [selected, setSelected] = useState(services[0]?.id || '');
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState<string[]>([]);
  const [hour, setHour] = useState('');
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  useEffect(
    () => setDate(new Date().toLocaleDateString('en-CA', { timeZone: salon.timeZone })),
    [salon.timeZone],
  );
  useEffect(() => {
    setProfessionalId(
      professionals.find((p) => p.services.some((s) => s.id === selected))?.id || '',
    );
  }, [selected, professionals]);
  useEffect(() => {
    if (!date || !selected || !professionalId) {
      setSlots([]);
      return;
    }
    let cancelled = false;
    setLoadingSlots(true);
    setHour('');
    setError('');
    apiFetch<{ slots: string[] }>(
      `/api/public/availability?serviceId=${selected}&professionalId=${professionalId}&date=${date}`,
    )
      .then((data) => {
        if (!cancelled) setSlots(data.slots);
      })
      .catch((err) => {
        if (!cancelled) {
          setSlots([]);
          setError(err instanceof Error ? err.message : 'Error consultando horarios');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSlots(false);
      });
    return () => {
      cancelled = true;
    };
  }, [date, selected, professionalId]);
  const current = services.find((v) => v.id === selected);
  async function reserve(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!pending && (!current || !hour || !date || !professionalId)) return;
    setError('');
    setLoading(true);
    let createdId = pending?.id;
    try {
      const token =
        pending?.bookingToken ||
        Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
          b.toString(16).padStart(2, '0'),
        ).join('');
      let saved = pending || {
        bookingToken: token,
        payload: {
          serviceId: selected,
          professionalId,
          date,
          time: hour,
          customerName: name,
          customerEmail: email,
          customerPhone: phone || undefined,
          bookingToken: token,
        },
      };
      localStorage.setItem('lastBooking', JSON.stringify(saved));
      setPending(saved);
      const created = await apiFetch<{ id: string; status: string; expiresAt: string }>(
        '/api/public/reservations',
        { method: 'POST', body: JSON.stringify(saved.payload) },
      );
      createdId = created.id;
      saved = { ...saved, ...created };
      localStorage.setItem('lastBooking', JSON.stringify(saved));
      setPending(saved);
      if (created.status !== 'PENDING_PAYMENT') {
        window.location.assign('/resultado');
        return;
      }
      const checkout = await apiFetch<{ checkoutUrl: string }>(
        `/api/public/reservations/${created.id}/checkout`,
        { method: 'POST', body: JSON.stringify({ bookingToken: token }) },
      );
      window.location.assign(checkout.checkoutUrl);
    } catch (err) {
      if (!createdId && err instanceof ApiError && err.status >= 400 && err.status < 500) {
        localStorage.removeItem('lastBooking');
        setPending(null);
        setHour('');
      }
      setError(
        err instanceof Error ? err.message : 'No pudimos iniciar el pago. Reintenta tu reserva.',
      );
    } finally {
      setLoading(false);
    }
  }
  async function release() {
    if (!pending) return;
    setLoading(true);
    setError('');
    try {
      const created = pending.id
        ? pending
        : await apiFetch<{ id: string }>('/api/public/reservations', {
            method: 'POST',
            body: JSON.stringify(pending.payload),
          });
      await apiFetch(`/api/public/reservations/${created.id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ bookingToken: pending.bookingToken }),
      });
      localStorage.removeItem('lastBooking');
      setPending(null);
      setHour('');
      setDate('');
    } catch (e) {
      if (!pending.id && e instanceof ApiError && e.status >= 400 && e.status < 500) {
        localStorage.removeItem('lastBooking');
        setPending(null);
        setHour('');
      } else setError(e instanceof Error ? e.message : 'No se pudo liberar la reserva');
    } finally {
      setLoading(false);
    }
  }
  return (
    <div>
      <div className="grid md:grid-cols-3 gap-4 mb-16">
        {services.length === 0 ? (
          <div className="surface p-8 md:col-span-3 text-[#77796f]">
            Aún no hay servicios publicados.
          </div>
        ) : (
          services.map((service, index) => (
            <button
              type="button"
              aria-pressed={selected === service.id}
              key={service.id}
              onClick={() => {
                setSelected(service.id);
                document
                  .getElementById('reservar')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className={`surface p-7 text-left min-h-64 flex flex-col transition-colors hover:border-[#ae9b81] ${selected === service.id ? 'border-[#ae8c72] bg-[#faf4ea]' : 'bg-[#fffdfa]'}`}
            >
              <div className="flex items-center justify-between w-full mb-12">
                <span className="text-[11px] tracking-[.15em] text-[#99978a]">
                  0{index + 1} / SERVICIO
                </span>
                {index % 2 === 0 ? (
                  <Scissors size={24} color="#ad875f" />
                ) : (
                  <Sparkles size={24} color="#ad875f" />
                )}
              </div>
              <h3 className="serif text-[27px] leading-tight mb-3">{service.name}</h3>
              <p className="text-[#898a80] text-sm leading-6 mb-8 flex-1">
                {service.description || 'Atención personalizada.'}
              </p>
              <div className="border-t border-[#e5e0d6] pt-4 flex items-center justify-between w-full">
                <span className="text-[#6f736a] text-xs">
                  <Clock3 size={13} className="inline mr-1" />
                  {service.durationMin} min
                </span>
                <strong className="text-base">{money(service.price)}</strong>
              </div>
            </button>
          ))
        )}
      </div>
      {services.length > 0 && (
        <section
          id="reservar"
          className="scroll-mt-8 grid lg:grid-cols-[.8fr_1.2fr] bg-[#eeebe4] border border-[#e3ded3]"
        >
          <div className="p-8 md:p-12 lg:p-14 border-b lg:border-b-0 lg:border-r border-[#ddd7cb]">
            <p className="mini-label mb-5" style={{ color: 'var(--brand)' }}>
              AGENDA TU CITA
            </p>
            <h3 className="serif text-5xl leading-tight mb-6">
              Un momento
              <br />
              <em>para ti.</em>
            </h3>
            <p className="text-[#73756c] leading-7 text-sm mb-9">
              Elige un día, encuentra el horario ideal y confirma tu espacio.
            </p>
            <div className="bg-white/70 border border-[#e5ded1] p-5">
              <p className="mini-label text-[#999285] mb-4">TU SELECCIÓN</p>
              <h4 className="font-bold mb-2">{current?.name}</h4>
              <div className="flex justify-between text-sm text-[#76776f]">
                <span>{current?.durationMin} minutos</span>
                <strong className="text-[#262721]">{money(current?.price || 0)}</strong>
              </div>
            </div>
            <p className="text-xs text-[#99978c] mt-6 leading-6">
              <ShieldCheck size={15} className="inline mr-2" /> El pago y la confirmación final se
              procesan de forma segura.
            </p>
          </div>
          <form onSubmit={reserve} className="p-8 md:p-12 lg:p-14 space-y-7">
            {pending && (
              <div className="status-info">
                Tienes una reserva pendiente para {pending.payload.date} a las{' '}
                {pending.payload.time}. Puedes reintentar el pago o cancelarla para elegir otra
                hora.
                <button
                  type="button"
                  className="underline block mt-2"
                  disabled={loading}
                  onClick={() => void release()}
                >
                  Cancelar esta reserva
                </button>
                <a className="underline block mt-2" href="/resultado">
                  Consultar estado
                </a>
              </div>
            )}
            <fieldset disabled={!!pending || loading} className="space-y-7">
              <div>
                <label htmlFor="professional" className="field-label">
                  Profesional
                </label>
                <select
                  id="professional"
                  className="input"
                  value={professionalId}
                  onChange={(e) => setProfessionalId(e.target.value)}
                >
                  <option value="">Selecciona un profesional</option>
                  {professionals
                    .filter((p) => p.services.some((s) => s.id === selected))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label htmlFor="book-service" className="field-label">
                  01 — Servicio
                </label>
                <select
                  id="book-service"
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                  className="input"
                >
                  {services.map((s) => (
                    <option value={s.id} key={s.id}>
                      {s.name} · {money(s.price)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="book-date" className="field-label">
                  02 — Selecciona un día
                </label>
                <input
                  required
                  id="book-date"
                  className="input"
                  type="date"
                  min={new Date().toLocaleDateString('en-CA', { timeZone: salon.timeZone })}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div>
                <span className="field-label">03 — Horas disponibles</span>
                {loadingSlots ? (
                  <p className="text-sm text-[#76776e]">Consultando horarios…</p>
                ) : slots.length ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {slots.map((slot) => (
                      <button
                        type="button"
                        key={slot}
                        onClick={() => setHour(slot)}
                        aria-pressed={hour === slot}
                        className={`py-3 text-sm border transition-colors ${hour === slot ? 'bg-[#292a25] text-white border-[#292a25]' : 'bg-white border-[#dad6cc] hover:border-[#86745c]'}`}
                      >
                        {slot}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-[#77796f] bg-white p-4">
                    No hay horas disponibles ese día. Prueba otra fecha.
                  </p>
                )}
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="book-name" className="field-label">
                    04 — Tu nombre
                  </label>
                  <input
                    id="book-name"
                    className="input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nombre completo"
                    minLength={2}
                    maxLength={100}
                    required
                    autoComplete="name"
                  />
                </div>
                <div>
                  <label htmlFor="book-phone" className="field-label">
                    Teléfono (opcional)
                  </label>
                  <input
                    id="book-phone"
                    type="tel"
                    className="input"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+56 9 1234 5678"
                    autoComplete="tel"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="book-email" className="field-label">
                  05 — Correo electrónico
                </label>
                <input
                  id="book-email"
                  className="input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="hola@correo.cl"
                  maxLength={180}
                  required
                  autoComplete="email"
                />
              </div>
            </fieldset>
            {error && (
              <div role="alert" className="status-error">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={(!pending && (!hour || !professionalId)) || loading}
              className="btn-dark w-full flex items-center justify-between"
            >
              <span>
                {loading ? 'Procesando…' : pending ? 'Reintentar pago' : 'Continuar al pago seguro'}
              </span>
              <ArrowRight size={17} />
            </button>
            <p className="text-xs text-[#858579] leading-6 text-center">
              Tu horario se mantiene provisionalmente por 15 minutos. Queda confirmado una vez
              verificado el pago.
            </p>
          </form>
        </section>
      )}
    </div>
  );
}
