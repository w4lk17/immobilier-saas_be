import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class ResendOtpDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+[1-9]\d{7,14}$/, {
    message: 'phone must be a valid international phone number.',
  })
  phone: string;
}
