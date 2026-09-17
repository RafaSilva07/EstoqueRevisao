import { BadRequestException, CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request, Response } from 'express';
import multer, { memoryStorage, MulterError } from 'multer';
import { Observable } from 'rxjs';
import { IMAGE_MIME_TYPES, MAX_IMAGE_SIZE } from '../storage/storage.service';

@Injectable()
export class ShipmentPhotosInterceptor implements NestInterceptor {
  private readonly upload = multer({
    storage: memoryStorage(),
    limits: { fileSize: MAX_IMAGE_SIZE, files: 100 },
    fileFilter: (_request, file, callback) => {
      const allowed = IMAGE_MIME_TYPES.includes(file.mimetype as (typeof IMAGE_MIME_TYPES)[number]);
      if (allowed) return callback(null, true);
      return callback(new BadRequestException('A foto deve ser JPEG, PNG ou WebP.'));
    },
  }).array('photos', 100);

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const http = context.switchToHttp();

    await new Promise<void>((resolve, reject) => {
      this.upload(http.getRequest<Request>(), http.getResponse<Response>(), (error) => {
        if (!error) return resolve();
        if (error instanceof BadRequestException) return reject(error);
        if (error instanceof MulterError && error.code === 'LIMIT_FILE_SIZE') {
          return reject(new BadRequestException('Cada foto deve ter no máximo 5 MB.'));
        }
        return reject(new BadRequestException('Não foi possível processar as fotos do envio.'));
      });
    });

    return next.handle();
  }
}
