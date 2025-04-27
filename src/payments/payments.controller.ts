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
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { GetCurrentUser } from '../auth/decorators/get-current-user.decorator';
import { JwtPayload } from '../auth/types';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.EMPLOYEE) // Admin or Manager creates payment records
  create(
    @Body() createPaymentDto: CreatePaymentDto,
    @GetCurrentUser() user: JwtPayload,
  ) {
    return this.paymentsService.create(createPaymentDto, user);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.EMPLOYEE, UserRole.OWNER, UserRole.TENANT) // Broader view access
  findAll(@GetCurrentUser() user: JwtPayload) {
    // Service filters results
    return this.paymentsService.findAll(user);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.EMPLOYEE, UserRole.OWNER, UserRole.TENANT) // Broader view access
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @GetCurrentUser() user: JwtPayload,
  ) {
    // Service checks specific access
    return this.paymentsService.findOne(id, user);
  }

  @Patch(':id')
  // Allow Tenant specific update (status to PAID) + Admin/Manager general update
  @Roles(UserRole.ADMIN, UserRole.EMPLOYEE, UserRole.TENANT)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updatePaymentDto: UpdatePaymentDto,
    @GetCurrentUser() user: JwtPayload,
  ) {
    // Service handles permission logic based on user role and DTO content
    return this.paymentsService.update(id, updatePaymentDto, user);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.EMPLOYEE) // Only Admin or Manager can delete
  remove(
    @Param('id', ParseIntPipe) id: number,
    @GetCurrentUser() user: JwtPayload,
  ) {
    return this.paymentsService.remove(id, user);
  }
}
