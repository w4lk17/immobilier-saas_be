import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
} from '@nestjs/common';
import { OwnersService } from './owners.service';
import { CreateOwnerDto } from './dto/create-owner.dto';
import { UpdateOwnerDto } from './dto/update-owner.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { GetCurrentUser } from '../auth/decorators/get-current-user.decorator';
import { JwtPayload } from '../auth/types';

@Controller('owners')
export class OwnersController {
  constructor(private readonly ownersService: OwnersService) {}

  @Post()
  @Roles(UserRole.ADMIN) // Only Admins can link a User to an Owner profile
  create(@Body() createOwnerDto: CreateOwnerDto) {
    return this.ownersService.create(createOwnerDto);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.EMPLOYEE) // Admins and Employees can list owners
  findAll() {
    return this.ownersService.findAll();
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.EMPLOYEE, UserRole.OWNER) // Admins, Employees, and the Owner themselves can view
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @GetCurrentUser() user: JwtPayload,
  ) {
    // TODO: Add logic here or in service: If user.role is OWNER, check if 'id' corresponds to their own owner profile ID.
    console.log(
      `User <span class="math-inline">\{user\.sub\} \(</span>{user.role}) requesting owner ${id}`,
    );
    return this.ownersService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.OWNER) // Admins and the Owner themselves can update
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateOwnerDto: UpdateOwnerDto,
    @GetCurrentUser() user: JwtPayload,
  ) {
    // TODO: Add logic here or in service: If user.role is OWNER, check if 'id' corresponds to their own owner profile ID before allowing update.
    console.log(
      `User <span class="math-inline">\{user\.sub\} \(</span>{user.role}) updating owner ${id}`,
    );
    return this.ownersService.update(id, updateOwnerDto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN) // Only Admins can delete owner profiles (cascades to Properties!)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.ownersService.remove(id);
  }
}
