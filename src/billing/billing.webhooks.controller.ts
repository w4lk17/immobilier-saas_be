import { Controller, Headers, Post, RawBodyRequest, Req } from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { BillingService } from './billing.service';

@Controller('webhooks')
export class BillingWebhooksController {
  constructor(private readonly billingService: BillingService) {}

  @Public()
  @Post('stripe')
  async stripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature?: string,
  ) {
    const rawBody = req.rawBody;
    return this.billingService.handleStripeWebhook(rawBody, signature);
  }

  // Generic mobile money callback endpoint (provider integration will define exact payload + signature verification)
  @Public()
  @Post('mobile-money')
  async mobileMoneyWebhook(@Req() req: Request) {
    return this.billingService.handleMobileMoneyWebhook(req.body);
  }
}

