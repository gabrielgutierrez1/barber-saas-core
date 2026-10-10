# Peluquería SaaS — Refactorización White-Label + Bases de Datos Aisladas

Proyecto refactorizado a partir del ZIP inicial. **Una instancia web muestra una sola peluquería.** Catálogo, Reservas, Pagos y Autenticación tienen **una base PostgreSQL independiente por peluquería**; Tenant Manager mantiene exclusivamente el directorio de las bases y los metadatos generales. No hay tablas de negocio compartidas ni columnas `tenantId` en los esquemas de los microservicios.

## 1. Requisitos

- Node.js 22 y npm (para desarrollo local).
- Docker Engine + Docker Compose V2 (para levantar la plataforma).
- Credenciales de **Mercado Pago**: `ACCESS_TOKEN` y clave de firma del webhook `MP_WEBHOOK_SECRET`.
- Para probar webhooks desde Internet, un dominio/túnel HTTPS que apunte a `/api/webhooks/mercadopago` en el Gateway.

## 2. Descomprimir

```bash
unzip peluqueria-saas-refactorizado.zip
cd peluqueria-saas-refactorizado
cp .env.example .env
```

## 3. Variables de entorno (obligatorio)

Edita `.env` (`nano .env`, VS Code, etc.). Sustituye **todos** los valores `CAMBIAR_`.

```bash
openssl rand -hex 32 # JWT_SECRET
openssl rand -hex 32 # INTERNAL_API_KEY
openssl rand -hex 24 # POSTGRES_PASSWORD
```

Usa secretos distintos y configura al menos:

```dotenv
POSTGRES_USER=app
POSTGRES_PASSWORD=<clave-larga-postgres>
POSTGRES_HOST=postgres
JWT_SECRET=<cadena-aleatoria-de-al-menos-32-caracteres>
INTERNAL_API_KEY=<otra-cadena-aleatoria-de-al-menos-32-caracteres>
SEED_ADMIN_EMAIL=admin@demo.cl
SEED_ADMIN_PASSWORD=<contraseña-segura-de-12-o-más-caracteres>

# Sitio web de UNA peluquería (Estudio Norte):
NEXT_PUBLIC_TENANT_ID=11111111-1111-4111-8111-111111111111
NEXT_PUBLIC_API_URL=http://localhost:4000
PUBLIC_WEB_URL=http://localhost:3000
CORS_ORIGINS=http://localhost:3000

# Mercado Pago: solo backend; dejar vacíos para probar catálogo sin pagar.
ACCESS_TOKEN=
MP_WEBHOOK_SECRET=
MP_WEBHOOK_URL=
```

En `.env` hay además **nueve URLs**: `MANAGER_DATABASE_URL` y `TENANT1_..._DATABASE_URL` / `TENANT2_..._DATABASE_URL` para `CATALOG`, `RESERVATIONS`, `PAYMENTS`, `AUTH`. Cambia el texto `CAMBIAR_PASSWORD_POSTGRES_LARGO` en **cada una** por el mismo valor que `POSTGRES_PASSWORD` (utiliza caracteres seguros para URLs o codifica caracteres reservados). Por ejemplo:

```dotenv
MANAGER_DATABASE_URL=postgresql://app:MI_CLAVE@postgres:5432/tenant_manager?schema=public
TENANT1_CATALOG_DATABASE_URL=postgresql://app:MI_CLAVE@postgres:5432/tenant1_catalog?schema=public
TENANT1_RESERVATIONS_DATABASE_URL=postgresql://app:MI_CLAVE@postgres:5432/tenant1_reservations?schema=public
TENANT1_PAYMENTS_DATABASE_URL=postgresql://app:MI_CLAVE@postgres:5432/tenant1_payments?schema=public
TENANT1_AUTH_DATABASE_URL=postgresql://app:MI_CLAVE@postgres:5432/tenant1_auth?schema=public
TENANT2_CATALOG_DATABASE_URL=postgresql://app:MI_CLAVE@postgres:5432/tenant2_catalog?schema=public
TENANT2_RESERVATIONS_DATABASE_URL=postgresql://app:MI_CLAVE@postgres:5432/tenant2_reservations?schema=public
TENANT2_PAYMENTS_DATABASE_URL=postgresql://app:MI_CLAVE@postgres:5432/tenant2_payments?schema=public
TENANT2_AUTH_DATABASE_URL=postgresql://app:MI_CLAVE@postgres:5432/tenant2_auth?schema=public
```

**Importante:** `NEXT_PUBLIC_TENANT_ID` es público y configura qué peluquería muestra esa instancia Next.js; no es una credencial. La API exige JWT para operaciones administrativas y valida que el tenant del JWT corresponda al `x-tenant-id`. La consulta de datos públicos depende del tenant indicado.

## 4. Docker, Prisma y datos iniciales

```bash
# Construye imágenes e inicia PostgreSQL.
# init.sql crea nueve bases de datos lógicas solo si el volumen está vacío.
docker compose up -d --build

# Ver estados y logs:
docker compose ps
docker compose logs --tail=80 migrate tenant-manager catalog reservations payments auth gateway web
```

El servicio `migrate` ejecuta automáticamente `npm run db:migrate` y `npm run db:seed` al primer arranque (ambos tenants de demostración). Se puede repetir manualmente:

```bash
docker compose run --rm migrate
```

Los **cinco esquemas Prisma** y sus migraciones están en:

```text
prisma/manager/schema.prisma
prisma/catalog/schema.prisma
prisma/reservations/schema.prisma
prisma/payments/schema.prisma
prisma/auth/schema.prisma
```

El sistema de demostración inicializa dos peluquerías en directorio con **bases independientes**:

| Sitio | Tenant ID | Bases |
|---|---|---|
| Estudio Norte | `11111111-1111-4111-8111-111111111111` | `tenant1_catalog`, `tenant1_reservations`, `tenant1_payments`, `tenant1_auth` |
| Barbería Central | `22222222-2222-4222-8222-222222222222` | `tenant2_catalog`, `tenant2_reservations`, `tenant2_payments`, `tenant2_auth` |

Solo **Estudio Norte** aparece en la web configurada por defecto. No existe un selector de peluquerías en el frontend. Para desplegar la web de la segunda peluquería, usa **otra instancia** con `NEXT_PUBLIC_TENANT_ID=22222222-2222-4222-8222-222222222222` y **reconstruye la imagen web**, ya que `NEXT_PUBLIC_*` se incorpora al bundle de Next.js en build:

```bash
docker compose build --no-cache web
docker compose up -d web
```

## 5. Abrir el sistema y comprobar

```text
http://localhost:3000           # Web white-label de un único salón
http://localhost:3000/admin     # Administración del salón
http://localhost:4000/health    # Gateway
```

Accede al panel con `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`. Ejemplo de petición con el header obligatorio:

```bash
curl -H 'x-tenant-id: 11111111-1111-4111-8111-111111111111' \
  http://localhost:4000/api/public/services
```

Prueba la verificación básica de archivos (sin dependencias externas):

```bash
node scripts/check-structure.mjs
```

## 6. Instalación npm y comandos de desarrollo

```bash
npm install
npm run db:generate
npm run build:backend
npm run build:web
```

Para ejecutar las migraciones fuera de Compose, configura `DATABASE_URL` y todas las URLs de destino accesibles desde tu equipo (el host `postgres` de Docker **no** es resoluble normalmente en tu PC) y ejecuta:

```bash
npm run db:migrate
npm run db:seed
```

## 7. Mercado Pago

La creación de preferencia se realiza desde el microservicio de Pagos; su respuesta contiene `checkoutUrl`. La confirmación de la reserva **no** se basa en el redirect del navegador, sino en el webhook verificado y en una consulta del pago al SDK de Mercado Pago. El `external_reference` firmado/consultado permite identificar el tenant y la reserva; Pagos actualiza Reservas **vía HTTP interno** y no por JOIN ni transacción SQL compartida.

Configura para un entorno HTTPS real:

```dotenv
ACCESS_TOKEN=APP_USR_...
MP_WEBHOOK_SECRET=<secreto-de-la-configuracion-de-webhooks>
MP_WEBHOOK_URL=https://tu-api.example.com/api/webhooks/mercadopago
PUBLIC_WEB_URL=https://tu-salon.example.com
NEXT_PUBLIC_API_URL=https://tu-api.example.com
CORS_ORIGINS=https://tu-salon.example.com
```

La clave del webhook corresponde a la **firma** configurada en el proveedor; no es el `ACCESS_TOKEN`. Para pruebas end-to-end usa credenciales de prueba e inspecciona `docker compose logs payments reservations`.

## 8. Archivos principales

```text
apps/web/                 Next.js PWA exclusiva de un tenant
apps/gateway/             JWT, CORS, throttling y routing HTTP
apps/tenant-manager/      Directorio central de tenants y bases autorizadas
apps/auth-service/        Usuarios y contraseñas en BD aislada por tenant
apps/catalog-service/     Servicios y precios en BD aislada
apps/reservations-service/Reservas y control concurrente de horas
apps/payments-service/    Preferencias, notificación firmada y conciliación
packages/common/src/     DTOs, HTTP interno y fábrica de Prisma por tenant
prisma/*/                 5 esquemas Prisma + migraciones independientes
infra/init.sql            Bases de prueba creadas dentro de PostgreSQL
scripts/seed.ts           Datos iniciales de 2 peluquerías
scripts/prisma-all.mjs    Generación de 5 clientes y migraciones por BD
```

## 9. Alcance y advertencias

- Se comprobaron la estructura, la sintaxis de archivos TypeScript y el formato de `docker-compose.yml`. **No fue posible instalar dependencias externas ni ejecutar Docker y el SDK real de Mercado Pago en el entorno de generación**. Verifica compilación, migraciones, flujo de pagos y pruebas multi-tenant al arrancarlo.
- `init.sql` y el seed son para **desarrollo con volumen nuevo**. No reemplaces ni borres un volumen PostgreSQL de producción para recrear las bases.
- La demo mantiene todas las bases en **un único servidor y con un mismo usuario PostgreSQL**. Para aislamiento de seguridad de producción deben crearse credenciales y permisos diferentes por base, backups, monitoreo, TLS y un flujo controlado de alta de peluquerías.
- Para producción también se recomienda un pool central/Proxy como PgBouncer, observabilidad, reintentos idempotentes de pagos, pruebas de concurrencia y reconciliación de webhooks. Si un pago real llega tarde o existe conflicto, la reserva queda en `PAYMENT_REVIEW`.
- Las bases de datos por negocio solo están aisladas lógicamente dentro de este PostgreSQL de prueba; en producción pueden residir en servidores separados.
