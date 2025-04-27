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
import { JwtPayload } from '../auth/types';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.EMPLOYEE) // Admins or Employees can create tenant profiles
  create(@Body() createTenantDto: CreateTenantDto) {
    return this.tenantsService.create(createTenantDto);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.EMPLOYEE) // Admins and Employees can list tenants
  findAll() {
    return this.tenantsService.findAll();
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.EMPLOYEE, UserRole.TENANT) // Admins, Employees, and the Tenant themselves can view
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @GetCurrentUser() user: JwtPayload,
  ) {
    // TODO: Add logic here or in service: If user.role is TENANT, check if 'id' corresponds to their own tenant profile ID.
    console.log(
      `User <span class="math-inline">\{user\.sub\} \(</span>{user.role}) requesting tenant ${id}`,
    );
    return this.tenantsService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.EMPLOYEE, UserRole.TENANT) // Admins, Employees, and the Tenant themselves can update
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateTenantDto: UpdateTenantDto,
    @GetCurrentUser() user: JwtPayload,
  ) {
    // TODO: Add logic here or in service: If user.role is TENANT, check if 'id' corresponds to their own tenant profile ID before allowing update.
    console.log(
      `User <span class="math-inline">\{user\.sub\} \(</span>{user.role}) updating tenant ${id}`,
    );
    return this.tenantsService.update(id, updateTenantDto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.EMPLOYEE) // Admins and Employees can delete tenants (if no restricting relations exist)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.tenantsService.remove(id);
  }
}
