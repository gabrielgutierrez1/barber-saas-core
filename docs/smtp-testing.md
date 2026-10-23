# Pruebas SMTP y notificaciones

Las pruebas usan node:test, PostgreSQL real y Mailpit v1.27.4. No requieren credenciales de proveedores ni pagos reales. El transporte se simula únicamente en `notifications.test.ts`; `email-delivery.test.ts` envía por SMTP real y consulta la API HTTP de Mailpit.

## Ejecución local

Crear servicios exclusivos de prueba (puertos distintos de los de desarrollo):

```bash
docker run -d --name barber-smtp-test-db -e POSTGRES_PASSWORD=smtp-test-only -e POSTGRES_DB=salon_test -p 127.0.0.1:15439:5432 postgres:16-alpine
docker run -d --name barber-smtp-test-mailpit -p 127.0.0.1:11029:1025 -p 127.0.0.1:18029:8025 axllent/mailpit:v1.27.4
docker exec barber-smtp-test-db pg_isready -U postgres
docker exec barber-smtp-test-mailpit /mailpit readyz

export TEST_DATABASE_URL=postgresql://postgres:smtp-test-only@127.0.0.1:15439/salon_test
export SMTP_HOST=127.0.0.1
export SMTP_PORT=11029
export MAILPIT_API_URL=http://127.0.0.1:18029
npm ci
npm run db:generate
npm run typecheck
npm test
npm run test:integration
npm run test:smtp
npm run test:notifications
npm run test:coverage
npm run build

docker rm -f -v barber-smtp-test-db barber-smtp-test-mailpit
```

Usar exclusivamente una base descartable cuyo nombre contenga el segmento `test` separado por guiones bajos, como `salon_test`. Nunca se toma `DATABASE_URL` como alternativa. Cada suite crea un esquema aleatorio, aplica las migraciones y elimina únicamente ese esquema al terminar. Esto permite repetir las pruebas y ejecutar las suites en paralelo sin limpiar la base compartida. Las credenciales SMTP heredadas se eliminan del proceso de prueba.

El worker se invoca mediante `tick()`, con los temporizadores de fondo deshabilitados. Los reintentos se adelantan modificando `availableAt` del trabajo de prueba, después de verificar el plazo calculado. Mailpit se consulta cada 100 ms durante un máximo de 10 segundos, con timeout HTTP de 3 segundos. Las suites tienen límites de 60–90 segundos. Los destinatarios SMTP son únicos; no se vacía el buzón global.

## Escenarios

- Recuperación por endpoint → EmailJob → SMTP → API Mailpit → enlace recibido → cambio de contraseña y login. Se verifican remitente, destinatario, asunto, HTML, texto plano, marca, `sentAt`, no duplicación, rechazo de contraseña anterior, reutilización y vencimiento del token.
- SMTP caído y recuperado, reintento diferido, backoff exponencial de 30 segundos a una hora, máximo de ocho intentos y conservación de trabajos agotados.
- Respeto de leases vigentes, recuperación de leases vencidos, llamadas simultáneas al mismo worker y exclusión de trabajos enviados.
- Confirmación de reserva: se amplía la prueba de pago simulado existente con comprobaciones del correo, sin modificar Mercado Pago.
- Recordatorios solo para confirmadas futuras dentro de 24 horas, unicidad, cancelación y reprogramación con eliminación de recordatorios pendientes antiguos y fecha en la zona del salón.
- Se complementan las pruebas HTML existentes con rutas, protocolos y credenciales no autorizadas, URLs inválidas y escape de comillas y contactos.

Los casos de cancelación/reprogramación cubren cambios completados antes del siguiente procesamiento. No pretenden garantizar entrega SMTP exactamente una vez ante una caída entre la aceptación del mensaje y la escritura de `sentAt`, ni revocar un envío que ya está en curso.

## CI y cobertura

GitHub Actions levanta PostgreSQL y Mailpit con healthchecks, usa SMTP en 1025 y HTTP en 8025, y ejecuta integración y cobertura. `notification-coverage` contiene HTML, LCOV y JSON. Abrir `coverage/index.html` localmente. c8 remapea el JavaScript compilado al TypeScript original y limita el reporte a notificaciones, autenticación y reservas; no impone umbrales globales.

Resultado local con Node 22: 39 pruebas correctas en la ejecución de cobertura (10 unitarias y 29 de integración, incluidos contenedores de suites de node:test).

| Archivo | Líneas | Funciones | Ramas |
| --- | ---: | ---: | ---: |
| notifications.ts | 99,03 % | 100 % | 80,76 % |
| email-template.ts | 100 % | 100 % | 100 % |
| auth.ts | 78,36 % | 76,47 % | 96,55 % |
| reservations.ts | 85,05 % | 73,33 % | 79,66 % |
| Total del alcance | 86,72 % | 78,94 % | 89,47 % |

Propuesta para una futura política por archivo, basada en esta medición: notificaciones 95/95/80 y plantillas 100/100/100 (líneas/funciones/ramas). Autenticación y reservas incluyen operaciones administrativas fuera de esta tarea; no se bloquea CI por ellas. La cobertura V8 depende del remapeo y del código generado por los decoradores, por lo que se acompaña de aserciones explícitas sobre estados y entregas.

No se modificó código de producción, contratos, migraciones ni los archivos Compose existentes. Queda pendiente la revisión de los PR y observar sus resultados en GitHub Actions; los porcentajes anteriores proceden de una ejecución local real.
