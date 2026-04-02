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
  @Roles(UserRole.ADMIN, UserRole.MANAGER) // Seuls Admin et Employee peuvent créer
  create(
    @Body() createExpenseDto: CreateExpenseDto,
    @GetCurrentUser() user: JwtPayload,
  ) {
    return this.expensesService.create(createExpenseDto, user);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.OWNER) // Tous peuvent lister (filtré par le service)
  findAll(@GetCurrentUser() user: JwtPayload) {
    return this.expensesService.findAll(user);
  }

  // --- Routes Spécifiques (AVANT :id) ---

  @Get('property/:propertyId')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.OWNER)
  findAllByProperty(
    @Param('propertyId', ParseIntPipe) propertyId: number,
    @GetCurrentUser() user: JwtPayload,
  ) {
    return this.expensesService.findAllByProperty(propertyId, user);
  }

  @Get('rental/:rentalId')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.OWNER)
  findAllByRental(
    @Param('rentalId', ParseIntPipe) rentalId: number,
    @GetCurrentUser() user: JwtPayload,
  ) {
    return this.expensesService.findAllByRental(rentalId, user);
  }

  // --- Route Dynamique ---

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.OWNER)
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @GetCurrentUser() user: JwtPayload,
  ) {
    return this.expensesService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER) // Owner ne peut pas modifier
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateExpenseDto: UpdateExpenseDto,
    @GetCurrentUser() user: JwtPayload,
  ) {
    return this.expensesService.update(id, updateExpenseDto, user);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER) // Owner ne peut pas supprimer
  remove(
    @Param('id', ParseIntPipe) id: number,
    @GetCurrentUser() user: JwtPayload,
  ) {
    return this.expensesService.remove(id, user);
  }
}
