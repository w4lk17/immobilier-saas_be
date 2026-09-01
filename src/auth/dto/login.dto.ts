import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';
export class LoginDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+[1-9]\d{7,14}$/, { message: 'phone must be a valid international phone number.' })
  phone: string;
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;
}
