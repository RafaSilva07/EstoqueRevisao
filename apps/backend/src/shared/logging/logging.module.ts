import { Global, Module } from '@nestjs/common';
import { AppLogger } from './app-logger.service';
import { RequestContextService } from './request-context.service';

@Global()
@Module({
  providers: [AppLogger, RequestContextService],
  exports: [AppLogger, RequestContextService],
})
export class LoggingModule {}
