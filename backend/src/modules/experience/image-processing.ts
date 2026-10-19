import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export async function prepareImage(buffer: Buffer): Promise<Buffer> {
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES)
    throw new BadRequestException('La imagen debe pesar como máximo 5 MB');
  try {
    const image = sharp(buffer, { limitInputPixels: 25_000_000, failOn: 'warning' });
    const metadata = await image.metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format || '') || (metadata.pages || 1) > 1)
      throw new Error('Formato no permitido');
    return await image.rotate().resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 }).toBuffer();
  } catch {
    throw new BadRequestException('Selecciona una imagen JPG, PNG o WebP válida, de hasta 25 megapíxeles');
  }
}

