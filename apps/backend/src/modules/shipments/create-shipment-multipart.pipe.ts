import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateShipmentDto } from './shipment.dto';

@Injectable()
export class CreateShipmentMultipartPipe implements PipeTransform<string, Promise<CreateShipmentDto>> {
  async transform(value: string): Promise<CreateShipmentDto> {
    if (!value) throw new BadRequestException('Os dados do envio são obrigatórios.');
    let parsed: unknown;
    try { parsed = JSON.parse(value) as unknown; }
    catch { throw new BadRequestException('Os dados do envio são inválidos.'); }
    const dto = plainToInstance(CreateShipmentDto, parsed);
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    if (errors.length) throw new BadRequestException('Confira os dados e produtos do envio.');
    return dto;
  }
}
