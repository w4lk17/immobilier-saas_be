import { Controller, Param, ParseIntPipe, Post } from '@nestjs/common';
import { BillingService } from './billing.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { GetCurrentUser } from '../auth/decorators/get-current-user.decorator';
import { JwtPayload } from '../auth/types';

@Controller('invoices')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Post(':id/pay/stripe')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.TENANT)
  payWithStripe(
    @Param('id', ParseIntPipe) invoiceId: number,
    @GetCurrentUser() user: JwtPayload,
  ) {
    return this.billingService.initiateStripePayment(invoiceId, user);
  }

  @Post(':id/pay/mobile')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.TENANT)
  payWithMobileMoney(
    @Param('id', ParseIntPipe) invoiceId: number,
    @GetCurrentUser() user: JwtPayload,
  ) {
    return this.billingService.initiateMobileMoneyPayment(invoiceId, user);
  }
}
