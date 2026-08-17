import { Controller, Get } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { GetCurrentUser } from '../auth/decorators/get-current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequestUser } from '../auth/types';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('admin')
  @Roles(UserRole.ADMIN)
  getAdminDashboard(@GetCurrentUser() user: RequestUser) {
    return this.dashboardService.getAdminDashboard(user);
  }

  @Get('manager')
  @Roles(UserRole.MANAGER)
  getManagerDashboard(@GetCurrentUser() user: RequestUser) {
    return this.dashboardService.getManagerDashboard(user);
  }

  @Get('owner')
  @Roles(UserRole.OWNER)
  getOwnerDashboard(@GetCurrentUser() user: RequestUser) {
    return this.dashboardService.getOwnerDashboard(user);
  }

  @Get('tenant')
  @Roles(UserRole.TENANT)
  getTenantDashboard(@GetCurrentUser() user: RequestUser) {
    return this.dashboardService.getTenantDashboard(user);
  }
}

