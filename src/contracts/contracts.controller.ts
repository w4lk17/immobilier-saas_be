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
import { ContractsService } from './contracts.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { GetCurrentUser } from '../auth/decorators/get-current-user.decorator';
import { RequestUser } from '../auth/types';

@Controller('contracts')
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  create(
    @Body() createContractDto: CreateContractDto,
    @GetCurrentUser() user: RequestUser,
  ) {
    return this.contractsService.create(user.id, createContractDto);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.TENANT)
  findAll(@GetCurrentUser() user: RequestUser) {
    return this.contractsService.findAll(user.organizationId);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.TENANT)
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @GetCurrentUser() user: RequestUser,
  ) {
    return this.contractsService.findOne(id, user.organizationId);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateContractDto: UpdateContractDto,
    @GetCurrentUser() user: RequestUser,
  ) {
    return this.contractsService.update(id, user.organizationId, updateContractDto);
  }

  @Patch(':id/terminate')
  @Roles(UserRole.ADMIN)
  terminate(
    @Param('id', ParseIntPipe) id: number,
    @GetCurrentUser() user: RequestUser,
  ) {
    return this.contractsService.terminate(id, user.organizationId);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  remove(
    @Param('id', ParseIntPipe) id: number,
    @GetCurrentUser() user: RequestUser,
  ) {
    return this.contractsService.remove(id, user.organizationId);
  }
}
