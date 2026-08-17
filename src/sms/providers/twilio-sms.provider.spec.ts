import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import twilio from 'twilio';
import { TwilioSmsProvider } from './twilio-sms.provider';

jest.mock('twilio', () => jest.fn());

describe('TwilioSmsProvider', () => {
  const createConfigService = (values: Record<string, string | undefined>) =>
    ({
      get: jest.fn((key: string) => values[key]),
    }) as unknown as ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends OTP with a Twilio Messaging Service', async () => {
    const create = jest.fn().mockResolvedValue({ sid: 'SM123' });
    (twilio as unknown as jest.Mock).mockReturnValue({
      messages: { create },
    });

    const provider = new TwilioSmsProvider(
      createConfigService({
        TWILIO_ACCOUNT_SID: 'AC123',
        TWILIO_AUTH_TOKEN: 'token',
        TWILIO_MESSAGING_SERVICE_SID: 'MG123',
      }),
    );

    await provider.sendOtp('+2250102030405', '123456');

    expect(twilio).toHaveBeenCalledWith('AC123', 'token');
    expect(create).toHaveBeenCalledWith({
      to: '+2250102030405',
      body: 'Votre code de verification est 123456. Il expire dans 10 minutes.',
      messagingServiceSid: 'MG123',
    });
  });

  it('fails clearly when Twilio credentials are missing', async () => {
    const provider = new TwilioSmsProvider(createConfigService({}));

    await expect(
      provider.sendOtp('+2250102030405', '123456'),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});
