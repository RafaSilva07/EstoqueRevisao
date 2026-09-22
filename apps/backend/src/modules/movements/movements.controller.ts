import { AdminGuard } from '../users/admin.guard';
import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { PaginatedResult } from '../../shared/pagination/paginated-result.interface';
import { getAuditRequestMetadata } from '../audit/audit-request-metadata';
import { AuthenticatedUser } from '../auth/authenticated-user.interface';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CancelMovementDto } from './dto/cancel-movement.dto';
import { OperationalLotsService } from '../batches/operational-lots.service';
import { ResolveOperationalLotDto } from '../batches/dto/operational-lot.dto';
import { CreateExternalEntryDto } from './dto/create-external-entry.dto';
import { CreateEffectiveMovementDto } from './dto/create-effective-movement.dto';
import { CreateInternalTransferDto } from './dto/create-internal-transfer.dto';
import { CreateReviewDto } from './dto/create-review.dto';
import { MovementQueryDto } from './dto/movement-query.dto';
import { MovementEntity } from './entities/movement.entity';
import { MovementsService } from './movements.service';

@Controller('movements')
export class MovementsController {
  constructor(private readonly service: MovementsService, private readonly lots: OperationalLotsService) {}

  @Post('resolve-lot')
  @RequirePermissions('movements.create')
  resolveLot(@Body() dto: ResolveOperationalLotDto): ReturnType<OperationalLotsService['preview']> { return this.lots.preview(dto); }

  @Post('external-entries')
  @RequirePermissions('movements.create')
  @UseGuards(AdminGuard)
  createExternalEntry(@Body() dto: CreateExternalEntryDto, @Req() request: Request): Promise<MovementEntity> {
    const user = request.user as AuthenticatedUser;
    return this.service.createExternalEntry(dto, user.id, getAuditRequestMetadata(request));
  }

  @Post('external-exits')
  @RequirePermissions('movements.create')
  @UseGuards(AdminGuard)
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
    @Body() dto: CreateInternalTransferDto,
    @Req() request: Request,
  ): Promise<MovementEntity> {
    const user = request.user as AuthenticatedUser;
    return this.service.createInternalTransfer(dto, user.id, getAuditRequestMetadata(request));
  }

  @Post('reviews')
  @RequirePermissions('movements.create')
  createReview(@Body() dto: CreateReviewDto, @Req() request: Request): Promise<MovementEntity> {
    const user = request.user as AuthenticatedUser;
    return this.service.createReview(dto, user.id, getAuditRequestMetadata(request));
  }

  @Post(':id/cancellation')
  @RequirePermissions('movements.cancel')
  @UseGuards(AdminGuard)
  cancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CancelMovementDto,
    @Req() request: Request,
  ): Promise<MovementEntity> {
    const user = request.user as AuthenticatedUser;
    return this.service.cancel(id, dto, user.id, getAuditRequestMetadata(request));
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
