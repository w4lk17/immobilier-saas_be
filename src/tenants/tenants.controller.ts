import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
} from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { GetCurrentUser } from '../auth/decorators/get-current-user.decorator';
import { RequestUser } from '../auth/types';
import { UpdateStatusDto } from 'src/common/dto/update-status.dto';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  create(
    @Body() createTenantDto: CreateTenantDto,
    @GetCurrentUser() user: RequestUser,
  ) {
    // On passe l'ID admin pour vérifier l'org et lier le locataire
    return this.tenantsService.create(user.id, createTenantDto);
  }

  @Get()
  @Roles(UserRole.ADMIN)
  findAll(@GetCurrentUser() user: RequestUser) {
    return this.tenantsService.findAll(user.organizationId);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.TENANT)
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @GetCurrentUser() user: RequestUser,
  ) {
    return this.tenantsService.findOne(id, user.organizationId);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.TENANT)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateTenantDto: UpdateTenantDto,
    @GetCurrentUser() user: RequestUser,
  ) {
    return this.tenantsService.update(id, user.organizationId, updateTenantDto);
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN)
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateStatusDto: UpdateStatusDto,
  ) {
    return this.tenantsService.updateStatus(id, updateStatusDto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  remove(
    @Param('id', ParseIntPipe) id: number,
    @GetCurrentUser() user: RequestUser,
  ) {
    return this.tenantsService.remove(id, user.organizationId);
  }
}
