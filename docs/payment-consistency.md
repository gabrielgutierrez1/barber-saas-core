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

El propietario puede resolver con el endpoint `review` existente y una nota:
- Confirmar exige un pago aprobado vigente del importe y moneda esperados, fecha
  futura y disponibilidad bajo el bloqueo de agenda.
- Cancelar libera la retención. También se admite resolver una cancelada con estado
  `CANCELLED`, para documentar la gestión del cobro tardío sin reactivar la reserva.
- La resolución marca los casos como atendidos; no certifica un reembolso monetario.
  La nota debe explicar el acuerdo o gestión realizada. La devolución se ejecuta y
  verifica manualmente en Mercado Pago. Su webhook actualiza el pago y registra
  la devolución o contracargo. No existen devoluciones automáticas.

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
