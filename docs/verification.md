# Validaciones de esta refactorización

Registro honesto de lo que se comprobó y lo que falta. Actualízalo cuando ejecutes los pasos pendientes.

## Ejecutado localmente (sin base de datos)

| Comprobación                                                      | Comando                                                                      | Estado |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------ |
| Tipos backend + frontend                                          | `npm run typecheck`                                                          | ✅     |
| Pruebas unitarias (fechas, vencimiento, regla de horario ocupado) | `npm test`                                                                   | ✅     |
| Compilación backend                                               | `npm run build:backend`                                                      | ✅     |
| Compilación frontend (Next + PWA)                                 | `npm run build:frontend`                                                     | ✅     |
| Tipos de la suite de integración y del importador                 | `tsc --noEmit` sobre `backend/test/integration` y `scripts/import-legacy.ts` | ✅     |
| Estructura                                                        | `node scripts/check-structure.mjs`                                           | ✅     |
| Sintaxis de scripts de backup/restore                             | `sh -n scripts/*.sh`                                                         | ✅     |

## Pendiente de ejecutar

| Comprobación                                                   | Requisito                          | Dónde                                   |
| -------------------------------------------------------------- | ---------------------------------- | --------------------------------------- |
| `npm run test:integration`                                     | PostgreSQL vacío y descartable     | CI (`.github/workflows/ci.yml`) o local |
| `docker compose build` / `up` + `/health`                      | Docker                             | Servidor o equipo con Docker            |
| Backup y restauración en una base separada                     | Docker                             | Antes de producción                     |
| Importación real desde las bases antiguas (`db:import-legacy`) | Copias de las bases antiguas       | Staging                                 |
| Pago completo, devolución y webhook en sandbox de Mercado Pago | Credenciales de prueba + URL HTTPS | Staging                                 |
| Entrega SMTP (confirmación, recordatorio, recuperación)        | Servidor SMTP                      | Staging                                 |

## Cobertura de la suite de integración

`backend/test/integration/booking.test.ts` cubre, contra PostgreSQL real:

- Concurrencia: el mismo profesional no se duplica entre servicios; dos profesionales sí pueden atender a la misma hora; reintento idempotente con el mismo token.
- Checkout concurrente con una sola preferencia.
- Rechazo seguido de aprobación confirma; eventos repetidos o antiguos no revierten estados; reembolso pasa a revisión.
- Pagos tardíos sobre reservas vencidas quedan en revisión.
- Importe inconsistente: se audita una sola vez, no se registra como intento ni confirma y no lanza error.
- Conciliación: un pago inconsistente o un error del proveedor no impide aplicar el pago aprobado siguiente.
- Pago duplicado: la reserva pasa a revisión **sin liberar el horario**.
- Reembolso de una reserva cancelada: sigue cancelada, queda auditado y el horario queda libre.
- Bloqueos de agenda, permisos de personal, recuperación de contraseña de un solo uso y revocación del JWT al cerrar sesión.
