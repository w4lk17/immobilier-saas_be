import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from '@prisma/client';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator'; // Optional: If you implement Role guards
import { UserRole } from '@prisma/client';
// import { RolesGuard } from '../auth/guards/roles.guard'; // Optional: If you implement Role guards

// @UseGuards(RolesGuard) // Optional: Apply role guard at controller level
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // Allow public user creation (registration)
  @Public()
  @Post()
  create(
    @Body() createUserDto: CreateUserDto,
  ): Promise<Omit<User, 'password' | 'hashedRefreshToken'>> {
    return this.usersService.create(createUserDto);
  }

  // Example: Only Admins can list all users
  @Roles(UserRole.ADMIN)
  @Get()
  findAll(): Promise<Omit<User, 'password' | 'hashedRefreshToken'>[]> {
    return this.usersService.findAll();
  }

  // Example: Users can get their own profile (handled by auth/profile), Admins can get any
  @Roles(UserRole.ADMIN) // Or add logic to check if id matches logged-in user
  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<Omit<User, 'password' | 'hashedRefreshToken'>> {
    return this.usersService.findOne(id);
  }

  // Example: Users can update their own profile, Admins can update any
  @Roles(UserRole.ADMIN) // Or add logic to check if id matches logged-in user
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<Omit<User, 'password' | 'hashedRefreshToken'>> {
    return this.usersService.update(id, updateUserDto);
  }

  // Example: Only Admins can delete users
  @Roles(UserRole.ADMIN)
  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<Omit<User, 'password' | 'hashedRefreshToken'>> {
    return this.usersService.remove(id);
  }
}
