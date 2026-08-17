import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import AfricasTalking from 'africastalking';
import { SmsProvider } from '../interfaces/sms-provider.interface';

@Injectable()
export class AfricasTalkingSmsProvider implements SmsProvider {
  private readonly logger = new Logger(AfricasTalkingSmsProvider.name);

  constructor(private readonly configService: ConfigService) {}

  async sendOtp(phone: string, otp: string): Promise<void> {
    const smsClient = this.createSmsClient();
    const senderId = this.configService.get<string>('AT_SENDER_ID');
    const enqueue = this.configService.get<string>('AT_ENQUEUE') === 'true';

    const options = {
      to: [phone],
      message: this.buildOtpMessage(otp),
      ...(senderId ? { senderId } : {}),
      ...(enqueue ? { enqueue } : {}),
    };

    try {
      await smsClient.send(options);
    } catch (error) {
      this.logger.error(
        `Failed to send OTP SMS with Africa's Talking to ${phone}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new InternalServerErrorException(
        "Impossible d'envoyer le code OTP par SMS avec Africa's Talking.",
      );
    }
  }

  private createSmsClient(): { send(options: unknown): Promise<unknown> } {
    const username = this.configService.get<string>('AT_USERNAME');
    const apiKey = this.configService.get<string>('AT_API_KEY');

    if (!username || !apiKey) {
      throw new InternalServerErrorException(
        "La configuration SMS Africa's Talking est incomplete.",
      );
    }

    const client = AfricasTalking({ username, apiKey });
    return client.SMS;
  }

  private buildOtpMessage(otp: string): string {
    return `Votre code de verification est ${otp}. Il expire dans 10 minutes.`;
  }
}
