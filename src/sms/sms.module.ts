import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SmsService } from './sms.service';
import { AfricasTalkingSmsProvider } from './providers/africastalking-sms.provider';
import { TwilioSmsProvider } from './providers/twilio-sms.provider';

@Module({
  imports: [ConfigModule],
  providers: [SmsService, AfricasTalkingSmsProvider, TwilioSmsProvider],
  exports: [SmsService],
})
export class SmsModule {}
