import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { PaginatedResult } from '../../shared/pagination/paginated-result.interface';
import { getAuditRequestMetadata } from '../audit/audit-request-metadata';
import { AuthenticatedUser } from '../auth/authenticated-user.interface';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CreateEffectiveMovementDto } from './dto/create-effective-movement.dto';
import { MovementQueryDto } from './dto/movement-query.dto';
import { MovementEntity } from './entities/movement.entity';
import { MovementsService } from './movements.service';

@Controller('movements')
export class MovementsController {
  constructor(private readonly service: MovementsService) {}

  @Post('external-entries')
  @RequirePermissions('movements.create')
  createExternalEntry(@Body() dto: CreateEffectiveMovementDto, @Req() request: Request): Promise<MovementEntity> {
    const user = request.user as AuthenticatedUser;
    return this.service.createExternalEntry(dto, user.id, getAuditRequestMetadata(request));
  }

  @Post('external-exits')
  @RequirePermissions('movements.create')
  createExternalExit(
    @Body() dto: CreateEffectiveMovementDto,
    @Req() request: Request,
  ): Promise<MovementEntity> {
    const user = request.user as AuthenticatedUser;
    return this.service.createExternalExit(dto, user.id, getAuditRequestMetadata(request));
  }

  @Post('internal-transfers')
  @RequirePermissions('movements.create')
  createInternalTransfer(
    @Body() dto: CreateEffectiveMovementDto,
    @Req() request: Request,
  ): Promise<MovementEntity> {
    const user = request.user as AuthenticatedUser;
    return this.service.createInternalTransfer(dto, user.id, getAuditRequestMetadata(request));
  }

  @Get()
  @RequirePermissions('movements.read')
  list(@Query() query: MovementQueryDto): Promise<PaginatedResult<MovementEntity>> {
    return this.service.list(query);
  }

  @Get(':id')
  @RequirePermissions('movements.read')
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<MovementEntity> {
    return this.service.getById(id);
  }
}
