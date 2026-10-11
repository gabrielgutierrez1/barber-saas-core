# Unificar una peluquería existente

El esquema anterior tenía catálogo, usuarios, reservas y pagos en bases separadas y un directorio central. Esta rama crea una base nueva con todas las tablas. Las bases anteriores no se borran ni se migran automáticamente.

## Procedimiento

1. Detén nuevas reservas y cambios administrativos de esa peluquería. Conserva las bases antiguas y realiza backups verificables de cada una.
2. Provisiona el servidor nuevo y una base **vacía**. Configura `DATABASE_URL` con el destino nuevo y ejecuta `npm run db:migrate`. No ejecutes seed antes de importar.
3. Configura las URLs de lectura del origen: `LEGACY_MANAGER_URL`, `LEGACY_CATALOG_URL`, `LEGACY_AUTH_URL`, `LEGACY_RESERVATIONS_URL`, `LEGACY_PAYMENTS_URL`, y el ID de la peluquería en `LEGACY_TENANT_ID`. Usa credenciales de solo lectura si es posible.
4. Ejecuta `CONFIRM_EMPTY_IMPORT=yes npm run db:import-legacy` desde un entorno con conectividad a origen y destino.
5. Compara cantidades de servicios, usuarios y reservas, montos y fechas. Los hashes de contraseña e identificadores se preservan. Verifica login y concilia los pagos existentes.
6. Asigna los recursos provisionales a profesionales reales y revisa todos los solapamientos antes de habilitar nuevas reservas. Configura SMTP, marca, dominio y cuenta de pagos propios.
7. Cambia tráfico y URL del webhook. Revisa las notificaciones que llegaron durante la ventana de migración. Conserva los orígenes para rollback hasta validar operación.

## Qué hace el importador

- Solo lee los orígenes; importa dentro de una transacción en destino.
- Rechaza un destino con datos de negocio.
- No resetea contraseñas ni inventa pagos.
- Preserva preferencias y referencias externas antiguas en `legacyReference` para aceptar webhooks y conciliarlas después del cambio.
- Crea un profesional provisional **inactivo por servicio**, porque el sistema viejo permitía solapamientos entre servicios. Esto evita asignar silenciosamente dos citas al mismo profesional. Renombra/asigna recursos y revisa la agenda antes de activarlos.
- No traslada el directorio de otros tenants ni sus conexiones.

No modifiques simplemente las cuatro URLs antiguas para que apunten a la misma base: los historiales de migración y las relaciones son diferentes. Una importación de prueba y validación humana del calendario son necesarias antes del cambio definitivo.
