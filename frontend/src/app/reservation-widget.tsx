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
      <div className="grid md:grid-cols-3 gap-5 mb-16">
        {services.length === 0 ? (
          <div className="surface p-8 md:col-span-3 text-[#9498a6]">
            Aún no hay servicios publicados.
          </div>
        ) : (
          services.map((service, index) => {
            const isSelected = selected === service.id;
            return (
              <button
                type="button"
                aria-pressed={isSelected}
                key={service.id}
                onClick={() => {
                  setSelected(service.id);
                  document
                    .getElementById('reservar')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className={`surface p-7 text-left min-h-56 flex flex-col transition-all duration-200 ${
                  isSelected
                    ? 'border-[var(--brand)] bg-[#1d1818] shadow-[0_0_32px_-8px_rgba(217,119,87,0.35)]'
                    : 'bg-[#171920] hover:border-[#3c4154]'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-8">
                  <span className="text-[11px] font-mono font-bold tracking-[.18em] px-2.5 py-1 rounded bg-[#21242f] text-[#b4b8c5]">
                    0{index + 1} // SERVICIO
                  </span>
                  <span
                    className="w-10 h-10 rounded-lg flex items-center justify-center bg-[#21242f]"
                    style={{ color: 'var(--brand)' }}
                  >
                    {index % 2 === 0 ? <Scissors size={20} /> : <Sparkles size={20} />}
                  </span>
                </div>
                <h3 className="serif uppercase text-2xl leading-tight mb-2.5">{service.name}</h3>
                <p className="text-[#9498a6] text-sm leading-6 mb-6 flex-1">
                  {service.description || 'Atención personalizada con acabado profesional.'}
                </p>
                <div className="border-t border-[#282b37] pt-4 flex items-center justify-between w-full">
                  <span className="text-[#9498a6] text-xs font-medium inline-flex items-center gap-1.5">
                    <Clock3 size={14} style={{ color: 'var(--brand)' }} />
                    {service.durationMin} min
                  </span>
                  <strong className="serif text-lg" style={{ color: isSelected ? 'var(--brand)' : 'var(--ink)' }}>
                    {money(service.price)}
                  </strong>
                </div>
              </button>
            );
          })
        )}
      </div>
      {services.length > 0 && (
        <section
          id="reservar"
          className="scroll-mt-24 grid lg:grid-cols-[.82fr_1.18fr] surface overflow-hidden"
        >
          <div className="p-8 md:p-12 lg:p-14 bg-[#13151b] border-b lg:border-b-0 lg:border-r border-[#282b37] flex flex-col justify-between">
            <div>
              <p className="mini-label mb-4">RESERVA ONLINE</p>
              <h3 className="serif uppercase text-4xl sm:text-5xl leading-tight mb-5">
                Asegura
                <br />
                <em>tu turno.</em>
              </h3>
              <p className="text-[#9498a6] leading-7 text-sm mb-8">
                Elige tu barbero o estilista, selecciona el día y bloquea tu horario al instante.
              </p>
              <div className="bg-[#191c24] border border-[#2d3140] rounded-xl p-6">
                <p className="mini-label mb-3">TU SELECCIÓN ACTUAL</p>
                <h4 className="serif text-xl uppercase mb-3">{current?.name}</h4>
                <div className="flex justify-between items-center text-sm text-[#9498a6] border-t border-[#282b37] pt-3">
                  <span className="inline-flex items-center gap-1.5">
                    <Clock3 size={14} style={{ color: 'var(--brand)' }} />
                    {current?.durationMin} minutos
                  </span>
                  <strong className="serif text-lg text-[#f4f4f6]">
                    {money(current?.price || 0)}
                  </strong>
                </div>
              </div>
            </div>
            <p className="text-xs text-[#9498a6] mt-8 leading-6 flex items-center gap-2">
              <ShieldCheck size={16} style={{ color: 'var(--brand)' }} className="shrink-0" />
              El pago y la confirmación final se procesan de forma encriptada y segura.
            </p>
          </div>
          <form onSubmit={reserve} className="p-8 md:p-12 lg:p-14 space-y-7">
            {pending && (
              <div className="status-info">
                Tienes una reserva pendiente para {pending.payload.date} a las{' '}
                {pending.payload.time}. Puedes reintentar el pago o cancelarla para elegir otra
                hora.
                <div className="flex flex-wrap gap-4 mt-3">
                  <button
                    type="button"
                    className="underline font-semibold"
                    disabled={loading}
                    onClick={() => void release()}
                  >
                    Cancelar esta reserva
                  </button>
                  <a className="underline font-semibold" href="/resultado">
                    Consultar estado
                  </a>
                </div>
              </div>
            )}
            <fieldset disabled={!!pending || loading} className="space-y-6">
              <div className="grid sm:grid-cols-2 gap-4">
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
                  <label htmlFor="professional" className="field-label">
                    02 — Profesional
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
              </div>
              <div>
                <label htmlFor="book-date" className="field-label">
                  03 — Selecciona un día
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
                <span className="field-label">04 — Horas disponibles</span>
                {loadingSlots ? (
                  <p className="text-sm text-[#9498a6] bg-[#111318] border border-[#2b2f3d] rounded-lg p-4">
                    Consultando horarios disponibles…
                  </p>
                ) : slots.length ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                    {slots.map((slot) => {
                      const active = hour === slot;
                      return (
                        <button
                          type="button"
                          key={slot}
                          onClick={() => setHour(slot)}
                          aria-pressed={active}
                          className={`py-3 text-sm font-semibold rounded-lg border transition-all ${
                            active
                              ? 'bg-[var(--brand)] text-[#0f1014] border-[var(--brand)] shadow-[0_4px_16px_rgba(217,119,87,0.4)]'
                              : 'bg-[#111318] text-[#f4f4f6] border-[#2b2f3d] hover:border-[var(--brand)]'
                          }`}
                        >
                          {slot}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-[#9498a6] bg-[#111318] border border-[#2b2f3d] rounded-lg p-4">
                    No hay horas disponibles ese día. Prueba otra fecha.
                  </p>
                )}
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="book-name" className="field-label">
                    05 — Tu nombre
                  </label>
                  <input
                    id="book-name"
                    className="input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nombre y apellido"
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
                  06 — Correo electrónico
                </label>
                <input
                  id="book-email"
                  className="input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@correo.cl"
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
            <p className="text-xs text-[#9498a6] leading-6 text-center">
              Tu horario se bloquea por 15 minutos mientras completas el pago.
            </p>
          </form>
        </section>
      )}
    </div>
  );
}
