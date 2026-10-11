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
};
type Reservation = {
  id: string;
  customerName: string;
  customerEmail: string;
  startsAt: string;
  status: string;
  priceSnapshot: number;
  serviceName: string;
  professional: { name: string };
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
  useEffect(() => {
    apiFetch<Salon>('/api/public/info')
      .then(setSalon)
      .catch(() => {});
    const t = new URLSearchParams(window.location.hash.slice(1)).get('reset');
    if (t) {
      setReset(t);
      history.replaceState(null, '', location.pathname);
    }
  }, []);
  const headers = (t = token) => ({ Authorization: `Bearer ${t}` });
  async function reload(t = token, p = page.page, r = role) {
    const [s, staff, res, info, b] = await Promise.all([
      apiFetch<SalonService[]>('/api/admin/services', { headers: headers(t) }),
      apiFetch<Professional[]>('/api/admin/professionals', { headers: headers(t) }),
      apiFetch<Page>(`/api/admin/reservations?page=${p}`, { headers: headers(t) }),
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
              },
              p ? 'PATCH' : 'POST',
            ),
          )
        }
      >
        <Field name="name" label="Nombre" value={p?.name} />
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
          <nav className="flex flex-wrap gap-2 mb-8" aria-label="Administración">
            {[
              ['reservations', 'Reservas'],
              ['catalog', 'Servicios'],
              ['staff', 'Profesionales y agenda'],
              ...(role === 'OWNER'
                ? [
                    ['salon', 'Mi salón'],
                    ['users', 'Usuarios'],
                  ]
                : []),
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
          {tab === 'reservations' && (
            <section>
              <div className="flex flex-wrap gap-6 mb-6">
                <p>
                  Total: <b>{page.total}</b>
                </p>
                <p>
                  Confirmadas: <b>{page.confirmed}</b>
                </p>
                <p>
                  En revisión: <b>{page.review}</b>
                </p>
                <button
                  className="underline"
                  disabled={busy}
                  onClick={() => void run(() => reload())}
                >
                  Actualizar
                </button>
              </div>
              <div className="space-y-4">
                {page.items.map((r) => (
                  <article className="surface p-6" key={r.id}>
                    <div className="flex flex-wrap justify-between gap-4">
                      <div>
                        <h2 className="font-bold">
                          {r.customerName} · {r.serviceName}
                        </h2>
                        <p>{r.customerEmail}</p>
                        <p>
                          {DateTime.fromISO(r.startsAt)
                            .setZone(salon?.timeZone || 'America/Santiago')
                            .toFormat('dd/MM/yyyy HH:mm')}{' '}
                          · {r.professional.name}
                        </p>
                      </div>
                      <div>
                        {money(r.priceSnapshot)}
                        <p>
                          {
                            (
                              {
                                PENDING_PAYMENT: 'Pendiente de pago',
                                CONFIRMED: 'Confirmada',
                                EXPIRED: 'Vencida',
                                CANCELLED: 'Cancelada',
                                PAYMENT_REVIEW: 'Pago en revisión',
                              } as Record<string, string>
                            )[r.status]
                          }
                        </p>
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
                                  apiFetch<any[]>(`/api/admin/reservations/${r.id}/payments`, {
                                    headers: headers(),
                                  }),
                                  apiFetch<any[]>(`/api/admin/reservations/${r.id}/audit`, {
                                    headers: headers(),
                                  }),
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
                          <label>
                            Profesional
                            <select name="professionalId" className="input">
                              {professionals
                                .filter((p) => p.active)
                                .map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name}
                                  </option>
                                ))}
                            </select>
                          </label>
                          <Field type="date" name="date" label="Fecha" />
                          <Field type="time" name="time" label={`Hora (${salon?.timeZone})`} />
                          <button className="btn-dark">Reprogramar</button>
                        </Form>
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
          {tab === 'account' && (
            <section className="surface p-6 max-w-lg">
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
            </section>
          )}
        </>
      )}
    </main>
  );
}
