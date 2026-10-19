export type Salon = {
  slug: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  primaryColor: string;
  timeZone: string;
  openingHour: number;
  closingHour: number;
  workDays: number[];
  contactEmail: string;
  contactPhone: string;
};
export type SalonService = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  durationMin: number;
  active: boolean;
};
export const money = (value: number) =>
  new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(value);
export const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
export const imageUrl = (url: string) => url.startsWith('/api/public/images/') ? `${api}${url}` : url;
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${api}${path}`, {
    ...init,
    headers: { ...(init?.headers || {}), ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) },
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({ message: 'Error de conexión' }));
  if (!response.ok) {
    const msg = Array.isArray(data.message)
      ? data.message.join(', ')
      : data.message || 'No se pudo procesar la solicitud';
    throw new ApiError(msg, response.status);
  }
  return data as T;
}
