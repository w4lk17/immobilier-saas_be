import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import twilio from 'twilio';
import { SmsProvider } from '../interfaces/sms-provider.interface';

@Injectable()
export class TwilioSmsProvider implements SmsProvider {
  private readonly logger = new Logger(TwilioSmsProvider.name);

  constructor(private readonly configService: ConfigService) {}

  async sendOtp(phone: string, otp: string): Promise<void> {
    const client = this.createClient();
    const messagingServiceSid = this.configService.get<string>(
      'TWILIO_MESSAGING_SERVICE_SID',
    );

    if (!messagingServiceSid) {
      throw new InternalServerErrorException(
        'La configuration SMS Twilio est incomplete: TWILIO_MESSAGING_SERVICE_SID est requis.',
      );
    }

    try {
      await client.messages.create({
        to: phone,
        body: this.buildOtpMessage(otp),
        messagingServiceSid,
      });
    } catch (error) {
      this.logger.error(
        `Failed to send OTP SMS with Twilio to ${phone}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new InternalServerErrorException(
        "Impossible d'envoyer le code OTP par SMS avec Twilio.",
      );
    }
  }

  private createClient(): ReturnType<typeof twilio> {
    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');

    if (!accountSid || !authToken) {
      throw new InternalServerErrorException(
        'La configuration SMS Twilio est incomplete: TWILIO_ACCOUNT_SID et TWILIO_AUTH_TOKEN sont requis.',
      );
    }

    return twilio(accountSid, authToken);
  }

  private buildOtpMessage(otp: string): string {
    return `Votre code de verification est ${otp}. Il expire dans 10 minutes.`;
  }
}
