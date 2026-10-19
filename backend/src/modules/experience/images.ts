import {
  BadRequestException, Controller, Get, Header, Module, NotFoundException,
  Param, Post, StreamableFile, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { MAX_IMAGE_BYTES, prepareImage } from './image-processing';
import { AdminGuard, AuthModule, OwnerGuard } from '../auth/auth';

const directory = () => resolve(process.env.UPLOAD_DIR || 'uploads');
const IMAGE_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/;

@Controller('api/admin/images')
@UseGuards(AdminGuard, OwnerGuard)
export class ImageUploadController {
  @Post()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 0 } }))
  async upload(@UploadedFile() file?: { buffer: Buffer }) {
    if (!file) throw new BadRequestException('Selecciona una imagen');
    const image = await prepareImage(file.buffer);
    const name = `${randomUUID()}.webp`;
    await mkdir(directory(), { recursive: true });
    await writeFile(resolve(directory(), name), image, { flag: 'wx' });
    return { url: `/api/public/images/${name}` };
  }
}

@Controller('api/public/images')
export class PublicImagesController {
  @Get(':name')
  @Header('Cross-Origin-Resource-Policy', 'cross-origin')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  async image(@Param('name') name: string) {
    if (!IMAGE_NAME.test(name)) throw new NotFoundException('Imagen no encontrada');
    try {
      return new StreamableFile(await readFile(resolve(directory(), name)), { type: 'image/webp' });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        throw new NotFoundException('Imagen no encontrada');
      throw error;
    }
  }
}

@Module({ imports: [AuthModule], controllers: [ImageUploadController, PublicImagesController] })
export class ImagesModule {}
