export interface SmsProvider {
  sendOtp(phone: string, otp: string): Promise<void>;
}
