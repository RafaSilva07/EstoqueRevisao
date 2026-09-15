import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { getAuditRequestMetadata } from '../audit/audit-request-metadata';
import { AuthenticatedUser } from '../auth/authenticated-user.interface';
import { AdminGuard } from './admin.guard';
import { CreateUserDto, UpdateUserDto, UserQueryDto } from './dto/user.dto';
import { PublicUser, UsersService } from './users.service';
import { PaginatedResult } from '../../shared/pagination/paginated-result.interface';

@Controller('users')
@UseGuards(AdminGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@Query() query: UserQueryDto): Promise<PaginatedResult<PublicUser>> { return this.users.list(query); }

  @Get('roles')
  roles(): Promise<PublicUser['roles']> { return this.users.roles(); }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<PublicUser> { return this.users.get(id); }

  @Post()
  create(@Body() dto: CreateUserDto, @Req() request: Request): Promise<PublicUser> {
    return this.users.create(dto, (request.user as AuthenticatedUser).id, getAuditRequestMetadata(request));
  }

  @Patch(':id')
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateUserDto, @Req() request: Request): Promise<PublicUser> {
    return this.users.update(id, dto, (request.user as AuthenticatedUser).id, getAuditRequestMetadata(request));
  }

  @Delete(':id')
  remove(@Param('id', new ParseUUIDPipe()) id: string, @Req() request: Request): Promise<PublicUser> {
    return this.users.remove(id, (request.user as AuthenticatedUser).id, getAuditRequestMetadata(request));
  }
}
