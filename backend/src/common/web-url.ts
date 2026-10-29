import { ServiceUnavailableException } from '@nestjs/common';
import { isIP } from 'node:net';

export function publicWebUrl(value = process.env.PUBLIC_WEB_URL): URL {
  try {
    const url = new URL(value || '');
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    )
      throw new Error();
    return url;
  } catch {
    throw new ServiceUnavailableException(
      'PUBLIC_WEB_URL debe ser el origen del frontend, sin ruta, credenciales ni parámetros',
    );
  }
}

export function checkoutReturnConfig() {
  const web = publicWebUrl();
  const host = web.hostname.replace(/\.$/, '');
  if (
    web.protocol !== 'https:' ||
    isIP(host.replace(/^\[|\]$/g, '')) ||
    !host.includes('.') ||
    /(^|\.)(localhost|local|internal|test|invalid)$/.test(host)
  ) {
    throw new ServiceUnavailableException(
      'Checkout Pro requiere PUBLIC_WEB_URL con un dominio HTTPS público. En desarrollo abre el frontend mediante un túnel HTTPS.',
    );
  }
  const result = `${web.origin}/resultado`;
  return {
    back_urls: { success: result, failure: result, pending: result },
    auto_return: 'approved' as const,
  };
}
