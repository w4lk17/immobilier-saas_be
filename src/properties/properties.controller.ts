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
import { PropertiesService } from './properties.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { GetCurrentUser } from '../auth/decorators/get-current-user.decorator';
import { JwtPayload } from '../auth/types';

@Controller('properties')
export class PropertiesController {
  constructor(private readonly propertiesService: PropertiesService) { }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.MANAGER) // Seuls Admin et Manager peuvent créer
  create(
    @Body() createPropertyDto: CreatePropertyDto,
    @GetCurrentUser() user: JwtPayload,
  ) {
    return this.propertiesService.create(createPropertyDto, user);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.OWNER)
  findAll(@GetCurrentUser() user: JwtPayload) {
    // On passe l'utilisateur au service pour qu'il filtre (Admin voit tout, Owner voit ses biens, etc.)
    return this.propertiesService.findAll(user);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.OWNER) // Admin, Manager et Owner peuvent voir le détail
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @GetCurrentUser() user: JwtPayload,
  ) {
    return this.propertiesService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER) // Seuls Admin et Manager peuvent modifier
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updatePropertyDto: UpdatePropertyDto,
    @GetCurrentUser() user: JwtPayload,
  ) {
    return this.propertiesService.update(id, updatePropertyDto, user);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN) // SEUL ADMIN peut supprimer (le manager ne peut pas)
  remove(
    @Param('id', ParseIntPipe) id: number,
    @GetCurrentUser() user: JwtPayload,
  ) {
    return this.propertiesService.remove(id, user);
  }
}