# Despliegue y operación por propietario

Cada instalación utiliza su servidor, volumen, dominio, cuenta de cobro, remitente y secretos. Nunca se comparte el volumen ni se apunta `DATABASE_URL` a la base de otro cliente. El mismo repositorio/versionado se distribuye a todas las instalaciones; cada una se actualiza explícitamente.

## Configuración

Copia `.env.example` a `.env` y cambia todos los valores `CAMBIAR_*`. Compose toma **todas** las variables (contraseñas, secretos, puertos, nombre del proyecto y `NEXT_PUBLIC_API_URL`) de un único archivo: `.env` por defecto. No existe un `env_file` aparte, así que no pueden mezclarse valores de dos archivos.

Si excepcionalmente hay más de una instalación en el mismo host, cada una necesita su propio archivo con `COMPOSE_PROJECT_NAME`, `API_PORT` y `WEB_PORT` distintos, y **todos** los comandos deben indicarlo:

```bash
docker compose --env-file .env.salon2 build
docker compose --env-file .env.salon2 up -d
ENV_FILE=.env.salon2 scripts/backup.sh
```

Olvidar `--env-file` opera sobre la instalación definida en `.env`.

## HTTPS

Mantén PostgreSQL sin puertos públicos y los puertos 3000/4000 enlazados a localhost. Configura un proxy HTTPS local (por ejemplo Nginx) que publique el frontend y la API en los dominios del cliente. Configura `PUBLIC_WEB_URL`, `NEXT_PUBLIC_API_URL` y la URL HTTPS de webhook. Reconstruye frontend al cambiar `NEXT_PUBLIC_API_URL`.

El limitador usa la IP de conexión. Si se incorpora un proxy, configura de forma explícita los saltos/IP confiables antes de usar headers reenviados; no habilites confianza indiscriminada en `X-Forwarded-For`. En una instalación detrás de proxy el límite global puede agrupar usuarios: define también rate limits por ruta en el proxy y verifica tráfico esperado antes de abrir al público.

## Actualizar

1. Crea backup y conserva la versión desplegada y sus variables de entorno.
2. Valida la versión nueva con una copia de la base en staging.
3. Construye las imágenes: `docker compose build`.
4. En ventana de mantenimiento, detén frontend y backend, ejecuta `docker compose run --rm migrate` y vuelve a levantarlos.
5. Comprueba `/health`, catálogo, login y agenda. No ejecutes seed como parte de cada arranque.

La migración desde la arquitectura de múltiples bases requiere el procedimiento de `migration.md`; no se aplica la migración nueva sobre las bases antiguas. Si hay un problema, vuelve a la versión anterior y al backup compatible; no asumas que toda migración admite rollback automático.

## Monitoreo

- `GET /health` comprueba acceso a PostgreSQL; Compose utiliza ese endpoint para salud del backend.
- Supervisa externamente HTTPS de frontend y API, espacio de disco, antigüedad de backups y estado de contenedores.
- `docker compose logs --tail=100 backend` muestra fallos de conciliación y entrega SMTP con identificadores, sin cuerpos de correo ni secretos.
- Revisa la cantidad de reservas `PAYMENT_REVIEW` en el panel y la tabla `EmailJob` para trabajos con `sentAt IS NULL` y `attempts >= 8`. Después de corregir SMTP, un operador puede reprogramar esos trabajos; no se eliminan silenciosamente.
- Mantén el reloj del servidor sincronizado para la validación de firmas.

## Backup

```bash
scripts/backup.sh
```

Genera un dump en formato custom con permisos restringidos en `backups/`. Programa su ejecución y copia los archivos cifrados a un destino fuera del servidor de esa peluquería; un backup en el mismo disco no protege de una caída del servidor. El repositorio no contiene credenciales ni configura automáticamente un proveedor de almacenamiento.

Prueba restauraciones regularmente en un PostgreSQL separado. Para restaurar ESTA instalación después de verificar archivo, entorno y backup previo:

```bash
docker compose stop backend frontend
CONFIRM_RESTORE=replace-this-salon scripts/restore.sh backups/archivo.dump
docker compose up -d backend frontend
```

El restore es transaccional, conserva el propietario de objetos y requiere que exista `salon_app` (la inicialización de Docker lo crea). Nunca uses `docker compose down -v` como procedimiento de actualización.

## Correo y pagos

Antes de abrir al público, verifica entrega SMTP, recuperación de contraseña, recordatorio y un pago completo en sandbox del proveedor. Los tests automatizados no hacen cobros ni envían correo real. Configura alertas para revisiones de pago, concilia incidentes y registra la decisión desde el panel. La devolución se ejecuta en Mercado Pago y debe quedar reflejada por webhook/conciliación.
