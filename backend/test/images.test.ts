import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { MAX_IMAGE_BYTES, prepareImage } from '../src/modules/experience/image-processing';

test('convierte imágenes válidas a WebP y limita su tamaño visual', async () => {
  const source = await sharp({ create: { width: 2200, height: 100, channels: 3, background: '#987654' } }).png().toBuffer();
  const output = await prepareImage(source);
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.width, 1920);
  assert.ok(metadata.height! <= 1920);
});

test('rechaza archivos vacíos, falsos, SVG y archivos demasiado grandes', async () => {
  for (const buffer of [Buffer.alloc(0), Buffer.from('no es una imagen'), Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'), Buffer.alloc(MAX_IMAGE_BYTES + 1)]) {
    await assert.rejects(prepareImage(buffer), { status: 400 });
  }
});
