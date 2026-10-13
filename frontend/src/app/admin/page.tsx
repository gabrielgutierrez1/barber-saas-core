'use client';
import { FormEvent, ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { DateTime } from 'luxon';
import { apiFetch, money, Salon, SalonService } from '../../lib/types';

type Professional = {
  id: string;
  name: string;
  active: boolean;
  openingHour: number;
  closingHour: number;
  workDays: number[];
  services: { id: string }[];
  bio?: string;
  photoUrl?: string;
  specialties?: string;
};
type Reservation = {
  id: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  startsAt: string;
  endsAt: string;
  status: string;
  priceSnapshot: number;
  serviceName: string;
  professionalId?: string;
  professional: { id?: string; name: string };
};
type Page = {
  items: Reservation[];
  total: number;
  confirmed: number;
  review: number;
  page: number;
  pageSize: number;
};
type User = { id: string; email: string; name: string; role: string; active: boolean };
type AgendaEntry = {
  reservations: (Reservation & { service: { id: string; name: string } })[];
  blocks: { id: string; startsAt: string; endsAt: string; reason: string; professional: { name: string } }[];
  professionals: { id: string; name: string; active: boolean }[];
  timeZone: string;
};
type Dashboard = {
  todayCount: number;
  review: number;
  approvedGrossMonth: number;
  capacityMinutes: number;
  occupiedMinutes: number;
  upcoming: Reservation[];
  timeZone: string;
};
type Customer = {
  email: string;
  customerName?: string;
  customerPhone?: string;
  visits: number;
  lastBooking: string | null;
};
type CustomerPage = { items: Customer[]; page: number; hasMore: boolean };
type CustomerHistory = { items: Reservation[]; total: number; page: number; pageSize: number };
type Payment = {
  id: string;
  status: string;
  amount: number;
  currency: string;
  providerUpdatedAt: string | null;
  reservation: Reservation & { service: { id: string; name: string } };
};
type PaymentPage = { items: Payment[]; total: number; page: number; pageSize: number };
type Notification = {
  id: string;
  to: string;
  subject: string;
  attempts: number;
  sentAt: string | null;
  createdAt: string;
};
type NotificationPage = { items: Notification[]; total: number; page: number; pageSize: number; smtpConfigured: boolean };
type SiteContent = {
  address: string;
  about: string;
  cancellationPolicy: string;
  privacyPolicy: string;
  faqs: { question: string; answer: string }[];
  gallery: { url: string; caption: string }[];
};

function Field({
  name,
  label,
  type = 'text',
  value,
  required = true,
  min,
  max,
}: {
  name: string;
  label: string;
  type?: string;
  value?: string | number;
  required?: boolean;
  min?: number;
  max?: number;
}) {
  return (
    <label className="block text-sm">
      {label}
      <input
        className="input mt-2"
        name={name}
        type={type}
        defaultValue={value}
        required={required}
        min={min}
        max={max}
      />
    </label>
  );
}

function Textarea({ name, label, value, required = false }: { name: string; label: string; value?: string; required?: boolean }) {
  return (
    <label className="block text-sm">
      {label}
      <textarea className="input mt-2 h-32 resize-y" name={name} defaultValue={value} required={required} />
    </label>
  );
}

function Form({
  children,
  onSubmit,
  disabled = false,
}: {
  children: ReactNode;
  onSubmit: (data: FormData) => Promise<void>;
  disabled?: boolean;
}) {
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit(new FormData(e.currentTarget));
      }}
    >
      <fieldset disabled={disabled} className="space-y-4">
        {children}
      </fieldset>
    </form>
  );
}

const val = (f: FormData, k: string) => String(f.get(k) || '');
const num = (f: FormData, k: string) => Number(f.get(k));
const days = (f: FormData) => f.getAll('workDays').map(Number);

function Days({ selected = [1, 2, 3, 4, 5, 6] }: { selected?: number[] }) {
  return (
    <fieldset>
      <legend className="text-sm mb-2">Días de atención</legend>
      <div className="flex flex-wrap gap-3">
        {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d, i) => (
          <label key={d}>
            <input
              type="checkbox"
              name="workDays"
              value={i + 1}
              defaultChecked={selected.includes(i + 1)}
            />{' '}
            {d}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: 'Pendiente de pago',
  CONFIRMED: 'Confirmada',
  EXPIRED: 'Vencida',
  CANCELLED: 'Cancelada',
  PAYMENT_REVIEW: 'Pago en revisión',
};

export default function Admin() {
  const [token, setToken] = useState(''),
    [role, setRole] = useState(''),
    [salon, setSalon] = useState<Salon | null>(null);
  const [services, setServices] = useState<SalonService[]>([]),
    [professionals, setProfessionals] = useState<Professional[]>([]),
    [users, setUsers] = useState<User[]>([]),
    [blocks, setBlocks] = useState<any[]>([]);
  const [page, setPage] = useState<Page>({
    items: [],
    total: 0,
    confirmed: 0,
    review: 0,
    page: 1,
    pageSize: 25,
  });
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState('reservations'),
    [reset, setReset] = useState('');
  const [details, setDetails] = useState<{ payments: any[]; audit: any[] } | null>(null);

  // Reservation filters
  const [filterStatus, setFilterStatus] = useState('');
  const [filterProfId, setFilterProfId] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterQ, setFilterQ] = useState('');

  // Agenda
  const [agenda, setAgenda] = useState<AgendaEntry | null>(null);
  const [agendaDate, setAgendaDate] = useState('');
  const [agendaView, setAgendaView] = useState<'day' | 'week'>('week');
  const [agendaProfId, setAgendaProfId] = useState('');

  // Dashboard
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);

  // Customers
  const [customers, setCustomers] = useState<CustomerPage | null>(null);
  const [customerQ, setCustomerQ] = useState('');
  const [customerPage, setCustomerPage] = useState(1);
  const [selectedEmail, setSelectedEmail] = useState('');
  const [customerHistory, setCustomerHistory] = useState<CustomerHistory | null>(null);

  // Payments
  const [payments, setPayments] = useState<PaymentPage | null>(null);
  const [paymentStatus, setPaymentStatus] = useState('');
  const [paymentQ, setPaymentQ] = useState('');
  const [paymentPage, setPaymentPage] = useState(1);

  // Notifications
  const [notifications, setNotifications] = useState<NotificationPage | null>(null);
  const [notifStatus, setNotifStatus] = useState('');
  const [notifPage, setNotifPage] = useState(1);

  // Site Content
  const [content, setContent] = useState<SiteContent | null>(null);
  const [faqItems, setFaqItems] = useState<{ question: string; answer: string }[]>([]);
  const [galleryItems, setGalleryItems] = useState<{ url: string; caption: string }[]>([]);

  // Profile
  const [profile, setProfile] = useState<{ name: string; email: string; role: string } | null>(null);

  // Reschedule slots (admin): keys are reservationId (string[]) or reservationId+':hour' (string via cast)
  const [rescheduleSlots, setRescheduleSlots] = useState<Record<string, string[] | string>>({});
  const [rescheduleSlotDate, setRescheduleSlotDate] = useState<Record<string, string>>({});
  const [rescheduleSlotProfId, setRescheduleSlotProfId] = useState<Record<string, string>>({});
  const [rescheduleLoadingId, setRescheduleLoadingId] = useState('');

  useEffect(() => {
    apiFetch<Salon>('/api/public/info')
      .then(setSalon)
      .catch(() => {});
    const t = new URLSearchParams(window.location.hash.slice(1)).get('reset');
    if (t) {
      setReset(t);
      history.replaceState(null, '', location.pathname);
    }
    // Set today as default agenda date
    setAgendaDate(new Date().toLocaleDateString('en-CA'));
  }, []);

  const headers = (t = token) => ({ Authorization: `Bearer ${t}` });

  async function reload(t = token, p = page.page, r = role) {
    const params = new URLSearchParams({ page: String(p) });
    if (filterStatus) params.set('status', filterStatus);
    if (filterProfId) params.set('professionalId', filterProfId);
    if (filterDate) params.set('date', filterDate);
    if (filterQ) params.set('q', filterQ);

    const [s, staff, res, info, b] = await Promise.all([
      apiFetch<SalonService[]>('/api/admin/services', { headers: headers(t) }),
      apiFetch<Professional[]>('/api/admin/professionals', { headers: headers(t) }),
      apiFetch<Page>(`/api/admin/reservations?${params}`, { headers: headers(t) }),
      apiFetch<Salon>('/api/public/info'),
      apiFetch<any[]>('/api/admin/blocks', { headers: headers(t) }),
    ]);
    setServices(s);
    setProfessionals(staff);
    setPage(res);
    setSalon(info);
    setBlocks(b);
    if (r === 'OWNER')
      setUsers(await apiFetch<User[]>('/api/admin/users', { headers: headers(t) }));
  }

  async function run(action: () => Promise<void>) {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar la acción');
    } finally {
      setBusy(false);
    }
  }

  async function save(path: string, body: unknown, method = 'POST') {
    await apiFetch(path, { method, headers: headers(), body: JSON.stringify(body) });
    await reload();
    setNotice('Cambios guardados');
  }

  async function login(f: FormData) {
    await run(async () => {
      const result = await apiFetch<{ accessToken: string; user: { role: string }; salon: Salon }>(
        '/api/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({ email: val(f, 'email'), password: val(f, 'password') }),
        },
      );
      await reload(result.accessToken, 1, result.user.role);
      setToken(result.accessToken);
      setRole(result.user.role);
      setSalon(result.salon);
    });
  }

  // ── Agenda ─────────────────────────────────────────────
  async function loadAgenda(t = token) {
    const params = new URLSearchParams({ date: agendaDate, view: agendaView });
    if (agendaProfId) params.set('professionalId', agendaProfId);
    const data = await apiFetch<AgendaEntry>(`/api/admin/agenda?${params}`, { headers: headers(t) });
    setAgenda(data);
  }

  useEffect(() => {
    if (token && tab === 'agenda' && agendaDate) void run(() => loadAgenda());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, agendaDate, agendaView, agendaProfId, token]);

  // ── Dashboard ───────────────────────────────────────────
  useEffect(() => {
    if (token && tab === 'dashboard' && role === 'OWNER')
      void run(async () => setDashboard(await apiFetch<Dashboard>('/api/admin/dashboard', { headers: headers() })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, token]);

  // ── Customers ───────────────────────────────────────────
  async function loadCustomers(q = customerQ, p = customerPage) {
    const params = new URLSearchParams({ page: String(p) });
    if (q) params.set('q', q);
    setCustomers(await apiFetch<CustomerPage>(`/api/admin/customers?${params}`, { headers: headers() }));
  }

  async function loadHistory(email: string, p = 1) {
    setSelectedEmail(email);
    const params = new URLSearchParams({ page: String(p), email });
    setCustomerHistory(await apiFetch<CustomerHistory>(`/api/admin/customers/history?${params}`, { headers: headers() }));
  }

  useEffect(() => {
    if (token && tab === 'customers') void run(() => loadCustomers());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, token]);

  // ── Payments ────────────────────────────────────────────
  async function loadPayments(q = paymentQ, st = paymentStatus, p = paymentPage) {
    const params = new URLSearchParams({ page: String(p) });
    if (q) params.set('q', q);
    if (st) params.set('status', st);
    setPayments(await apiFetch<PaymentPage>(`/api/admin/payments?${params}`, { headers: headers() }));
  }

  useEffect(() => {
    if (token && tab === 'payments' && role === 'OWNER') void run(() => loadPayments());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, token]);

  // ── Notifications ───────────────────────────────────────
  async function loadNotifications(st = notifStatus, p = notifPage) {
    const params = new URLSearchParams({ page: String(p) });
    if (st) params.set('status', st);
    setNotifications(await apiFetch<NotificationPage>(`/api/admin/notifications?${params}`, { headers: headers() }));
  }

  useEffect(() => {
    if (token && tab === 'notifications' && role === 'OWNER') void run(() => loadNotifications());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, token]);

  // ── Content ─────────────────────────────────────────────
  async function loadContent() {
    const c = await apiFetch<SiteContent>('/api/public/content');
    setContent(c);
    setFaqItems(c.faqs);
    setGalleryItems(c.gallery);
  }

  useEffect(() => {
    if (token && tab === 'content' && role === 'OWNER') void run(() => loadContent());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, token]);

  // ── Profile ─────────────────────────────────────────────
  useEffect(() => {
    if (token && tab === 'account')
      void run(async () => setProfile(await apiFetch<{ name: string; email: string; role: string }>('/api/admin/profile', { headers: headers() })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, token]);

  // ── Reschedule slots (admin) ─────────────────────────────
  async function fetchRescheduleSlots(resId: string, profId: string, date: string) {
    if (!profId || !date) return;
    setRescheduleLoadingId(resId);
    try {
      const data = await apiFetch<{ slots: string[] }>(
        `/api/admin/reservations/${resId}/availability?professionalId=${profId}&date=${date}`,
        { headers: headers() },
      );
      setRescheduleSlots((prev) => ({ ...prev, [resId]: data.slots }));
    } catch {
      setRescheduleSlots((prev) => ({ ...prev, [resId]: [] }));
    } finally {
      setRescheduleLoadingId('');
    }
  }

  function serviceForm(s?: SalonService) {
    return (
      <Form
        disabled={busy}
        onSubmit={(f) =>
          run(() =>
            save(
              `/api/admin/services${s ? '/' + s.id : ''}`,
              {
                name: val(f, 'name'),
                description: val(f, 'description'),
                price: num(f, 'price'),
                durationMin: num(f, 'durationMin'),
                ...(s ? { active: f.has('active') } : {}),
              },
              s ? 'PATCH' : 'POST',
            ),
          )
        }
      >
        <Field name="name" label="Nombre" value={s?.name} />
        <Field
          name="description"
          label="Descripción"
          value={s?.description || ''}
          required={false}
        />
        <Field
          name="price"
          label="Precio (CLP)"
          type="number"
          min={1000}
          max={1000000}
          value={s?.price}
        />
        <label className="block">
          Duración
          <select className="input" name="durationMin" defaultValue={s?.durationMin || 30}>
            {[30, 60, 90, 120].map((d) => (
              <option key={d} value={d}>
                {d} minutos
              </option>
            ))}
          </select>
        </label>
        {s && (
          <label className="block">
            <input type="checkbox" name="active" defaultChecked={s.active} /> Publicado
          </label>
        )}
        <button className="btn-dark">{s ? 'Guardar servicio' : 'Crear servicio'}</button>
      </Form>
    );
  }

  function professionalForm(p?: Professional) {
    return (
      <Form
        disabled={busy}
        onSubmit={(f) =>
          run(() =>
            save(
              `/api/admin/professionals${p ? '/' + p.id : ''}`,
              {
                name: val(f, 'name'),
                active: f.has('active'),
                openingHour: num(f, 'openingHour'),
                closingHour: num(f, 'closingHour'),
                workDays: days(f),
                serviceIds: f.getAll('serviceIds'),
                bio: val(f, 'bio') || undefined,
                photoUrl: val(f, 'photoUrl') || undefined,
                specialties: val(f, 'specialties') || undefined,
              },
              p ? 'PATCH' : 'POST',
            ),
          )
        }
      >
        <Field name="name" label="Nombre" value={p?.name} />
        <Field name="specialties" label="Especialidades (ej: Corte, Color)" value={p?.specialties || ''} required={false} />
        <Field name="photoUrl" label="URL HTTPS de la foto" value={p?.photoUrl || ''} required={false} />
        <Textarea name="bio" label="Biografía breve" value={p?.bio || ''} />
        <label className="block">
          <input type="checkbox" name="active" defaultChecked={p?.active ?? true} /> Disponible para
          nuevas reservas
        </label>
        <Field
          name="openingHour"
          label="Hora de apertura"
          type="number"
          min={0}
          max={23}
          value={p?.openingHour ?? salon?.openingHour ?? 9}
        />
        <Field
          name="closingHour"
          label="Hora de cierre"
          type="number"
          min={1}
          max={24}
          value={p?.closingHour ?? salon?.closingHour ?? 19}
        />
        <Days selected={p?.workDays} />
        <fieldset>
          <legend>Servicios que atiende</legend>
          {services.map((s) => (
            <label className="block" key={s.id}>
              <input
                name="serviceIds"
                type="checkbox"
                value={s.id}
                defaultChecked={p?.services.some((v) => v.id === s.id) ?? false}
              />{' '}
              {s.name}
            </label>
          ))}
        </fieldset>
        <button className="btn-dark">Guardar profesional</button>
      </Form>
    );
  }

  const fmtDT = (iso: string) =>
    DateTime.fromISO(iso).setZone(salon?.timeZone || 'America/Santiago').toFormat('dd/MM/yyyy HH:mm');

  const agendaColor: Record<string, string> = {
    CONFIRMED: 'bg-[#e8f0e8] border-[#567857]',
    PAYMENT_REVIEW: 'bg-[#fdf3ed] border-[#c67a4d]',
    PENDING_PAYMENT: 'bg-[#f5f5ef] border-[#aaa]',
  };

  return (
    <main className="shell py-8">
      <header className="flex justify-between items-center mb-10">
        <Link href="/" className="brand-script">
          {salon?.name || 'Mi salón'}
        </Link>
        {token && (
          <button
            className="btn-outline"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await apiFetch('/api/auth/logout', { method: 'POST', headers: headers() });
                setToken('');
                setUsers([]);
                setPage({ ...page, items: [] });
                setDetails(null);
                setDashboard(null);
                setAgenda(null);
                setCustomers(null);
                setPayments(null);
                setNotifications(null);
                setProfile(null);
                setContent(null);
              })
            }
          >
            Cerrar sesión
          </button>
        )}
      </header>
      {error && (
        <p role="alert" className="status-error my-4">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="status-info my-4">
          {notice}
        </p>
      )}

      {!token ? (
        /* ── Login / Reset ─────────────────────────────── */
        <section className="surface p-8 max-w-lg mx-auto">
          <h1 className="serif text-4xl mb-6">
            {reset ? 'Restablecer contraseña' : 'Administración'}
          </h1>
          {reset ? (
            <Form
              disabled={busy}
              onSubmit={(f) =>
                run(async () => {
                  await apiFetch('/api/auth/reset-password', {
                    method: 'POST',
                    body: JSON.stringify({ token: reset, password: val(f, 'password') }),
                  });
                  setReset('');
                  setNotice('Contraseña actualizada. Inicia sesión.');
                })
              }
            >
              <Field
                name="password"
                label="Nueva contraseña (12 a 72 caracteres)"
                type="password"
              />
              <button className="btn-dark">Restablecer</button>
            </Form>
          ) : (
            <>
              <Form disabled={busy} onSubmit={login}>
                <Field name="email" label="Correo" type="email" />
                <Field name="password" label="Contraseña" type="password" />
                <button className="btn-dark">Ingresar</button>
              </Form>
              <details className="mt-6">
                <summary>Olvidé mi contraseña</summary>
                <Form
                  disabled={busy}
                  onSubmit={(f) =>
                    run(async () => {
                      const r = await apiFetch<{ message: string }>('/api/auth/forgot-password', {
                        method: 'POST',
                        body: JSON.stringify({ email: val(f, 'email') }),
                      });
                      setNotice(r.message);
                    })
                  }
                >
                  <Field name="email" label="Correo de tu cuenta" type="email" />
                  <button className="btn-outline">Enviar instrucciones</button>
                </Form>
              </details>
            </>
          )}
        </section>
      ) : (
        <>
          {/* ── Tab navigation ─────────────────────────── */}
          <nav className="flex flex-wrap gap-2 mb-8" aria-label="Administración">
            {[
              ['reservations', 'Reservas'],
              ['agenda', 'Agenda'],
              ['catalog', 'Servicios'],
              ['staff', 'Profesionales'],
              ...(role === 'OWNER'
                ? [
                    ['dashboard', 'Resumen'],
                    ['customers', 'Clientes'],
                    ['payments', 'Pagos'],
                    ['notifications', 'Notificaciones'],
                    ['salon', 'Mi salón'],
                    ['content', 'Contenido web'],
                    ['users', 'Usuarios'],
                  ]
                : [
                    ['customers', 'Clientes'],
                  ]),
              ['account', 'Mi cuenta'],
            ].map(([key, label]) => (
              <button
                className={tab === key ? 'btn-dark' : 'btn-outline'}
                key={key}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </nav>

          {/* ══════════════════════════════════════════════
              TAB: RESERVAS
          ══════════════════════════════════════════════ */}
          {tab === 'reservations' && (
            <section>
              {/* Filters */}
              <div className="surface p-4 mb-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <input
                  className="input"
                  placeholder="Buscar cliente o correo"
                  value={filterQ}
                  onChange={(e) => setFilterQ(e.target.value)}
                />
                <input
                  className="input"
                  type="date"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                />
                <select className="input" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                  <option value="">Todos los estados</option>
                  <option value="CONFIRMED">Confirmadas</option>
                  <option value="PAYMENT_REVIEW">En revisión</option>
                  <option value="PENDING_PAYMENT">Pendiente de pago</option>
                  <option value="CANCELLED">Canceladas</option>
                  <option value="EXPIRED">Vencidas</option>
                </select>
                <select className="input" value={filterProfId} onChange={(e) => setFilterProfId(e.target.value)}>
                  <option value="">Todos los profesionales</option>
                  {professionals.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap gap-6 mb-6">
                <p>Total: <b>{page.total}</b></p>
                <p>Confirmadas: <b>{page.confirmed}</b></p>
                <p>En revisión: <b>{page.review}</b></p>
                <button className="underline" disabled={busy} onClick={() => void run(() => reload())}>
                  Actualizar
                </button>
                {(filterQ || filterDate || filterStatus || filterProfId) && (
                  <button className="underline text-[#c67a4d]" onClick={() => { setFilterQ(''); setFilterDate(''); setFilterStatus(''); setFilterProfId(''); }}>
                    Limpiar filtros
                  </button>
                )}
              </div>
              <div className="space-y-4">
                {page.items.map((r) => (
                  <article className="surface p-6" key={r.id}>
                    <div className="flex flex-wrap justify-between gap-4">
                      <div>
                        <h2 className="font-bold">
                          {r.customerName} · {r.serviceName}
                        </h2>
                        <p>{r.customerEmail}{r.customerPhone && ` · ${r.customerPhone}`}</p>
                        <p>
                          {fmtDT(r.startsAt)} · {r.professional.name}
                        </p>
                      </div>
                      <div>
                        {money(r.priceSnapshot)}
                        <p>{STATUS_LABEL[r.status] || r.status}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-3 mt-4">
                      {!['CANCELLED', 'EXPIRED'].includes(r.status) && (
                        <button
                          className="btn-outline"
                          disabled={busy}
                          onClick={() => {
                            if (
                              window.confirm(
                                '¿Cancelar la reserva? Las devoluciones se gestionan por separado en Mercado Pago.',
                              )
                            )
                              void run(() => save(`/api/admin/reservations/${r.id}/cancel`, {}));
                          }}
                        >
                          Cancelar
                        </button>
                      )}
                      {role === 'OWNER' && (
                        <>
                          <button
                            className="btn-outline"
                            disabled={busy}
                            onClick={() =>
                              void run(() => save(`/api/admin/reservations/${r.id}/reconcile`, {}))
                            }
                          >
                            Comprobar pagos
                          </button>
                          <button
                            className="btn-outline"
                            disabled={busy}
                            onClick={() =>
                              void run(async () => {
                                const [payments, audit] = await Promise.all([
                                  apiFetch<any[]>(`/api/admin/reservations/${r.id}/payments`, { headers: headers() }),
                                  apiFetch<any[]>(`/api/admin/reservations/${r.id}/audit`, { headers: headers() }),
                                ]);
                                setDetails({ payments, audit });
                              })
                            }
                          >
                            Ver historial
                          </button>
                        </>
                      )}
                    </div>
                    {r.status === 'CONFIRMED' && (
                      <details className="mt-4">
                        <summary>Reprogramar</summary>
                        <div className="mt-4 space-y-3">
                          <div className="grid sm:grid-cols-3 gap-3">
                            <label className="block text-sm">
                              Profesional
                              <select
                                className="input mt-1"
                                value={rescheduleSlotProfId[r.id] ?? r.professionalId ?? r.professional?.id ?? ''}
                                onChange={(e) => {
                                  const pid = e.target.value;
                                  setRescheduleSlotProfId((prev) => ({ ...prev, [r.id]: pid }));
                                  if (rescheduleSlotDate[r.id]) void fetchRescheduleSlots(r.id, pid, rescheduleSlotDate[r.id]);
                                }}
                              >
                                {professionals.filter((p) => p.active).map((p) => (
                                  <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                              </select>
                            </label>
                            <label className="block text-sm">
                              Fecha
                              <input
                                className="input mt-1"
                                type="date"
                                value={rescheduleSlotDate[r.id] || ''}
                                min={new Date().toLocaleDateString('en-CA')}
                                onChange={(e) => {
                                  const d = e.target.value;
                                  setRescheduleSlotDate((prev) => ({ ...prev, [r.id]: d }));
                                  const profId = rescheduleSlotProfId[r.id] || professionals.find((p) => p.active)?.id || '';
                                  if (profId) void fetchRescheduleSlots(r.id, profId, d);
                                }}
                              />
                            </label>
                          </div>
                          {rescheduleLoadingId === r.id && <p className="text-sm text-[#77796f]">Consultando horarios…</p>}
                          {(rescheduleSlots[r.id] as string[])?.length > 0 && (
                            <Form
                              disabled={busy}
                              onSubmit={(f) =>
                                run(() =>
                                  save(`/api/admin/reservations/${r.id}/move`, {
                                    professionalId: val(f, 'professionalId'),
                                    date: val(f, 'date'),
                                    time: val(f, 'time'),
                                  }),
                                )
                              }
                            >
                              <input type="hidden" name="professionalId" value={rescheduleSlotProfId[r.id] || professionals.find((p) => p.active)?.id} />
                              <input type="hidden" name="date" value={rescheduleSlotDate[r.id]} />
                              <div>
                                <span className="text-sm text-[#77796f] block mb-2">Horas disponibles</span>
                                <input type="hidden" name="time" value={(rescheduleSlots[r.id + ':hour'] as string) || ''} readOnly />
                                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                                  {(rescheduleSlots[r.id] as string[]).map((slot) => (
                                    <button
                                      type="button"
                                      key={slot}
                                      onClick={() => setRescheduleSlots((prev) => ({ ...prev, [r.id + ':hour']: slot }))}
                                      className={`py-2 text-sm border transition-colors ${rescheduleSlots[r.id + ':hour'] === slot ? 'bg-[#292a25] text-white border-[#292a25]' : 'bg-white border-[#dad6cc] hover:border-[#86745c]'}`}
                                    >
                                      {slot}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <button className="btn-dark">Reprogramar</button>
                            </Form>
                          )}
                          {(rescheduleSlots[r.id] as string[])?.length === 0 && rescheduleSlotDate[r.id] && rescheduleLoadingId !== r.id && (
                            <p className="text-sm text-[#77796f]">No hay horas disponibles ese día.</p>
                          )}
                        </div>
                      </details>
                    )}
                    {r.status === 'PAYMENT_REVIEW' && role === 'OWNER' && (
                      <details className="mt-4">
                        <summary>Resolver revisión</summary>
                        <Form
                          disabled={busy}
                          onSubmit={(f) =>
                            run(() =>
                              save(`/api/admin/reservations/${r.id}/review`, {
                                status: val(f, 'status'),
                                note: val(f, 'note'),
                              }),
                            )
                          }
                        >
                          <select className="input" name="status">
                            <option value="CONFIRMED">Confirmar horario y pago</option>
                            <option value="CANCELLED">Cancelar reserva</option>
                          </select>
                          <Field
                            name="note"
                            label="Motivo y gestión de devolución, si corresponde"
                          />
                          <button className="btn-dark">Guardar decisión</button>
                        </Form>
                      </details>
                    )}
                  </article>
                ))}
              </div>
              {!page.items.length && <p>Aún no hay reservas.</p>}
              <div className="flex gap-4 mt-6">
                <button
                  className="btn-outline"
                  disabled={busy || page.page <= 1}
                  onClick={() => void run(() => reload(token, page.page - 1))}
                >
                  Anterior
                </button>
                <span>
                  Página {page.page} de {Math.max(1, Math.ceil(page.total / page.pageSize))}
                </span>
                <button
                  className="btn-outline"
                  disabled={busy || page.page * page.pageSize >= page.total}
                  onClick={() => void run(() => reload(token, page.page + 1))}
                >
                  Siguiente
                </button>
              </div>
              {details && (
                <aside className="surface p-6 mt-6">
                  <h2 className="serif text-2xl">Historial de pagos y acciones</h2>
                  {details.payments.map((p) => (
                    <p key={p.id}>
                      Pago {p.id}: {p.status} · {money(p.amount)}
                    </p>
                  ))}
                  {details.audit.map((a) => (
                    <p key={a.id}>
                      {a.action}: {a.note}
                    </p>
                  ))}
                  <button className="underline" onClick={() => setDetails(null)}>
                    Cerrar historial
                  </button>
                </aside>
              )}
            </section>
          )}

          {/* ══════════════════════════════════════════════
              TAB: AGENDA VISUAL
          ══════════════════════════════════════════════ */}
          {tab === 'agenda' && (
            <section>
              <div className="flex flex-wrap gap-3 mb-6 items-end">
                <label className="block text-sm">
                  Fecha
                  <input className="input mt-1" type="date" value={agendaDate} onChange={(e) => setAgendaDate(e.target.value)} />
                </label>
                <div className="flex gap-2">
                  <button className={agendaView === 'day' ? 'btn-dark' : 'btn-outline'} onClick={() => setAgendaView('day')}>Día</button>
                  <button className={agendaView === 'week' ? 'btn-dark' : 'btn-outline'} onClick={() => setAgendaView('week')}>Semana</button>
                </div>
                <label className="block text-sm">
                  Profesional
                  <select className="input mt-1" value={agendaProfId} onChange={(e) => setAgendaProfId(e.target.value)}>
                    <option value="">Todos</option>
                    {professionals.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
                <button className="btn-outline" disabled={busy} onClick={() => void run(() => loadAgenda())}>Actualizar</button>
              </div>

              {agenda && (
                <>
                  {/* Group by professional */}
                  {(agendaProfId ? agenda.professionals.filter((p) => p.id === agendaProfId) : agenda.professionals).map((prof) => {
                    const profRes = agenda.reservations.filter((r) => (r as any).professionalId === prof.id);
                    const profBlocks = agenda.blocks.filter((b) => b.professional.name === prof.name);
                    if (!profRes.length && !profBlocks.length) return null;
                    return (
                      <div key={prof.id} className="mb-8">
                        <h3 className="serif text-2xl mb-3">{prof.name}</h3>
                        <div className="space-y-2">
                          {profRes.map((r) => (
                            <div key={r.id} className={`border-l-4 p-4 ${agendaColor[r.status] || 'bg-white border-[#ccc]'}`}>
                              <div className="flex flex-wrap justify-between gap-2">
                                <div>
                                  <p className="font-semibold">{r.customerName} — {r.serviceName}</p>
                                  <p className="text-xs text-[#77796f]">{fmtDT(r.startsAt)} → {DateTime.fromISO(r.endsAt).setZone(salon?.timeZone || 'America/Santiago').toFormat('HH:mm')}</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-xs">{STATUS_LABEL[r.status]}</p>
                                  <p className="text-sm font-bold">{money(r.priceSnapshot)}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                          {profBlocks.map((b) => (
                            <div key={b.id} className="border-l-4 border-[#c49b79] bg-[#fdf8f2] p-4">
                              <p className="font-semibold text-[#9a6b3a]">🔒 Bloqueo: {b.reason}</p>
                              <p className="text-xs text-[#77796f]">{fmtDT(b.startsAt)} → {fmtDT(b.endsAt)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {!agenda.reservations.length && !agenda.blocks.length && (
                    <p className="text-[#77796f]">No hay citas ni bloqueos en este período.</p>
                  )}
                </>
              )}
            </section>
          )}

          {/* ══════════════════════════════════════════════
              TAB: SERVICIOS
          ══════════════════════════════════════════════ */}
          {tab === 'catalog' && (
            <section className="grid md:grid-cols-2 gap-6">
              {role === 'OWNER' && (
                <div className="surface p-6">
                  <h2 className="serif text-3xl mb-6">Nuevo servicio</h2>
                  {serviceForm()}
                </div>
              )}
              <div className="space-y-4">
                {services.map((s) => (
                  <details className="surface p-6" key={s.id + '-' + s.active}>
                    <summary>
                      {s.name} · {money(s.price)} {!s.active && '(Oculto)'}
                    </summary>
                    {role === 'OWNER' ? serviceForm(s) : <p>{s.durationMin} minutos</p>}
                  </details>
                ))}
              </div>
            </section>
          )}

          {/* ══════════════════════════════════════════════
              TAB: PROFESIONALES Y AGENDA
          ══════════════════════════════════════════════ */}
          {tab === 'staff' && (
            <section className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                {role === 'OWNER' && (
                  <details className="surface p-6">
                    <summary>Agregar profesional</summary>
                    {professionalForm()}
                  </details>
                )}
                {professionals.map((p) => (
                  <details className="surface p-6" key={p.id}>
                    <summary>
                      {p.name} {!p.active && '(Inactivo)'}
                    </summary>
                    {role === 'OWNER' ? (
                      professionalForm(p)
                    ) : (
                      <p>
                        {p.openingHour}:00 a {p.closingHour}:00
                      </p>
                    )}
                  </details>
                ))}
              </div>
              <div className="surface p-6">
                <h2 className="serif text-3xl mb-4">Descansos, vacaciones y bloqueos</h2>
                {role === 'OWNER' && (
                  <Form
                    disabled={busy}
                    onSubmit={(f) =>
                      run(() =>
                        save('/api/admin/blocks', {
                          professionalId: val(f, 'professionalId'),
                          startsAt: DateTime.fromISO(val(f, 'startsAt'), {
                            zone: salon?.timeZone,
                          }).toISO(),
                          endsAt: DateTime.fromISO(val(f, 'endsAt'), {
                            zone: salon?.timeZone,
                          }).toISO(),
                          reason: val(f, 'reason'),
                        }),
                      )
                    }
                  >
                    <label>
                      Profesional
                      <select className="input" name="professionalId">
                        {professionals.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Field
                      type="datetime-local"
                      name="startsAt"
                      label={`Desde (${salon?.timeZone})`}
                    />
                    <Field type="datetime-local" name="endsAt" label="Hasta" />
                    <Field name="reason" label="Motivo" />
                    <button className="btn-dark">Bloquear horario</button>
                  </Form>
                )}
                {blocks.map((b) => (
                  <div className="border-t py-4 mt-4" key={b.id}>
                    <p>
                      {b.professional.name}: {b.reason}
                    </p>
                    <p>
                      {DateTime.fromISO(b.startsAt)
                        .setZone(salon?.timeZone)
                        .toFormat('dd/MM HH:mm')}{' '}
                      –{' '}
                      {DateTime.fromISO(b.endsAt).setZone(salon?.timeZone).toFormat('dd/MM HH:mm')}
                    </p>
                    {role === 'OWNER' && (
                      <button
                        className="underline"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await apiFetch(`/api/admin/blocks/${b.id}`, {
                              method: 'DELETE',
                              headers: headers(),
                            });
                            await reload();
                          })
                        }
                      >
                        Eliminar bloqueo
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ══════════════════════════════════════════════
              TAB: RESUMEN DEL NEGOCIO (dashboard)
          ══════════════════════════════════════════════ */}
          {tab === 'dashboard' && role === 'OWNER' && (
            <section>
              <div className="flex gap-3 mb-6">
                <button className="btn-outline" disabled={busy} onClick={() => void run(async () => setDashboard(await apiFetch<Dashboard>('/api/admin/dashboard', { headers: headers() })))}>
                  Actualizar
                </button>
              </div>
              {dashboard ? (
                <>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <div className="surface p-6 text-center">
                      <p className="mini-label text-[#898b82] mb-2">CITAS HOY</p>
                      <p className="serif text-5xl">{dashboard.todayCount}</p>
                    </div>
                    <div className="surface p-6 text-center">
                      <p className="mini-label text-[#898b82] mb-2">EN REVISIÓN</p>
                      <p className="serif text-5xl text-[#c67a4d]">{dashboard.review}</p>
                    </div>
                    <div className="surface p-6 text-center">
                      <p className="mini-label text-[#898b82] mb-2">INGRESOS MES</p>
                      <p className="serif text-3xl">{money(dashboard.approvedGrossMonth)}</p>
                    </div>
                    <div className="surface p-6 text-center">
                      <p className="mini-label text-[#898b82] mb-2">OCUPACIÓN HOY</p>
                      <p className="serif text-5xl">
                        {dashboard.capacityMinutes
                          ? Math.round((dashboard.occupiedMinutes / dashboard.capacityMinutes) * 100)
                          : 0}%
                      </p>
                    </div>
                  </div>
                  <h2 className="serif text-2xl mb-4">Próximas citas</h2>
                  <div className="space-y-3">
                    {dashboard.upcoming.map((r) => (
                      <div key={r.id} className="surface p-5 flex flex-wrap justify-between gap-3">
                        <div>
                          <p className="font-semibold">{r.customerName} — {r.serviceName}</p>
                          <p className="text-sm text-[#77796f]">{fmtDT(r.startsAt)} · {r.professional.name}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm">{STATUS_LABEL[r.status]}</p>
                          <p className="font-bold">{money(r.priceSnapshot)}</p>
                        </div>
                      </div>
                    ))}
                    {!dashboard.upcoming.length && <p className="text-[#77796f]">No hay próximas citas.</p>}
                  </div>
                </>
              ) : (
                <p className="text-[#77796f]">Cargando resumen…</p>
              )}
            </section>
          )}

          {/* ══════════════════════════════════════════════
              TAB: CLIENTES
          ══════════════════════════════════════════════ */}
          {tab === 'customers' && (
            <section>
              <div className="flex gap-3 mb-6 flex-wrap items-end">
                <input
                  className="input"
                  placeholder="Buscar por nombre, correo o teléfono"
                  value={customerQ}
                  onChange={(e) => setCustomerQ(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void run(() => loadCustomers(customerQ, 1)); }}
                />
                <button className="btn-outline" disabled={busy} onClick={() => void run(() => loadCustomers(customerQ, 1))}>
                  Buscar
                </button>
              </div>

              {selectedEmail && customerHistory && (
                <div className="surface p-6 mb-6">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="serif text-2xl">Historial de {selectedEmail}</h2>
                    <button className="underline text-sm" onClick={() => { setSelectedEmail(''); setCustomerHistory(null); }}>Cerrar</button>
                  </div>
                  <div className="space-y-3">
                    {customerHistory.items.map((r) => (
                      <div key={r.id} className="border-b pb-3">
                        <p className="font-semibold">{r.serviceName} — {r.professional.name}</p>
                        <p className="text-sm text-[#77796f]">{fmtDT(r.startsAt)} · {STATUS_LABEL[r.status]}</p>
                        <p className="text-sm">{money(r.priceSnapshot)}</p>
                      </div>
                    ))}
                    {!customerHistory.items.length && <p className="text-[#77796f]">Sin reservas.</p>}
                  </div>
                  <div className="flex gap-4 mt-4">
                    <button className="btn-outline" disabled={busy || customerHistory.page <= 1} onClick={() => void run(() => loadHistory(selectedEmail, customerHistory.page - 1))}>Anterior</button>
                    <span>Pág. {customerHistory.page} · {customerHistory.total} total</span>
                    <button className="btn-outline" disabled={busy || customerHistory.page * customerHistory.pageSize >= customerHistory.total} onClick={() => void run(() => loadHistory(selectedEmail, customerHistory.page + 1))}>Siguiente</button>
                  </div>
                </div>
              )}

              {customers && (
                <>
                  <div className="space-y-3">
                    {customers.items.map((c) => (
                      <div key={c.email} className="surface p-5 flex flex-wrap justify-between gap-3 items-center">
                        <div>
                          <p className="font-semibold">{c.customerName || '—'}</p>
                          <p className="text-sm text-[#77796f]">{c.email}</p>
                          {c.customerPhone && <p className="text-sm text-[#77796f]">{c.customerPhone}</p>}
                        </div>
                        <div className="text-right">
                          <p className="text-sm">{c.visits} visita{c.visits !== 1 ? 's' : ''}</p>
                          {c.lastBooking && <p className="text-xs text-[#898b82]">Última: {fmtDT(c.lastBooking)}</p>}
                          <button className="underline text-sm mt-1" onClick={() => void run(() => loadHistory(c.email))}>Ver historial</button>
                        </div>
                      </div>
                    ))}
                    {!customers.items.length && <p className="text-[#77796f]">No se encontraron clientes.</p>}
                  </div>
                  <div className="flex gap-4 mt-6">
                    <button className="btn-outline" disabled={busy || customerPage <= 1} onClick={() => { const p = customerPage - 1; setCustomerPage(p); void run(() => loadCustomers(customerQ, p)); }}>Anterior</button>
                    <span>Página {customerPage}</span>
                    <button className="btn-outline" disabled={busy || !customers.hasMore} onClick={() => { const p = customerPage + 1; setCustomerPage(p); void run(() => loadCustomers(customerQ, p)); }}>Siguiente</button>
                  </div>
                </>
              )}
            </section>
          )}

          {/* ══════════════════════════════════════════════
              TAB: PAGOS
          ══════════════════════════════════════════════ */}
          {tab === 'payments' && role === 'OWNER' && (
            <section>
              <div className="flex flex-wrap gap-3 mb-6 items-end">
                <input
                  className="input"
                  placeholder="Buscar por ID, cliente o correo"
                  value={paymentQ}
                  onChange={(e) => setPaymentQ(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void run(() => loadPayments(paymentQ, paymentStatus, 1)); }}
                />
                <select className="input" value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}>
                  <option value="">Todos los estados</option>
                  <option value="approved">Aprobado</option>
                  <option value="pending">Pendiente</option>
                  <option value="in_process">En proceso</option>
                  <option value="rejected">Rechazado</option>
                  <option value="refunded">Devuelto</option>
                  <option value="charged_back">Contracargo</option>
                  <option value="cancelled">Cancelado</option>
                </select>
                <button className="btn-outline" disabled={busy} onClick={() => void run(() => loadPayments(paymentQ, paymentStatus, 1))}>
                  Buscar
                </button>
              </div>

              {payments && (
                <>
                  <p className="text-sm text-[#77796f] mb-4">{payments.total} resultados</p>
                  <div className="space-y-3">
                    {payments.items.map((p) => (
                      <div key={p.id} className="surface p-5">
                        <div className="flex flex-wrap justify-between gap-3">
                          <div>
                            <p className="font-mono text-xs text-[#898b82] mb-1">{p.id}</p>
                            <p className="font-semibold">{p.reservation.customerName} — {p.reservation.serviceName}</p>
                            <p className="text-sm text-[#77796f]">{fmtDT(p.reservation.startsAt)}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold">{money(p.amount)}</p>
                            <p className="text-sm">{p.status}</p>
                            {p.providerUpdatedAt && <p className="text-xs text-[#898b82]">{fmtDT(p.providerUpdatedAt)}</p>}
                          </div>
                        </div>
                      </div>
                    ))}
                    {!payments.items.length && <p className="text-[#77796f]">No se encontraron pagos.</p>}
                  </div>
                  <div className="flex gap-4 mt-6">
                    <button className="btn-outline" disabled={busy || paymentPage <= 1} onClick={() => { const p = paymentPage - 1; setPaymentPage(p); void run(() => loadPayments(paymentQ, paymentStatus, p)); }}>Anterior</button>
                    <span>Pág. {paymentPage} de {Math.max(1, Math.ceil(payments.total / payments.pageSize))}</span>
                    <button className="btn-outline" disabled={busy || paymentPage * payments.pageSize >= payments.total} onClick={() => { const p = paymentPage + 1; setPaymentPage(p); void run(() => loadPayments(paymentQ, paymentStatus, p)); }}>Siguiente</button>
                  </div>
                </>
              )}
            </section>
          )}

          {/* ══════════════════════════════════════════════
              TAB: NOTIFICACIONES
          ══════════════════════════════════════════════ */}
          {tab === 'notifications' && role === 'OWNER' && (
            <section>
              <div className="flex flex-wrap gap-3 mb-6 items-end">
                <select className="input" value={notifStatus} onChange={(e) => setNotifStatus(e.target.value)}>
                  <option value="">Todos</option>
                  <option value="pending">Pendientes</option>
                  <option value="sent">Enviados</option>
                  <option value="failed">Fallidos</option>
                </select>
                <button className="btn-outline" disabled={busy} onClick={() => void run(() => loadNotifications(notifStatus, 1))}>
                  Filtrar
                </button>
              </div>

              {notifications && (
                <>
                  {!notifications.smtpConfigured && (
                    <div className="status-error mb-4">SMTP no configurado. Los correos no se están enviando.</div>
                  )}
                  <p className="text-sm text-[#77796f] mb-4">{notifications.total} registros</p>
                  <div className="space-y-3">
                    {notifications.items.map((n) => (
                      <div key={n.id} className={`surface p-5 ${n.sentAt ? '' : n.attempts >= 8 ? 'border-[#c67a4d]' : ''}`}>
                        <div className="flex flex-wrap justify-between gap-3">
                          <div>
                            <p className="font-semibold text-sm">{n.subject}</p>
                            <p className="text-xs text-[#77796f]">Para: {n.to}</p>
                            <p className="text-xs text-[#898b82]">Creado: {fmtDT(n.createdAt)}</p>
                          </div>
                          <div className="text-right">
                            {n.sentAt ? (
                              <p className="text-sm text-[#567857]">✓ Enviado {fmtDT(n.sentAt)}</p>
                            ) : n.attempts >= 8 ? (
                              <div>
                                <p className="text-sm text-[#c67a4d]">✗ Fallido ({n.attempts} intentos)</p>
                                <button
                                  className="underline text-sm"
                                  disabled={busy}
                                  onClick={() => void run(async () => {
                                    await apiFetch(`/api/admin/notifications/${n.id}/retry`, { method: 'POST', headers: headers() });
                                    await loadNotifications(notifStatus, notifPage);
                                    setNotice('Correo encolado para reintento');
                                  })}
                                >
                                  Reintentar
                                </button>
                              </div>
                            ) : (
                              <p className="text-sm text-[#898b82]">⏳ Pendiente ({n.attempts} intentos)</p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    {!notifications.items.length && <p className="text-[#77796f]">No hay correos.</p>}
                  </div>
                  <div className="flex gap-4 mt-6">
                    <button className="btn-outline" disabled={busy || notifPage <= 1} onClick={() => { const p = notifPage - 1; setNotifPage(p); void run(() => loadNotifications(notifStatus, p)); }}>Anterior</button>
                    <span>Pág. {notifPage} de {Math.max(1, Math.ceil(notifications.total / notifications.pageSize))}</span>
                    <button className="btn-outline" disabled={busy || notifPage * notifications.pageSize >= notifications.total} onClick={() => { const p = notifPage + 1; setNotifPage(p); void run(() => loadNotifications(notifStatus, p)); }}>Siguiente</button>
                  </div>
                </>
              )}
            </section>
          )}

          {/* ══════════════════════════════════════════════
              TAB: MI SALÓN
          ══════════════════════════════════════════════ */}
          {tab === 'salon' && salon && role === 'OWNER' && (
            <section className="surface p-6 max-w-xl">
              <Form
                disabled={busy}
                onSubmit={(f) =>
                  run(() =>
                    save(
                      '/api/admin/salon',
                      {
                        name: val(f, 'name'),
                        description: val(f, 'description'),
                        primaryColor: val(f, 'primaryColor'),
                        timeZone: val(f, 'timeZone'),
                        openingHour: num(f, 'openingHour'),
                        closingHour: num(f, 'closingHour'),
                        workDays: days(f),
                        contactEmail: val(f, 'contactEmail'),
                        contactPhone: val(f, 'contactPhone'),
                        logoUrl: val(f, 'logoUrl'),
                      },
                      'PATCH',
                    ),
                  )
                }
              >
                <Field name="name" label="Nombre" value={salon.name} />
                <Field
                  name="description"
                  label="Descripción"
                  value={salon.description || ''}
                  required={false}
                />
                <Field
                  name="primaryColor"
                  label="Color de marca"
                  type="color"
                  value={salon.primaryColor}
                />
                <Field
                  name="logoUrl"
                  label="URL HTTPS del logo"
                  value={salon.logoUrl || ''}
                  required={false}
                />
                <Field
                  name="timeZone"
                  label="Zona horaria (por ejemplo America/Santiago)"
                  value={salon.timeZone}
                />
                <Field
                  name="openingHour"
                  label="Hora de apertura"
                  type="number"
                  value={salon.openingHour}
                  min={0}
                  max={23}
                />
                <Field
                  name="closingHour"
                  label="Hora de cierre"
                  type="number"
                  value={salon.closingHour}
                  min={1}
                  max={24}
                />
                <Days selected={salon.workDays} />
                <Field
                  name="contactEmail"
                  type="email"
                  label="Correo de contacto"
                  value={salon.contactEmail}
                />
                <Field
                  name="contactPhone"
                  label="Teléfono"
                  value={salon.contactPhone}
                  required={false}
                />
                <button className="btn-dark">Guardar configuración</button>
              </Form>
            </section>
          )}

          {/* ══════════════════════════════════════════════
              TAB: CONTENIDO WEB
          ══════════════════════════════════════════════ */}
          {tab === 'content' && role === 'OWNER' && (
            <section className="max-w-3xl space-y-8">
              {content && (
                <Form
                  disabled={busy}
                  onSubmit={(f) =>
                    run(async () => {
                      await apiFetch('/api/admin/content', {
                        method: 'PATCH',
                        headers: headers(),
                        body: JSON.stringify({
                          address: val(f, 'address'),
                          about: val(f, 'about'),
                          cancellationPolicy: val(f, 'cancellationPolicy'),
                          privacyPolicy: val(f, 'privacyPolicy'),
                          faqs: faqItems,
                          gallery: galleryItems,
                        }),
                      });
                      await loadContent();
                      setNotice('Contenido guardado');
                    })
                  }
                >
                  <div className="surface p-6 space-y-4">
                    <h2 className="serif text-2xl">Contacto y ubicación</h2>
                    <Field name="address" label="Dirección física" value={content.address} required={false} />
                    <Textarea name="about" label="Sobre el salón (texto de presentación)" value={content.about} />
                  </div>

                  <div className="surface p-6 space-y-4">
                    <h2 className="serif text-2xl">Políticas</h2>
                    <Textarea name="cancellationPolicy" label="Política de cancelación y reprogramación" value={content.cancellationPolicy} />
                    <Textarea name="privacyPolicy" label="Política de privacidad" value={content.privacyPolicy} />
                  </div>

                  <div className="surface p-6 space-y-4">
                    <h2 className="serif text-2xl">Preguntas frecuentes</h2>
                    {faqItems.map((faq, i) => (
                      <div key={i} className="border p-4 space-y-2">
                        <input
                          className="input"
                          placeholder="Pregunta"
                          value={faq.question}
                          onChange={(e) => setFaqItems((prev) => prev.map((f, j) => j === i ? { ...f, question: e.target.value } : f))}
                        />
                        <textarea
                          className="input h-20 resize-y"
                          placeholder="Respuesta"
                          value={faq.answer}
                          onChange={(e) => setFaqItems((prev) => prev.map((f, j) => j === i ? { ...f, answer: e.target.value } : f))}
                        />
                        <button type="button" className="underline text-sm text-[#c67a4d]" onClick={() => setFaqItems((prev) => prev.filter((_, j) => j !== i))}>
                          Eliminar
                        </button>
                      </div>
                    ))}
                    <button type="button" className="btn-outline" onClick={() => setFaqItems((prev) => [...prev, { question: '', answer: '' }])}>
                      + Agregar pregunta
                    </button>
                  </div>

                  <div className="surface p-6 space-y-4">
                    <h2 className="serif text-2xl">Galería</h2>
                    {galleryItems.map((g, i) => (
                      <div key={i} className="border p-4 space-y-2">
                        <input
                          className="input"
                          placeholder="URL HTTPS de la imagen"
                          value={g.url}
                          onChange={(e) => setGalleryItems((prev) => prev.map((item, j) => j === i ? { ...item, url: e.target.value } : item))}
                        />
                        <input
                          className="input"
                          placeholder="Descripción"
                          value={g.caption}
                          onChange={(e) => setGalleryItems((prev) => prev.map((item, j) => j === i ? { ...item, caption: e.target.value } : item))}
                        />
                        <button type="button" className="underline text-sm text-[#c67a4d]" onClick={() => setGalleryItems((prev) => prev.filter((_, j) => j !== i))}>
                          Eliminar
                        </button>
                      </div>
                    ))}
                    <button type="button" className="btn-outline" onClick={() => setGalleryItems((prev) => [...prev, { url: '', caption: '' }])}>
                      + Agregar imagen
                    </button>
                  </div>

                  <button className="btn-dark">Guardar contenido</button>
                </Form>
              )}
            </section>
          )}

          {/* ══════════════════════════════════════════════
              TAB: USUARIOS
          ══════════════════════════════════════════════ */}
          {tab === 'users' && role === 'OWNER' && (
            <section className="grid md:grid-cols-2 gap-6">
              <div className="surface p-6">
                <h2 className="serif text-3xl mb-4">Crear usuario</h2>
                <Form
                  disabled={busy}
                  onSubmit={(f) =>
                    run(() =>
                      save('/api/admin/users', {
                        name: val(f, 'name'),
                        email: val(f, 'email'),
                        password: val(f, 'password'),
                        role: val(f, 'role'),
                      }),
                    )
                  }
                >
                  <Field name="name" label="Nombre" />
                  <Field name="email" type="email" label="Correo" />
                  <Field
                    name="password"
                    type="password"
                    label="Contraseña inicial (12 a 72 caracteres)"
                  />
                  <select name="role" className="input">
                    <option value="STAFF">Personal</option>
                    <option value="OWNER">Propietario</option>
                  </select>
                  <button className="btn-dark">Crear usuario</button>
                </Form>
              </div>
              <div className="surface p-6">
                {users.map((u) => (
                  <div className="py-3 border-b" key={u.id}>
                    <p>
                      {u.name} · {u.email} · {u.role}
                    </p>
                    <button
                      disabled={busy}
                      className="underline"
                      onClick={() =>
                        void run(() =>
                          save(`/api/admin/users/${u.id}`, { active: !u.active }, 'PATCH'),
                        )
                      }
                    >
                      {u.active ? 'Desactivar' : 'Activar'}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ══════════════════════════════════════════════
              TAB: MI CUENTA
          ══════════════════════════════════════════════ */}
          {tab === 'account' && (
            <section className="max-w-lg space-y-8">
              {/* Profile: name + email */}
              <div className="surface p-6">
                <h2 className="serif text-3xl mb-4">Mis datos</h2>
                {profile && (
                  <Form
                    disabled={busy}
                    onSubmit={(f) =>
                      run(async () => {
                        const updated = await apiFetch<{ name: string; email: string }>('/api/admin/profile', {
                          method: 'PATCH',
                          headers: headers(),
                          body: JSON.stringify({
                            name: val(f, 'name'),
                            email: val(f, 'email'),
                            currentPassword: val(f, 'currentPassword'),
                          }),
                        });
                        setProfile((p) => p ? { ...p, ...updated } : p);
                        setNotice('Datos actualizados. Si cambiaste el correo deberás volver a iniciar sesión.');
                      })
                    }
                  >
                    <Field name="name" label="Nombre" value={profile.name} />
                    <Field name="email" type="email" label="Correo" value={profile.email} />
                    <Field name="currentPassword" label="Contraseña actual (para confirmar)" type="password" />
                    <button className="btn-dark">Guardar datos</button>
                  </Form>
                )}
              </div>

              {/* Change password */}
              <div className="surface p-6">
                <h2 className="serif text-3xl mb-4">Cambiar contraseña</h2>
                <Form
                  disabled={busy}
                  onSubmit={(f) =>
                    run(async () => {
                      await apiFetch('/api/auth/password', {
                        method: 'POST',
                        headers: headers(),
                        body: JSON.stringify({
                          currentPassword: val(f, 'currentPassword'),
                          password: val(f, 'password'),
                        }),
                      });
                      setToken('');
                      setNotice('Contraseña actualizada. Inicia sesión nuevamente.');
                    })
                  }
                >
                  <Field name="currentPassword" label="Contraseña actual" type="password" />
                  <Field
                    name="password"
                    label="Nueva contraseña (12 a 72 caracteres)"
                    type="password"
                  />
                  <button className="btn-dark">Cambiar contraseña</button>
                </Form>
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
