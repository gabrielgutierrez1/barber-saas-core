# Retorno de Checkout Pro (Preferences API)

Con `PUBLIC_WEB_URL=http://localhost:3100` se omitía `auto_return`. Además, [Mercado Pago indica que no se deben usar dominios locales en back_urls](https://www.mercadopago.cl/developers/es/docs/checkout-pro-preferences/configure-back-urls). El comprobante no garantiza un retorno inmediato: la navegación final depende también de Mercado Pago, el medio de pago y el navegador.

Ahora las preferencias usan las tres URLs `PUBLIC_WEB_URL/resultado` y `auto_return: approved`. Checkout requiere un dominio HTTPS público; HTTP local sigue permitido para ejecutar la aplicación, pero iniciar pagos devuelve un error explícito sin llamar a Mercado Pago. No basta cambiar la variable: el comprador debe abrir ese mismo origen antes de reservar. El frontend consulta `/api/public/payments/config` antes de crear la reserva; el endpoint de checkout verifica además el encabezado Origin. Clientes API que llamen directamente a checkout deben enviar ese origen.

`PUBLIC_WEB_URL` acepta solamente un origen (sin ruta, query, fragmento ni credenciales). La validación no verifica DNS ni conectividad: el operador debe comprobar que sirve el frontend, no la API. Se permiten frontend y API detrás del mismo dominio con proxy por rutas. CORS conserva un único origen exacto, tomado de esta variable.

## Prueba con dos Cloudflare Quick Tunnels

1. Mantén los servicios locales levantados. Si frontend usa el puerto 3100 y backend 4000, abre dos terminales y deja ambos procesos activos:

   ```bash
   cloudflared tunnel --url http://localhost:3100
   cloudflared tunnel --url http://localhost:4000
   ```

2. En el `.env` local (nunca versionarlo), sustituye los placeholders por las URLs HTTPS que imprime cada túnel:

   ```dotenv
   WEB_PORT=3100
   API_PORT=4000
   PUBLIC_WEB_URL=https://<tunel-frontend>.trycloudflare.com
   NEXT_PUBLIC_API_URL=https://<tunel-backend>.trycloudflare.com
   MP_WEBHOOK_URL=https://<tunel-backend>.trycloudflare.com/api/webhooks/mercadopago
   ```

   Configura `ACCESS_TOKEN` y `MP_WEBHOOK_SECRET` exclusivamente con la integración de prueba. Habilita eventos de pagos y la URL de webhook en Mercado Pago. En Compose, `API_SERVER_URL=http://backend:4000` ya se establece para renderizar desde el servidor; no reemplazarlo por localhost dentro del contenedor.

3. Aplica código y configuración sin ejecutar migraciones ni recrear la base:

   ```bash
   docker compose up -d --build --no-deps backend frontend
   ```

   `NEXT_PUBLIC_API_URL` es un argumento de **build** del frontend: reiniciar el contenedor no lo cambia. Fuera de Docker configura también `API_SERVER_URL` hacia el backend local y reinicia/reconstruye Next según el modo usado.

4. Abre **la URL del túnel del frontend**, verifica catálogo y disponibilidad. Comprueba en Network que `/api/public/payments/config` devuelve ese origen y que las peticiones a la API no fallan por CORS/contenido mixto. Crea una reserva nueva allí, usando el comprador y los medios de prueba indicados por Mercado Pago.
5. Aprueba el pago Sandbox. Comprueba el retorno a `/resultado`, la conservación de `lastBooking` y que la consulta POST de estado usa el token en el cuerpo. Espera la notificación firmada/conciliación: visitar la URL con `status=approved` jamás confirma. Prueba también rechazo y pendiente (el retorno automático configurado es sólo para aprobados).
6. Comprueba el retorno en navegador móvil y PWA instalada. Si Mercado Pago abre otro navegador/perfil, el almacenamiento no se comparte: usa Mi reserva y la recuperación existente. No copies tokens a URLs. Verifica también una recarga con red y sin red: el estado de pagos no debe quedar disponible desde caché.

## Producción y cambios de dominio

| Variable | Valor requerido |
| --- | --- |
| `PUBLIC_WEB_URL` | Origen HTTPS real del frontend |
| `NEXT_PUBLIC_API_URL` | Origen HTTPS público del backend, incorporado al build |
| `API_SERVER_URL` | Backend accesible desde Next; Compose lo fija a `http://backend:4000` |
| `MP_WEBHOOK_URL` | URL HTTPS del backend con `/api/webhooks/mercadopago` |
| `ACCESS_TOKEN` | Token de la integración correspondiente, sólo backend |
| `MP_WEBHOOK_SECRET` | Secreto de firma correspondiente, sólo backend |
| `BACKGROUND_JOBS` | `true` para conciliación periódica |

Las demás variables de base de datos, JWT y correo siguen siendo necesarias según deployment.md. No fijar los dominios de ejemplo en código.

`localStorage` está aislado por esquema, dominio y puerto. Pasar de localhost a un túnel, cambiar de túnel, usar www o abrir otro perfil no migra reservas. Conserva el origen y navegador originales para consultar o cancelar una reserva pendiente; no crees otra a ciegas. Los Quick Tunnels cambian de URL al reiniciarse: mantenlos activos hasta terminar la prueba.

Las preferencias existentes conservan sus URLs antiguas y el checkout se reutiliza por idempotencia. Este cambio no reescribe preferencias ni reservas históricas. Para validar usa reservas nuevas; antes de una migración real coordina los pagos pendientes y mantén operativo el dominio anterior. Una redirección entre dominios no transporta localStorage. La PWA mantiene sus políticas NetworkOnly para API/estados; valida actualizaciones del service worker en dispositivos reales.

No se modifican firma, conciliación, idempotencia, pagos duplicados ni PAYMENT_REVIEW. Un retorno no es prueba de pago; el estado procede siempre del backend autenticado con bookingToken.

## Verificación automatizada de esta corrección

- `npm run db:generate`: regenera el cliente Prisma para el esquema actual, sin migrar datos.
- `npm test`: 12 pruebas aprobadas, incluidas preferencia HTTPS, rechazo HTTP/local, origen y recuperación segura del token.
- `npm run test:integration`: 30 pruebas aprobadas con PostgreSQL y Mailpit descartables; incluye firma válida/inválida, URL falsificada, conciliación, duplicados, idempotencia y PAYMENT_REVIEW.
- `npm run typecheck` y `npm run build`: aprobados.
- `npm run test:frontend` (después del build): carga HTTP de `/resultado` con los tres estados de retorno; no renderiza confirmación por parámetros públicos.

Las pruebas de frontend comprueban la ruta construida y la consulta de estado con almacenamiento simulado; no sustituyen una prueba de hidratación/navegación en un navegador real. Quedan pendientes los pasos Sandbox y PWA indicados arriba. No se hicieron pagos ni se usaron credenciales productivas.
