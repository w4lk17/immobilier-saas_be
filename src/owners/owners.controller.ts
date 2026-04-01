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
import { OwnersService } from './owners.service';
import { CreateOwnerDto } from './dto/create-owner.dto';
import { UpdateOwnerDto } from './dto/update-owner.dto';
import { UpdateStatusDto } from '../common/dto/update-status.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { GetCurrentUser } from '../auth/decorators/get-current-user.decorator';
import { JwtPayload } from '../auth/types';

@Controller('owners')
export class OwnersController {
  constructor(private readonly ownersService: OwnersService) { }

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() createOwnerDto: CreateOwnerDto) {
    return this.ownersService.create(createOwnerDto);
  }

  @Get()
  @Roles(UserRole.ADMIN)
  findAll() {
    return this.ownersService.findAll();
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @GetCurrentUser() user: JwtPayload,
  ) {
    return this.ownersService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateOwnerDto: UpdateOwnerDto,
    @GetCurrentUser() user: JwtPayload,
  ) {
    return this.ownersService.update(id, updateOwnerDto, user);
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN) 
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateStatusDto: UpdateStatusDto,
  ) {
    return this.ownersService.updateStatus(id, updateStatusDto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.ownersService.remove(id);
  }
}