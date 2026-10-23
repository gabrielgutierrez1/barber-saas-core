import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { setTimeout as delay } from 'node:timers/promises';
import { testApp } from '../helpers/test-app';

test('SMTP real: recuperación completa mediante Mailpit', { timeout: 60_000 }, async (t) => {
  const api = process.env.MAILPIT_API_URL;
  if (!api || !process.env.SMTP_HOST)
    throw new Error('Define MAILPIT_API_URL y SMTP_HOST de Mailpit de pruebas');
  // Never pass inherited provider credentials to a test SMTP server.
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASSWORD;
  process.env.SMTP_SECURE = 'false';
  process.env.SMTP_FROM = 'Salón SMTP <no-reply@salon.test>';
  const { db, worker, request } = await testApp(t);
  const email = `reset-${randomUUID()}@example.test`;
  await db.user.create({
    data: { name: 'Prueba SMTP', email, passwordHash: await bcrypt.hash('old-test-password', 4) },
  });
  assert.equal((await request('forgot-password', { email })).status, 201);
  const job = await db.emailJob.findFirstOrThrow({ where: { to: email } });
  assert.equal(job.sentAt, null);
  assert.equal(job.attempts, 0);
  assert.ok(job.key.startsWith('reset:'));
  await worker.tick();
  const read = async (path: string) => {
    const response = await fetch(`${api}${path}`, { signal: AbortSignal.timeout(3000) });
    assert.equal(response.status, 200);
    return response.json();
  };
  const search = () => read(`/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
  let messages: { ID: string }[] = [];
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    messages = (await search()).messages;
    if (messages.length) break;
    await delay(100);
  }
  assert.equal(messages.length, 1, 'Mailpit debe recibir exactamente un correo');
  const mail = await read(`/api/v1/message/${messages[0].ID}`);
  assert.equal(mail.To[0].Address, email);
  assert.equal(mail.From.Address, 'no-reply@salon.test');
  assert.equal(mail.From.Name, 'Salón SMTP');
  assert.equal(mail.Subject, 'Recuperar acceso');
  // Boolean assertions keep reset tokens out of failure diagnostics.
  assert.ok(mail.Text.replaceAll('\r\n', '\n').trim() === job.text);
  assert.ok(mail.HTML.includes('Salón SMTP &amp; Spa'));
  assert.ok(mail.HTML.includes('salon@example.test'));
  assert.ok(mail.HTML.includes('+56 9 1234 5678'));
  assert.ok(mail.HTML.includes('El enlace vence en 30 minutos.'));
  const link = mail.Text.split('\n')[0].slice(5).trim();
  const reset = new URL(link);
  assert.equal(reset.origin, process.env.PUBLIC_WEB_URL);
  assert.equal(reset.pathname, '/admin');
  const token = new URLSearchParams(reset.hash.slice(1)).get('reset');
  assert.ok(token && /^[a-f0-9]{64}$/.test(token));
  assert.ok(mail.HTML.includes(`href="${link}"`));
  const sent = await db.emailJob.findUniqueOrThrow({ where: { id: job.id } });
  assert.ok(sent.sentAt);
  assert.equal(sent.leaseUntil, null);
  assert.equal(sent.attempts, 1);
  await worker.tick();
  await worker.tick();
  assert.equal((await search()).messages.length, 1);
  const password = 'new-test-password-123';
  assert.equal((await request('reset-password', { token, password })).status, 201);
  const login = await request('login', { email, password });
  assert.equal(login.status, 201);
  assert.ok(login.data.accessToken);
  assert.equal((await request('login', { email, password: 'old-test-password' })).status, 401);
  assert.equal((await request('reset-password', { token, password })).status, 401);

  await t.test('rechaza un token vencido sin cambiar la contraseña', async () => {
    await request('forgot-password', { email });
    const pending = await db.emailJob.findFirstOrThrow({ where: { to: email, sentAt: null } });
    const expiredToken = pending.text.match(/reset=([a-f0-9]{64})/)?.[1];
    assert.ok(expiredToken);
    await db.user.update({ where: { email }, data: { resetExpiresAt: new Date(0) } });
    assert.equal(
      (await request('reset-password', { token: expiredToken, password: 'should-not-be-used' }))
        .status,
      401,
    );
    assert.equal((await request('login', { email, password })).status, 201);
  });
});
