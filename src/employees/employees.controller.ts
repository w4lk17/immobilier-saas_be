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
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { UpdateStatusDto } from '../common/dto/update-status.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { GetCurrentUser } from '../auth/decorators/get-current-user.decorator';
import { JwtPayload } from '../auth/types';

@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) { }

  @Post()
  @Roles(UserRole.ADMIN) 
  create(@Body() createEmployeeDto: CreateEmployeeDto) {
    return this.employeesService.create(createEmployeeDto);
  }

  @Get()
  @Roles(UserRole.ADMIN) // Seul l'Admin peut lister tous les employés
  findAll() {
    return this.employeesService.findAll();
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER) // Admin ou l'employé lui-même
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @GetCurrentUser() user: JwtPayload,
  ) {
    // Le service vérifiera si l'employé tente de voir le profil d'un autre
    return this.employeesService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER) // Admin ou l'employé lui-même
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateEmployeeDto: UpdateEmployeeDto,
    @GetCurrentUser() user: JwtPayload,
  ) {
    // Le service vérifiera les droits (ex: un employé ne peut pas changer son poste)
    return this.employeesService.update(id, updateEmployeeDto, user);
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN) // Seul l'Admin peut changer le statut actif/inactif
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateStatusDto: UpdateStatusDto,
  ) {
    return this.employeesService.updateStatus(id, updateStatusDto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN) // Seul l'Admin peut supprimer un profil employé
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.employeesService.remove(id);
  }
}