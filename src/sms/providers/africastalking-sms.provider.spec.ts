import AfricasTalking from 'africastalking';
import { ConfigService } from '@nestjs/config';
import { AfricasTalkingSmsProvider } from './africastalking-sms.provider';

jest.mock('africastalking', () => jest.fn());

describe('AfricasTalkingSmsProvider', () => {
  const createConfigService = (values: Record<string, string | undefined>) =>
    ({
      get: jest.fn((key: string) => values[key]),
    }) as unknown as ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends OTP with Africa Talking', async () => {
    const send = jest.fn().mockResolvedValue({});
    (AfricasTalking as unknown as jest.Mock).mockReturnValue({
      SMS: { send },
    });

    const provider = new AfricasTalkingSmsProvider(
      createConfigService({
        AT_USERNAME: 'sandbox',
        AT_API_KEY: 'api-key',
      }),
    );

    await provider.sendOtp('+2250102030405', '123456');

    expect(AfricasTalking).toHaveBeenCalledWith({
      username: 'sandbox',
      apiKey: 'api-key',
    });
    expect(send).toHaveBeenCalledWith({
      to: ['+2250102030405'],
      message:
        'Votre code de verification est 123456. Il expire dans 10 minutes.',
    });
  });
});
