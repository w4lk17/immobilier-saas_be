import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { Roles } from '../auth/decorators/roles.decorator'; // Adjust path
import { UserRole } from '@prisma/client';
import { GetCurrentUser } from '../auth/decorators/get-current-user.decorator'; // Adjust path
import { JwtPayload } from '../auth/types'; // Adjust path

@Controller('employees')
// Global guards (JwtAuthGuard, RolesGuard) are active by default
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Post()
  @Roles(UserRole.ADMIN) // Only Admins can create new employee profiles
  create(@Body() createEmployeeDto: CreateEmployeeDto) {
    return this.employeesService.create(createEmployeeDto);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.EMPLOYEE) // Admins and Employees can list employees
  findAll() {
    // TODO: Employees should potentially only see themselves or colleagues?
    // Add filtering logic in service based on user role/ID if needed.
    return this.employeesService.findAll();
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.EMPLOYEE) // Admins and Employees can view details
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @GetCurrentUser() user: JwtPayload, // Get logged-in user info
  ) {
    // TODO: Add logic here or in service: If user.role is EMPLOYEE, check if user.sub (their ID) matches the employee's userId or if id matches their own employee profile id.
    console.log(
      `User <span class="math-inline">\{user\.sub\} \(</span>{user.role}) requesting employee ${id}`,
    );
    return this.employeesService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.EMPLOYEE) // Admins can update anyone, Employees potentially themselves
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateEmployeeDto: UpdateEmployeeDto,
    @GetCurrentUser() user: JwtPayload, // Get logged-in user info
  ) {
    // TODO: Add logic here or in service: If user.role is EMPLOYEE, check if 'id' corresponds to their own employee profile before allowing update.
    console.log(
      `User <span class="math-inline">\{user\.sub\} \(</span>{user.role}) updating employee ${id}`,
    );
    return this.employeesService.update(id, updateEmployeeDto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN) // Only Admins can delete employee profiles
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.employeesService.remove(id);
  }
}
