# Reservas y pagos en revisión

`PAYMENT_REVIEW` solo ocupa el horario cuando `reviewHoldsSlot` es verdadero.
Una aprobación inconsistente conserva el derecho de una reserva pendiente vigente,
confirmada o en revisión con retención. Nunca confirma automáticamente. Una reserva
vencida no recupera su horario al recibir un pago, aunque esté libre. Una cancelada
permanece `CANCELLED`, incluso ante pagos adicionales o contracargos.

Cada pago se registra en `PaymentAttempt`, incluidos importes o monedas incorrectos.
`reviewRequired` identifica intervención pendiente independientemente del estado de
la reserva. El listado administrativo incluye los identificadores pendientes; los
endpoints existentes de pagos y auditoría permiten inspeccionar importe, estado y
motivo. Las fechas del proveedor descartan eventos antiguos y los estados repetidos
no duplican auditorías ni notificaciones.

El propietario puede resolver cada incidencia con el endpoint `review`, indicando
`paymentAttemptId` (opcional cuando solo hay un pago pendiente y obligatorio si
existen varios) y una nota:
- Confirmar exige un pago principal aprobado vigente (`approvedPaymentId`) del
  importe y moneda esperados, fecha futura y disponibilidad bajo el bloqueo de agenda.
- Cancelar libera la retención y marca como pendientes de revisión otros pagos
  aprobados de la misma reserva que aún no hayan sido atendidos. También se admite
  resolver pagos pendientes sobre una reserva `CANCELLED` con estado `CANCELLED`,
  sin reactivarla.
- Cada `PaymentAttempt` conserva su estado `reviewRequired` de forma individual:
  resolver un pago no oculta ni cierra otros pagos pendientes de la misma reserva,
  y se rechazan pagos ajenos a la reserva. La auditoría (`REVIEW_CONFIRMED` /
  `REVIEW_CANCELLED`) registra administrador, reserva, pago afectado y nota.
- Cuando llega un reembolso o contracargo (`refunded` / `charged_back`), siempre se
  registra en auditoría (`REFUND_RECORDED` / `CHARGEBACK_RECORDED`):
  - Si corresponde al pago principal (`approvedPaymentId`) de una reserva no
    cancelada, pasa la reserva a `PAYMENT_REVIEW` conservando las reglas de
    `reviewHoldsSlot` y marca `reviewRequired: true` en ese pago.
  - Si corresponde a un pago secundario (`id !== approvedPaymentId`), actualiza ese
    intento (`reviewRequired: false`) sin alterar `approvedPaymentId` ni pasar una
    reserva `CONFIRMED` a `PAYMENT_REVIEW`. Si la reserva estaba en `PAYMENT_REVIEW`
    únicamente por un pago secundario duplicado y mantiene su pago principal válido,
    horario retenido libre de conflictos y ningún otro pago con `reviewRequired`,
    vuelve a `CONFIRMED`.
- No existen devoluciones automáticas: las devoluciones se gestionan manualmente en
  Mercado Pago.

El checkout comprueba el estado antes y después de llamar al proveedor, sin mantener
una transacción durante la red. Cada lease tiene un token: una respuesta o error de
un intento viejo no puede limpiar ni sobrescribir un intento nuevo. Se conserva la
preferencia de una reserva que dejó de ser pagable, pero se responde con conflicto,
no con una URL. Una URL externa ya entregada puede aún recibir pagos: se concilian
sin reactivar cancelaciones. La clave idempotente y referencia externa son estables.
`checkoutStartedAt` permite buscar pagos incluso si el proveedor creó la preferencia
pero se perdió la respuesta. Se conserva la ventana existente de conciliación
periódica de 180 días; fuera de ella se puede conciliar manualmente por reserva.

## Migración

La migración agrega campos con valores por defecto y amplía el importe a decimal
para conservar pagos incorrectos con fracciones; la API sigue devolviendo un número.
Conserva retenciones históricas con pago registrado, salvo superposición con una
reserva confirmada, que tiene prioridad. Los registros antiguos no permiten deducir
si una revisión fue tardía: el propietario debe inspeccionar esas retenciones y
resolverlas. Las inconsistencias históricas que solo tenían auditoría se conservan
sin inventar pagos ni recuperar horarios; se pueden conciliar para registrar los
intentos. La migración no elimina ni cancela reservas existentes.
