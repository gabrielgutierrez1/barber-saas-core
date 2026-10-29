import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';

// Exercise the built Next route, including attacker-controlled return parameters.
test('/resultado loads for every MP return without claiming payment approval', async (t) => {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', 'frontend', '-p', String(port), '-H', '127.0.0.1'], { stdio: 'pipe' });
  let output = '';
  server.stdout.on('data', chunk => { output += chunk; });
  server.stderr.on('data', chunk => { output += chunk; });
  t.after(async () => {
    if (server.exitCode === null) {
      const closed = once(server, 'exit');
      server.kill('SIGTERM');
      await closed;
    }
  });
  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { ready = (await fetch(`${base}/resultado`)).ok; } catch {}
    if (ready) break;
    if (server.exitCode !== null) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, output);
  for (const status of ['approved', 'rejected', 'pending']) {
    const response = await fetch(`${base}/resultado?status=${status}&collection_status=${status}&external_reference=fake`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /Verificando tu pago/);
    assert.doesNotMatch(html, /¡Reserva confirmada!/);
    assert.doesNotMatch(html, /bookingToken/);
  }
});
