import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
const db = new PrismaClient();
async function main() {
  const password = process.env.SEED_ADMIN_PASSWORD || '',
    email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  if (!email || password.length < 12 || password.startsWith('CAMBIAR_'))
    throw new Error('Configura correo y contraseña inicial de al menos 12 caracteres');
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('bootstrap'))`;
    await tx.salon.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1, name: process.env.SALON_NAME || 'Mi peluquería', contactEmail: email },
    });
    // Bootstrap only. Re-running seed never resets existing owners or business configuration.
    if ((await tx.user.count()) === 0)
      await tx.user.create({
        data: {
          email,
          name: 'Propietario',
          role: 'OWNER',
          passwordHash: await bcrypt.hash(password, 12),
        },
      });
  });
  console.log('Configuración inicial preparada. Agrega catálogo y profesionales desde el panel.');
}
main()
  .catch(() => {
    console.error('No se pudo inicializar: comprueba configuración y migraciones');
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
