import {
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AfricasTalkingSmsProvider } from './providers/africastalking-sms.provider';
import { TwilioSmsProvider } from './providers/twilio-sms.provider';
import { SmsProvider } from './interfaces/sms-provider.interface';

type SmsProviderName = 'africastalking' | 'twilio';

@Injectable()
export class SmsService {
  constructor(
    private readonly configService: ConfigService,
    private readonly africasTalkingProvider: AfricasTalkingSmsProvider,
    private readonly twilioProvider: TwilioSmsProvider,
  ) {}

  async sendOtp(phone: string, otp: string): Promise<void> {
    await this.getProvider().sendOtp(phone, otp);
  }

  private getProvider(): SmsProvider {
    const provider = this.getProviderName();

    if (provider === 'africastalking') {
      return this.africasTalkingProvider;
    }

    return this.twilioProvider;
  }

  private getProviderName(): SmsProviderName {
    const provider =
      this.configService.get<string>('SMS_PROVIDER') ?? 'africastalking';

    if (provider === 'africastalking' || provider === 'twilio') {
      return provider;
    }

    throw new InternalServerErrorException(
      'SMS_PROVIDER doit etre "africastalking" ou "twilio".',
    );
  }
}
