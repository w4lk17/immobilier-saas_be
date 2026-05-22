import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly configService: ConfigService) {}

  async sendOtpEmail(email: string, otp: string): Promise<void> {
    const transporter = this.createTransporter();
    const from =
      this.configService.get<string>('SMTP_FROM') ??
      this.configService.get<string>('SMTP_USER');

    try {
      await transporter.sendMail({
        from,
        to: email,
        subject: 'Votre code de verification',
        text: `Votre code de verification est ${otp}. Il expire dans 10 minutes.`,
        html: `<p>Votre code de verification est <strong>${otp}</strong>.</p><p>Il expire dans 10 minutes.</p>`,
      });
    } catch (error) {
      this.logger.error(
        `Failed to send OTP email to ${email}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new InternalServerErrorException(
        "Impossible d'envoyer le code OTP par email.",
      );
    }
  }

  private createTransporter(): Transporter {
    const host = this.configService.get<string>('SMTP_HOST');
    const port = Number(this.configService.get<string>('SMTP_PORT') ?? 587);
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');

    if (!host || !user || !pass) {
      throw new InternalServerErrorException(
        'SMTP email configuration is missing.',
      );
    }

    return nodemailer.createTransport({
      host,
      port,
      secure: this.configService.get<string>('SMTP_SECURE') === 'true',
      auth: { user, pass },
    });
  }
}
