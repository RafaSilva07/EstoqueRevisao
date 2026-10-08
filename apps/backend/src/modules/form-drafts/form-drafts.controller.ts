import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query, Req, Res, StreamableFile, UploadedFiles, UseInterceptors, BadRequestException } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthenticatedUser } from '../auth/authenticated-user.interface';
import { UploadedImage } from '../storage/storage.service';
import { ShipmentPhotosInterceptor } from '../shipments/shipment-photos.interceptor';
import { FormDraftsService, SaveFormDraft } from './form-drafts.service';

@Controller('form-drafts')
export class FormDraftsController {
  constructor(private readonly service: FormDraftsService) {}
  @Get(':key') get(@Param('key') key: string, @Query('mode') mode: string, @Req() req: Request): ReturnType<FormDraftsService['get']> { return this.service.get(key, mode, req.user as AuthenticatedUser); }
  @Post(':key') @UseInterceptors(ShipmentPhotosInterceptor)
  save(@Param('key') key: string, @Query('mode') mode: string, @Body('payload') payload: string, @UploadedFiles() files: UploadedImage[], @Req() req: Request): ReturnType<FormDraftsService['save']> {
    let dto: SaveFormDraft;
    try { if (typeof payload !== 'string' || payload.length > 1500000) throw new Error(); dto = JSON.parse(payload) as SaveFormDraft; }
    catch { throw new BadRequestException('Conteúdo do rascunho inválido.'); }
    return this.service.save(key, mode, dto, files ?? [], req.user as AuthenticatedUser);
  }
  @Delete(':key') clear(@Param('key') key: string, @Query('mode') mode: string, @Query('version', ParseIntPipe) version: number, @Req() req: Request): ReturnType<FormDraftsService['clear']> { return this.service.clear(key, mode, version, req.user as AuthenticatedUser); }
  @Get(':key/photos/:ordinal')
  async photo(@Param('key') key: string, @Query('mode') mode: string, @Query('version', ParseIntPipe) version: number, @Param('ordinal', ParseIntPipe) ordinal: number, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const photo = await this.service.photo(key, mode, ordinal, version, req.user as AuthenticatedUser);
    res.set({ 'Content-Type': photo.mimeType, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    return new StreamableFile(photo.data);
  }
}
