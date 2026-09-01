import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { validationExceptionFactory } from './shared/http/validation-error.factory';
import { AppLogger } from './shared/logging/app-logger.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const configService = app.get(ConfigService);
  const logger = await app.resolve(AppLogger);

  app.useLogger(logger);
  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  app.enableCors({
    origin: configService.getOrThrow<string>('FRONTEND_URL'),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      exceptionFactory: validationExceptionFactory,
    }),
  );
  app.enableShutdownHooks();

  const port = configService.getOrThrow<number>('PORT');
  await app.listen(port, '0.0.0.0');
  logger.log({ event: 'application_started', port });
}

void bootstrap();
