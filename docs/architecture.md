# Arquitectura

Cada servidor contiene su frontend, backend y PostgreSQL. Una caída de un servidor no interrumpe las otras instalaciones. Mercado Pago, correo y DNS siguen siendo dependencias externas que pueden coincidir entre clientes.

Un backend NestJS conserva módulos separados y comparte un PrismaClient. La base única permite relaciones y transacciones entre reservas e intentos de pago. No se aceptan identificadores de tenants ni URLs de bases desde solicitudes.

## Agenda

La capacidad corresponde al profesional, independientemente del servicio. Cada profesional tiene servicios habilitados, días de atención y horario. El horario efectivo es la intersección con el del salón; los bloques permiten descansos, feriados y vacaciones. Un bloqueo no puede superponerse a una reserva vigente: antes se debe reprogramar o cancelar.

Los cambios de agenda usan un advisory lock transaccional por instalación, compartido por creación, reprogramación, bloqueo y confirmación de pagos. Se serializan escrituras breves para garantizar consistencia en el MVP. No se mantiene el lock durante llamadas al proveedor de pagos. Los timestamps se almacenan en UTC y se presentan en la zona del salón. Los precios y nombres de servicio se conservan como snapshots.

Las reservas pendientes bloquean durante 15 minutos. Su token aleatorio funciona como credencial del cliente y clave de idempotencia de creación; se almacena solo su hash en la base. El navegador conserva la solicitud antes de enviarla para recuperarse de una respuesta perdida. Cambiar selección requiere cancelar la reserva pendiente.

## Pagos

Una reserva puede tener múltiples intentos. El estado del proveedor y su timestamp se registran para ignorar notificaciones antiguas o repetidas. Confirmación e intento se guardan en una misma transacción. Un segundo pago aprobado distinto se conserva y activa revisión manual.

Una reserva en `PAYMENT_REVIEW` con un pago aprobado registrado (pago duplicado, devolución/contracargo o pago tardío) **sigue ocupando su horario** hasta que el propietario la resuelva; nadie puede reservar encima de un cliente que pagó. Un pago con importe o moneda distintos al precio congelado no se registra como intento ni confirma nada: queda en la auditoría (`AMOUNT_MISMATCH`) una sola vez y, si estaba aprobado, envía la reserva a revisión. El webhook responde 200 para que el proveedor no reintente indefinidamente. La devolución de una reserva ya cancelada se audita y se avisa al cliente, pero la reserva sigue `CANCELLED`. La conciliación procesa cada pago por separado: uno que falla no impide aplicar los demás.

El checkout tiene una concesión temporal (lease) en la base y una clave de idempotencia estable enviada al proveedor. La garantía final ante un timeout ocurrido después de crear una preferencia depende del contrato de idempotencia del proveedor; verificar ese escenario en sandbox antes de cobrar. No se promete una transacción distribuida con Mercado Pago.

La conciliación rota lotes de reservas con preferencia de los últimos 180 días. Los webhooks siguen procesando registros más antiguos y hay conciliación manual. Los IDs de pago permiten investigar devoluciones en el proveedor.

## Usuarios y notificaciones

El JWT contiene la versión de sesión. Cada petición administrativa comprueba usuario activo y versión actual; logout, cambio de contraseña y desactivación revocan accesos. Solo propietarios modifican configuración, servicios, profesionales y usuarios o resuelven revisiones. Debe quedar al menos un propietario activo.

Los correos se guardan en una outbox transaccional. Un worker usa leases, reintentos con espera creciente y un Message-ID estable. La entrega SMTP es al menos una vez: una caída tras enviar y antes de registrar éxito puede producir un correo repetido. Los fallos se registran sin incluir cuerpos, contraseñas ni datos del cliente.

## Web y móvil

Una sola interfaz adaptable y una PWA evitan mantener dos productos para este MVP. Las consultas API y datos administrativos no se guardan en caché offline. Reservar y pagar requieren conexión. Nombre y color del manifiesto se obtienen del salón; los iconos base pueden sustituirse por instalación en `frontend/public/`.

Si se necesita una app nativa, se añadirá `mobile/` consumiendo esta misma API. No existe un cliente móvil vacío ni una dependencia de un servidor central.
