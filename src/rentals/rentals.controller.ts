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
import { RentalsService } from './rentals.service';
import { CreateRentalDto } from './dto/create-rental.dto';
import { UpdateRentalDto } from './dto/update-rental.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { GetCurrentUser } from '../auth/decorators/get-current-user.decorator';
import { JwtPayload } from '../auth/types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

@Controller('rentals')
export class RentalsController {
  constructor(private readonly rentalsService: RentalsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.MANAGER) // Seuls Admin et Employee peuvent créer
  create(
    @Body() createRentalDto: CreateRentalDto,
    @GetCurrentUser() user: JwtPayload,
  ) {
    return this.rentalsService.create(createRentalDto, user);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.OWNER, UserRole.TENANT)
  // Tous ces rôles peuvent lister, mais le Service filtre les résultats
  findAll(@GetCurrentUser() user: JwtPayload) {
    return this.rentalsService.findAll(user);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.OWNER, UserRole.TENANT)
  // Tous ces rôles peuvent voir le détail, mais le Service vérifie l'appartenance
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @GetCurrentUser() user: JwtPayload,
  ) {
    return this.rentalsService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER) // Owner et Tenant ne peuvent pas modifier
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateRentalDto: UpdateRentalDto,
    @GetCurrentUser() user: JwtPayload,
  ) {
    return this.rentalsService.update(id, updateRentalDto, user);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN) // SEUL ADMIN peut supprimer (Manager bloqué ici)
  remove(
    @Param('id', ParseIntPipe) id: number,
    @GetCurrentUser() user: JwtPayload,
  ) {
    return this.rentalsService.remove(id, user);
  }
}
