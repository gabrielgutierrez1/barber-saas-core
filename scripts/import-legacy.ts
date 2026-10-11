/** Explicit, one-time import into an EMPTY target. Source databases are read only. */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const target = new PrismaClient();
const clients: PrismaClient[] = [];
async function read(key: string, table: string): Promise<any[]> {
  const url = process.env[key];
  if (!url) throw new Error(`Falta ${key}`);
  if (url === process.env.DATABASE_URL) throw new Error('Origen y destino deben ser distintos');
  const db = new PrismaClient({ datasources: { db: { url } } });
  clients.push(db);
  // table is exclusively a hardcoded caller literal, never a CLI or environment value.
  return db.$queryRawUnsafe(`SELECT * FROM "${table}"`);
}
async function main() {
  if (process.env.CONFIRM_EMPTY_IMPORT !== 'yes')
    throw new Error('Revisa backups y define CONFIRM_EMPTY_IMPORT=yes');
  const tenantId = process.env.LEGACY_TENANT_ID;
  if (!tenantId || !/^[a-f0-9-]{36}$/i.test(tenantId)) throw new Error('LEGACY_TENANT_ID inválido');
  const [salons, services, users, reservations, payments] = await Promise.all([
    read('LEGACY_MANAGER_URL', 'Tenant'),
    read('LEGACY_CATALOG_URL', 'Service'),
    read('LEGACY_AUTH_URL', 'User'),
    read('LEGACY_RESERVATIONS_URL', 'Reservation'),
    read('LEGACY_PAYMENTS_URL', 'Payment'),
  ]);
  const salon = salons.find((s) => s.id === tenantId);
  if (!salon) throw new Error('Salón no encontrado');
  // Legacy capacity was per service. Assign a provisional resource per service rather
  // than silently merging overlapping appointments into one professional's agenda.
  await target.$transaction(
    async (tx) => {
      for (const count of await Promise.all([
        tx.salon.count(),
        tx.user.count(),
        tx.service.count(),
        tx.professional.count(),
        tx.reservation.count(),
      ]))
        if (count) throw new Error('Destino no vacío: importación abortada');
      const { id, active, createdAt, ...settings } = salon;
      await tx.salon.create({
        data: {
          ...settings,
          description: settings.description || '',
          id: 1,
          contactEmail: users[0]?.email || '',
        },
      });
      await tx.user.createMany({ data: users });
      await tx.service.createMany({ data: services });
      const resources = new Map<string, string>();
      for (const service of services) {
        const p = await tx.professional.create({
          data: {
            name: `Por asignar: ${service.name}`,
            active: false,
            openingHour: salon.openingHour,
            closingHour: salon.closingHour,
            services: { connect: { id: service.id } },
          },
        });
        resources.set(service.id, p.id);
      }
      for (const r of reservations) {
        const payment = payments.find((p) => p.reservationId === r.id);
        await tx.reservation.create({
          data: {
            ...r,
            professionalId: resources.get(r.serviceId)!,
            legacyReference: `${tenantId}:${r.id}`,
            preferenceId: payment?.preferenceId,
            checkoutUrl: payment?.checkoutUrl,
            approvedPaymentId: payment?.status === 'APPROVED' ? payment.mpPaymentId : null,
          },
        });
        if (payment?.mpPaymentId)
          await tx.paymentAttempt.create({
            data: {
              id: payment.mpPaymentId,
              reservationId: r.id,
              status:
                (
                  {
                    APPROVED: 'approved',
                    REJECTED: 'rejected',
                    REFUNDED: 'refunded',
                    PENDING: 'pending',
                  } as Record<string, string>
                )[payment.status] || 'pending',
              amount: payment.amount,
              currency: payment.currency,
              providerUpdatedAt: new Date(0),
            },
          });
      }
    },
    { timeout: 120000 },
  );
  console.log(
    'Importación completada. Asigna profesionales reales y concilia pagos antes de abrir reservas.',
  );
}
main()
  .catch((e) => {
    console.error(
      e instanceof Error && !e.name.startsWith('Prisma')
        ? e.message
        : 'Importación fallida: revisa esquema y datos de origen; la transacción se revirtió',
    );
    process.exitCode = 1;
  })
  .finally(() => Promise.all([target, ...clients].map((db) => db.$disconnect())));
