import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { PropertiesService } from './properties.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { Public } from '../auth/decorators/public.decorator';
import { GetCurrentUser } from '../auth/decorators/get-current-user.decorator';
import { JwtPayload } from '../auth/types';

@Controller('properties')
export class PropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.OWNER) // Admins or Owners can create (service checks ownership)
  create(
    @Body() createPropertyDto: CreatePropertyDto,
    @GetCurrentUser() user: JwtPayload,
  ) {
    return this.propertiesService.create(createPropertyDto, user);
  }

  @Public() // Make listing public? Or require login? Let's make it Public for now.
  @Get()
  findAll(/* @Query() queryParams: any */) {
    // Add query params for filtering/pagination later
    return this.propertiesService.findAll();
  }

  @Public() // Make viewing details public?
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.propertiesService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.OWNER, UserRole.EMPLOYEE) // Admin, Owner, or Manager can update (service checks permissions)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updatePropertyDto: UpdatePropertyDto,
    @GetCurrentUser() user: JwtPayload,
  ) {
    return this.propertiesService.update(id, updatePropertyDto, user);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.OWNER) // Admin or Owner can delete (service checks ownership)
  remove(
    @Param('id', ParseIntPipe) id: number,
    @GetCurrentUser() user: JwtPayload,
  ) {
    return this.propertiesService.remove(id, user);
  }
}
