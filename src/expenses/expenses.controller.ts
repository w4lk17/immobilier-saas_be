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
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { GetCurrentUser } from '../auth/decorators/get-current-user.decorator';
import { JwtPayload } from '../auth/types';

@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.EMPLOYEE, UserRole.OWNER) // Admin, Manager, or Owner can add
  create(
    @Body() createExpenseDto: CreateExpenseDto,
    @GetCurrentUser() user: JwtPayload,
  ) {
    // Service checks specific property permission
    return this.expensesService.create(createExpenseDto, user);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.EMPLOYEE, UserRole.OWNER) // Admin, Manager, or Owner can list (filtered by service)
  findAll(@GetCurrentUser() user: JwtPayload) {
    return this.expensesService.findAll(user);
  }

  // Optional: Get expenses for a specific property
  @Get('property/:propertyId')
  @Roles(UserRole.ADMIN, UserRole.EMPLOYEE, UserRole.OWNER)
  findAllByProperty(
    @Param('propertyId', ParseIntPipe) propertyId: number,
    @GetCurrentUser() user: JwtPayload,
  ) {
    // TODO: Implement service method findAllByProperty(propertyId, user) with permission checks
    console.log(
      `Finding expenses for property ${propertyId} by user ${user.sub}`,
    );
    // return this.expensesService.findAllByProperty(propertyId, user);
    throw new Error(
      'findAllByProperty endpoint not yet implemented in service',
    );
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.EMPLOYEE, UserRole.OWNER) // Admin, Manager, or Owner can view
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @GetCurrentUser() user: JwtPayload,
  ) {
    // Service checks specific property permission
    return this.expensesService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.EMPLOYEE, UserRole.OWNER) // Admin, Manager, or Owner can update
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateExpenseDto: UpdateExpenseDto,
    @GetCurrentUser() user: JwtPayload,
  ) {
    // Service checks specific property permission
    return this.expensesService.update(id, updateExpenseDto, user);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.EMPLOYEE, UserRole.OWNER) // Admin, Manager, or Owner can delete
  remove(
    @Param('id', ParseIntPipe) id: number,
    @GetCurrentUser() user: JwtPayload,
  ) {
    // Service checks specific property permission
    return this.expensesService.remove(id, user);
  }
}
