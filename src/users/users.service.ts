import {
  Injectable,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  // Function to securely select user data (exclude sensitive fields)
  private selectSecureUserData(
    user: User | null,
  ): Omit<User, 'password' | 'hashedRefreshToken'> {
    if (!user) {
      console.error(
        'selectSecureUserData received null input where non-null was expected.',
      );
      throw new InternalServerErrorException(
        'Unexpected null user data encountered.',
      );
    }
    const { password, hashedRefreshToken, ...secureUser } = user;
    return secureUser;
  }

  async create(
    createUserDto: CreateUserDto,
  ): Promise<Omit<User, 'password' | 'hashedRefreshToken'>> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: createUserDto.email },
    });
    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(createUserDto.password, salt);

    try {
      const newUser = await this.prisma.user.create({
        data: {
          ...createUserDto,
          password: hashedPassword,
        },
      });
      return this.selectSecureUserData(newUser);
    } catch (error) {
      console.error('Error creating user:', error);
      throw new InternalServerErrorException('Could not create user.');
    }
  }

  async findAll(): Promise<Omit<User, 'password' | 'hashedRefreshToken'>[]> {
    try {
      const users = await this.prisma.user.findMany();
      if (!users) {
        throw new InternalServerErrorException(
          'Error retrieving all users from database.',
        );
      }
      return users
        .map((user) => this.selectSecureUserData(user))
        .filter(
          (user): user is Omit<User, 'password' | 'hashedRefreshToken'> =>
            user !== null,
        );
    } catch (error) {
      console.error('Error finding all users:', error);
      throw new InternalServerErrorException('Could not find all users.');
    }
  }

  async findOne(
    id: number,
  ): Promise<Omit<User, 'password' | 'hashedRefreshToken'>> {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });
    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }
    return this.selectSecureUserData(user);
  }

  // Find user by email, including sensitive fields (for auth validation)
  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async update(
    id: number,
    updateUserDto: UpdateUserDto,
  ): Promise<Omit<User, 'password' | 'hashedRefreshToken'>> {
    // Prevent accidental refresh token update via this endpoint
    if ('hashedRefreshToken' in updateUserDto) {
      delete updateUserDto.hashedRefreshToken;
      console.warn(
        'Attempted to update hashedRefreshToken via regular update endpoint. Operation skipped.',
      );
    }

    // Handle password update specifically
    if (updateUserDto.password) {
      const salt = await bcrypt.genSalt(10);
      updateUserDto.password = await bcrypt.hash(updateUserDto.password, salt);
    }

    try {
      const updatedUser = await this.prisma.user.update({
        where: { id },
        data: updateUserDto,
      });
      return this.selectSecureUserData(updatedUser);
    } catch (error) {
      // Handle Prisma errors (e.g., P2025 Record not found)
      if (error.code === 'P2025') {
        throw new NotFoundException(`User with ID "${id}" not found.`);
      }
      if (error.code === 'P2002') {
        // Unique constraint violation (e.g., email)
        throw new ConflictException('Email already exists.');
      }
      console.error('Error updating user:', error);
      throw new InternalServerErrorException('Could not update user.');
    }
  }

  async remove(
    id: number,
  ): Promise<Omit<User, 'password' | 'hashedRefreshToken'>> {
    try {
      const deletedUser = await this.prisma.user.delete({
        where: { id },
      });
      console.log(`User ${id} removed successfully`);
      return this.selectSecureUserData(deletedUser);
    } catch (error) {
      if (error.code === 'P2025') {
        throw new NotFoundException(`User with ID "${id}" not found.`);
      }
      // Handle other potential errors like foreign key constraints if onDelete wasn't Cascade
      console.error('Error deleting user:', error);
      throw new InternalServerErrorException('Could not delete user.');
    }
  }

  // Method specifically for AuthService to update the refresh token hash
  async updateRefreshTokenHash(
    userId: number,
    hashedRefreshToken: string | null,
  ): Promise<void> {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { hashedRefreshToken },
      });
    } catch (error) {
      console.error(
        `Failed to update refresh token for user ${userId}:`,
        error,
      );
      // Decide if this should throw or just log
    }
  }
}
