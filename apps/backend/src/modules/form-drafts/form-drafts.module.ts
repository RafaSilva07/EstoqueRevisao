import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { ShipmentPhotosInterceptor } from '../shipments/shipment-photos.interceptor';
import { FormDraftsController } from './form-drafts.controller';
import { FormDraftsService } from './form-drafts.service';

@Module({ imports: [StorageModule], controllers: [FormDraftsController], providers: [FormDraftsService, ShipmentPhotosInterceptor] })
export class FormDraftsModule {}
