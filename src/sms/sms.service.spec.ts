import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SmsService } from './sms.service';
import { AfricasTalkingSmsProvider } from './providers/africastalking-sms.provider';
import { TwilioSmsProvider } from './providers/twilio-sms.provider';

describe('SmsService', () => {
  const africasTalkingProvider = {
    sendOtp: jest.fn(),
  } as unknown as jest.Mocked<AfricasTalkingSmsProvider>;
  const twilioProvider = {
    sendOtp: jest.fn(),
  } as unknown as jest.Mocked<TwilioSmsProvider>;

  const createService = (provider?: string) => {
    const configService = {
      get: jest.fn((key: string) =>
        key === 'SMS_PROVIDER' ? provider : undefined,
      ),
    } as unknown as ConfigService;

    return new SmsService(configService, africasTalkingProvider, twilioProvider);
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses Africa Talking by default', async () => {
    const service = createService();

    await service.sendOtp('+2250102030405', '123456');

    expect(africasTalkingProvider.sendOtp).toHaveBeenCalledWith(
      '+2250102030405',
      '123456',
    );
    expect(twilioProvider.sendOtp).not.toHaveBeenCalled();
  });

  it('uses Twilio when SMS_PROVIDER is twilio', async () => {
    const service = createService('twilio');

    await service.sendOtp('+2250102030405', '123456');

    expect(twilioProvider.sendOtp).toHaveBeenCalledWith(
      '+2250102030405',
      '123456',
    );
    expect(africasTalkingProvider.sendOtp).not.toHaveBeenCalled();
  });

  it('fails clearly when SMS_PROVIDER is invalid', async () => {
    const service = createService('bad-provider');

    await expect(
      service.sendOtp('+2250102030405', '123456'),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});
