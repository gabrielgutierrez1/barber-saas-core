import assert from 'node:assert/strict';
import test from 'node:test';
import { renderEmail } from '../src/modules/notifications/email-template';

const brand = {
  name: 'Salón & Spa',
  logoUrl: 'https://example.com/logo.png',
  primaryColor: '#bb865d',
  contactEmail: 'hola@example.com',
  contactPhone: '+56 9 1234 5678',
};

test('incluye marca, detalles y enlace a reservas en HTML', () => {
  const html = renderEmail(
    {
      key: 'booking:confirmed',
      subject: 'Reserva confirmada',
      text: 'Ana, tu reserva está confirmada.\nReferencia: 123',
    },
    brand,
    'https://salon.example',
  );
  assert.match(html, /Salón &amp; Spa/);
  assert.match(html, /https:\/\/example.com\/logo.png/);
  assert.match(html, /Referencia: 123/);
  assert.match(html, /href="https:\/\/salon.example\/mi-reserva"/);
});

test('conserva los tokens y vencimiento de los enlaces privados', () => {
  for (const [key, url] of [
    ['reset:hash', 'https://salon.example/admin#reset=abc'],
    ['booking-access:hash', 'https://salon.example/mi-reserva#id=123&token=abc'],
  ]) {
    const html = renderEmail(
      { key, subject: 'Acceso', text: `Abre ${url}\nEl enlace vence en 30 minutos.` },
      brand,
      'https://salon.example',
    );
    assert.ok(html.includes(`href="${url.replaceAll('&', '&amp;')}"`));
    assert.match(html, /vence en 30 minutos/);
    assert.match(html, /No lo compartas/);
  }
});

test('escapa contenido y rechaza URLs y colores no seguros', () => {
  const html = renderEmail(
    {
      key: 'reset:hash',
      subject: '<script>alert(1)</script>',
      text: 'Abre https://evil.example/admin#reset=abc\n<img src=x onerror=alert(1)>',
    },
    {
      ...brand,
      name: '<b>Salón</b>',
      logoUrl: 'javascript:alert(1)',
      primaryColor: 'red;display:none',
    },
    'https://salon.example',
  );
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('href="https://evil.example'));
  assert.ok(!html.includes('red;display:none'));
  assert.match(html, /&lt;b&gt;Salón&lt;\/b&gt;/);
  assert.match(html, /#bb865d/);
});
