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
import { ManagersService } from './managers.service';
import { CreateManagerDto } from './dto/create-manager.dto';
import { UpdateManagerDto } from './dto/update-manager.dto';
import { UpdateStatusDto } from '../common/dto/update-status.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { GetCurrentUser } from '../auth/decorators/get-current-user.decorator';
import { RequestUser } from '../auth/types';

@Controller('managers')
export class ManagersController {
  constructor(private readonly managersService: ManagersService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  create(
    @Body() createManagerDto: CreateManagerDto,
    @GetCurrentUser() user: RequestUser,
  ) {
    return this.managersService.create(user.id, createManagerDto);
  }

  @Get()
  @Roles(UserRole.ADMIN)
  findAll(@GetCurrentUser() user: RequestUser) {
    return this.managersService.findAll(user);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @GetCurrentUser() user: RequestUser,
  ) {
    return this.managersService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateManagerDto: UpdateManagerDto,
    @GetCurrentUser() user: RequestUser,
  ) {
    return this.managersService.update(id, updateManagerDto, user);
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN)
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateStatusDto: UpdateStatusDto,
    @GetCurrentUser() user: RequestUser,
  ) {
    return this.managersService.updateStatus(id, updateStatusDto, user);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  remove(
    @Param('id', ParseIntPipe) id: number,
    @GetCurrentUser() user: RequestUser,
  ) {
    return this.managersService.remove(id, user);
  }
}
