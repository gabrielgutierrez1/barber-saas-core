import { apiFetch } from './types';

export function assertCheckoutOrigin(returnUrl: string, origin: string) {
  if (new URL(returnUrl).origin !== origin)
    throw new Error(
      `Para conservar tu reserva al volver del pago, abre ${new URL(returnUrl).origin} e inicia la reserva allí. Si ya tienes una reserva pendiente, consúltala o cancélala primero desde este navegador.`,
    );
}

export function readBooking(storage: Pick<Storage, 'getItem'>) {
  try {
    const data = JSON.parse(storage.getItem('lastBooking') || 'null');
    if (
      typeof data?.id === 'string' &&
      /^[0-9a-f-]{36}$/i.test(data.id) &&
      typeof data.bookingToken === 'string' &&
      /^[0-9a-f]{64}$/i.test(data.bookingToken)
    )
      return { id: data.id as string, bookingToken: data.bookingToken as string };
  } catch {
    /* Storage can be unavailable or corrupted. Never infer ownership from the URL. */
  }
  throw new Error(
    'No pudimos recuperar tu reserva. Usa el mismo navegador y dominio donde reservaste, o consulta Mi reserva con tus datos.',
  );
}

export function loadBookingStatus<T>(storage: Pick<Storage, 'getItem'>) {
  const data = readBooking(storage);
  return apiFetch<T>(`/api/public/reservations/${data.id}/status`, {
    method: 'POST',
    body: JSON.stringify({ bookingToken: data.bookingToken }),
  });
}
