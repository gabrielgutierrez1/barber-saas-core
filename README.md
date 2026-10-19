# Peluquería independiente

Una instalación por propietario, en su propio servidor: **un frontend Next.js, un backend modular NestJS y una sola base PostgreSQL**. No existe un Tenant Manager, base compartida ni servicio central necesario para operar. Se reutiliza el mismo repositorio y cada instalación elige cuándo actualizarse.

## Estructura

- `backend/src/modules/`: autenticación, catálogo y profesionales, agenda/reservas, pagos, notificaciones.
- `backend/prisma/`: esquema único, migraciones e inicialización no destructiva.
- `backend/test/`: pruebas unitarias y de integración con PostgreSQL real.
- `frontend/`: web adaptable, panel administrativo y PWA.
- `docker/`: imágenes e inicialización del usuario de base de datos.
- `scripts/`: desarrollo, importación del modelo anterior y respaldos.
- `docs/`: arquitectura, operación y migración.

## Primera instalación

Requiere Docker Compose V2. Para desarrollo local: Node.js 22 y npm.

```bash
cp .env.example .env
openssl rand -hex 32 # JWT_SECRET
openssl rand -hex 24 # POSTGRES_PASSWORD
openssl rand -hex 24 # DATABASE_PASSWORD (distinta de la anterior)
```

Configura nombre, correo y contraseña inicial del propietario y los secretos de `.env`. Las contraseñas PostgreSQL del ejemplo usan hexadecimal para poder interpolarlas en la URL sin escapes. Para cada cliente usa secretos, servidor, dominio y respaldos propios.

```bash
docker compose build
docker compose up -d postgres
docker compose run --rm migrate
docker compose --profile setup run --rm setup
docker compose up -d backend frontend
```

Abre `http://localhost:3000/admin`. Crea servicios y profesionales, asígnales servicios y horarios. Configura marca, datos de contacto y días de apertura. El catálogo inicial está vacío: no se crean peluquerías ni servicios de demostración. Repetir `setup` no cambia contraseñas ni configuración existente.

La base se llama `salon`; el usuario de aplicación `salon_app` no es superusuario. PostgreSQL no publica puertos. Los puertos web/API se enlazan a localhost; en producción usa un proxy HTTPS del mismo servidor. Consulta [despliegue](docs/deployment.md).

## Desarrollo local

La galería admite enlaces HTTPS o archivos JPG, PNG y WebP de hasta 5 MB y 25 megapíxeles, subidos desde **Contenido web**. Después de subir una imagen, añade su descripción y guarda el contenido. Los archivos se convierten a WebP, sin metadatos, con un máximo de 1920 píxeles por lado. Solo el propietario puede subirlos.

Docker conserva las imágenes en el volumen `salon_uploads`; inclúyelo en los respaldos junto con PostgreSQL. En desarrollo local se guardan en `uploads/` (o en `UPLOAD_DIR`). Quitar una imagen de la galería no borra el archivo almacenado.

```bash
npm ci
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev:backend
# En otra terminal:
npm run dev:frontend
```

Necesitas una base local accesible mediante `DATABASE_URL`. Prisma, el seed y el backend cargan `.env`. Para Next.js en desarrollo crea `frontend/.env.local` con `NEXT_PUBLIC_API_URL` y `API_SERVER_URL`, o exporta ambas variables en la terminal. `NEXT_PUBLIC_API_URL` se incorpora al compilar la web.

## Verificación

```bash
npm run typecheck
npm test
npm run build
node scripts/check-structure.mjs
```

Las pruebas de integración requieren **una base vacía y descartable**:

```bash
DATABASE_URL=postgresql://usuario:clave@localhost:5432/salon_test npm run db:migrate
TEST_DATABASE_URL=postgresql://usuario:clave@localhost:5432/salon_test npm run test:integration
```

La suite rechaza una base con un salón existente y no la limpia automáticamente. Crea una nueva base de pruebas para repetirla. CI ejecuta estas comprobaciones con PostgreSQL independiente.

## Pagos, correos y operación

Mercado Pago requiere `ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` y `MP_WEBHOOK_URL` HTTPS apuntando a `/api/webhooks/mercadopago`. El redirect no confirma reservas: se valida el webhook, se consulta al proveedor y se actualizan intento de pago y reserva en una transacción.

Cada intento tiene su propio identificador. El checkout usa una clave estable y un bloqueo temporal local. El proceso de conciliación consulta pagos periódicamente; el propietario también puede hacerlo desde el panel. Pagos tardíos, duplicados y devoluciones quedan en revisión. Las devoluciones monetarias se realizan en Mercado Pago y se verifican mediante webhook/conciliación; cancelar una reserva **no devuelve dinero automáticamente**.

Configura `SMTP_HOST`, puerto, usuario, contraseña y remitente para confirmaciones, recordatorios y recuperación de acceso. Sin SMTP, los correos permanecen en la cola; no se afirma que fueron entregados. `BACKGROUND_JOBS=false` desactiva los trabajos para pruebas. Nunca uses credenciales reales en tests.

- [Arquitectura](docs/architecture.md)
- [Despliegue, monitoreo y backups](docs/deployment.md)
- [Migrar las bases anteriores sin borrarlas](docs/migration.md)
- [Validaciones de esta refactorización](docs/verification.md)
