import { Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { BillingWebhooksController } from './billing.webhooks.controller';

@Module({
  controllers: [BillingController, BillingWebhooksController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
