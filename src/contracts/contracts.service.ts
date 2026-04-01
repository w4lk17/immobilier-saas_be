import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import {
  Contract,
  ContractStatus,
  InvoiceType,
  PropertyStatus,
  RentalStatus,
  UserRole,
} from '@prisma/client';
import { JwtPayload } from '../auth/types';

function makeInvoiceNumber(prefix = 'INV'): string {
  const ymd = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const rand = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, '0');
  return `${prefix}-${ymd}-${Date.now()}-${rand}`;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function setDayOfMonth(date: Date, day: number): Date {
  const d = new Date(date);
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const safeDay = Math.min(Math.max(day, 1), daysInMonth);
  d.setDate(safeDay);
  return d;
}

function computeFirstRentDueDate(
  startDate: Date,
  paymentStartAfterMonths: number,
  dayOfMonth: number,
): Date {
  const base = addMonths(startDate, paymentStartAfterMonths);
  return setDayOfMonth(base, dayOfMonth);
}

@Injectable()
export class ContractsService {
  constructor(private prisma: PrismaService) { }

  async create(
    createContractDto: CreateContractDto,
    user: JwtPayload,
  ): Promise<Contract> {
    // RBAC Check: Only ADMIN and MANAGER can create contracts
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.MANAGER) {
      throw new ForbiddenException(
        'Only administrators and property managers can create contracts.',
      );
    }

    // 1. Validate Existence of Related Entities
    //Validate Owner exists
    const owner = await this.prisma.owner.findUnique({
      where: { id: createContractDto.ownerId },
    });
    if (!owner)
      throw new NotFoundException(
        `Owner with ID ${createContractDto.ownerId} not found.`,
      );
    // Validate Property exists and belongs to the owner
    const property = await this.prisma.property.findUnique({
      where: { id: createContractDto.propertyId },
      include: { owner: true },
    });
    if (!property)
      throw new NotFoundException(
        `Property with ID ${createContractDto.propertyId} not found.`)

    // Ensure property belongs to the specified owner
    if (property.ownerId !== createContractDto.ownerId) {
      throw new ConflictException(
        `Property ${createContractDto.propertyId} does not belong to owner ${createContractDto.ownerId}.`,
      );
    }

    // Validate Rental exists and belongs to the property
    const rental = await this.prisma.rental.findUnique({
      where: { id: createContractDto.rentalId },
      include: { property: true },
    });
    if (!rental)
      throw new NotFoundException(
        `Rental with ID ${createContractDto.rentalId} not found.`,
      );

    // Ensure rental belongs to the specified property
    if (rental.propertyId !== createContractDto.propertyId) {
      throw new ConflictException(
        `Rental ${createContractDto.rentalId} does not belong to property ${createContractDto.propertyId}.`,
      );
    }

    // For MANAGER role, ensure they are assigned to manage this rental's property
    if (user.role === UserRole.MANAGER) {
      const employeeProfile = await this.prisma.employee.findUnique({
        where: { userId: user.sub },
      });

      if (!employeeProfile || rental.property.managerId !== employeeProfile.id) {
        throw new ForbiddenException(
          `You are not authorized to manage contracts for this rental.`,
        );
      }
    }

    // Check if rental is available
    if (rental.status !== RentalStatus.AVAILABLE) {
      throw new ConflictException(
        `Rental with ID ${createContractDto.rentalId} is not currently available (${rental.status}).`,
      );
    }

    // Validate Tenant exists
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: createContractDto.tenantId },
    });
    if (!tenant)
      throw new NotFoundException(
        `Tenant with ID ${createContractDto.tenantId} not found.`,
      );

    // Validate Manager exists
    const manager = await this.prisma.employee.findUnique({
      where: { id: createContractDto.managerId },
    });
    if (!manager)
      throw new NotFoundException(
        `Manager (Employee) with ID ${createContractDto.managerId} not found.`,
      );

    // 2. Business Logic Validation
    // Check if tenant already has an active contract for this rental
    const existingContract = await this.prisma.contract.findFirst({
      where: {
        rentalId: createContractDto.rentalId,
        tenantId: createContractDto.tenantId,
        status: { in: ['PENDING', 'ACTIVE'] },
      },
    });

    if (existingContract) {
      throw new ConflictException(
        `Tenant already has an active contract for this rental.`,
      );
    }

    try {
      const contractWithInvoices = await this.prisma.$transaction(async (tx) => {
        const created = await tx.contract.create({
          data: createContractDto,
        });

        // Update rental status to OCCUPIED
        await tx.rental.update({
          where: { id: createContractDto.rentalId },
          data: { status: RentalStatus.OCCUPIED },
        });

        // Create initial invoices:
        // - Deposit invoice due at start date
        // - First rent invoice due after paymentStartAfter logic
        const startDate = new Date(createContractDto.startDate);
        const depositDueDate = startDate;
        const firstRentDueDate = computeFirstRentDueDate(
          startDate,
          createContractDto.paymentStartAfter,
          createContractDto.dayAddToPaymentDay,
        );

        await tx.invoice.createMany({
          data: [
            {
              invoiceNumber: makeInvoiceNumber('DEP'),
              contractId: created.id,
              tenantId: created.tenantId,
              amountDue: created.depositAmount,
              paidAmount: 0,
              type: InvoiceType.DEPOSIT,
              dueDate: depositDueDate,
            },
            {
              invoiceNumber: makeInvoiceNumber('RENT'),
              contractId: created.id,
              tenantId: created.tenantId,
              amountDue: created.rentAmount + rental.charges,
              paidAmount: 0,
              type: InvoiceType.RENT,
              dueDate: firstRentDueDate,
            },
          ],
        });

        return tx.contract.findUnique({
          where: { id: created.id },
          include: {
            owner: {
              include: {
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                  },
                },
              },
            },
            property: {
              include: {
                owner: {
                  include: {
                    user: {
                      select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                      },
                    },
                  },
                },
              },
            },
            rental: {
              include: {
                property: {
                  include: {
                    owner: {
                      include: {
                        user: {
                          select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            email: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            tenant: {
              include: {
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                  },
                },
              },
            },
            manager: {
              include: {
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                  },
                },
              },
            },
            invoices: {
              orderBy: { dueDate: 'desc' },
              include: { transactions: true },
            },
            _count: {
              select: { invoices: true },
            },
          },
        });
      });

      if (!contractWithInvoices) {
        throw new InternalServerErrorException('Could not create contract.');
      }

      return contractWithInvoices;
    } catch (error) {
      console.error('Error creating contract:', error);
      throw new InternalServerErrorException('Could not create contract.');
    }
  }

  async findAll(user?: JwtPayload): Promise<Contract[]> {
    if (user) {
      return this.findAllFiltered(user);
    }

    // Public access - return all contracts
    return this.prisma.contract.findMany({
      include: {
        owner: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
        },
        property: true,
        rental: {
          include: {
            property: true,
          },
        },
        tenant: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
        },
        manager: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
        },
        invoices: true,
        _count: {
          select: { invoices: true },
        },
      },
    });
  }

  private async findAllFiltered(user: JwtPayload): Promise<Contract[]> {
    const ownerProfile =
      user.role === UserRole.OWNER
        ? await this.prisma.owner.findUnique({ where: { userId: user.sub } })
        : null;
    const employeeProfile =
      user.role === UserRole.MANAGER
        ? await this.prisma.employee.findUnique({ where: { userId: user.sub } })
        : null;
    const tenantProfile =
      user.role === UserRole.TENANT
        ? await this.prisma.tenant.findUnique({ where: { userId: user.sub } })
        : null;

    const whereClause: any = {};

    if (user.role === UserRole.OWNER && ownerProfile) {
      // Owners see contracts for their properties
      whereClause.ownerId = ownerProfile.id;
    } else if (user.role === UserRole.MANAGER && employeeProfile) {
      // Managers see contracts for properties they manage
      whereClause.property = { managerId: employeeProfile.id };
    } else if (user.role === UserRole.TENANT && tenantProfile) {
      // Tenants see only their own contracts
      whereClause.tenantId = tenantProfile.id;
    }
    // ADMIN sees all

    return this.prisma.contract.findMany({
      where: whereClause,
      include: {
        owner: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
        },
        property: true,
        rental: {
          include: {
            property: true,
          },
        },
        tenant: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
        },
        manager: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
        },
        invoices: true,
        _count: {
          select: { invoices: true },
        },
      },
    });
  }

  async findOne(id: number, user?: JwtPayload): Promise<Contract> {
    const contract = await this.prisma.contract.findUnique({
      where: { id },
      include: {
        owner: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
        },
        property: true,
        rental: {
          include: {
            property: true,
          },
        },
        tenant: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
        },
        manager: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
        },
        invoices: {
          orderBy: { dueDate: 'desc' },
          include: { transactions: true },
        },
        _count: {
          select: { invoices: true },
        },
      },
    });

    if (!contract) {
      throw new NotFoundException(`Contract with ID ${id} not found.`);
    }

    // Check permissions if user is provided
    if (user) {
      await this.checkContractPermission(contract, user);
    }

    return contract;
  }

  async update(
    id: number,
    updateContractDto: UpdateContractDto,
    user: JwtPayload,
  ): Promise<Contract> {
    // RBAC Check: Only ADMIN and MANAGER can update contracts
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.MANAGER) {
      throw new ForbiddenException(
        'Only administrators and property managers can update contracts.',
      );
    }

    // First check if contract exists and user has permission
    const contract = await this.findOne(id, user);

    // For MANAGER role, ensure they manage this contract's property
    if (user.role === UserRole.MANAGER) {
      const employeeProfile = await this.prisma.employee.findUnique({
        where: { userId: user.sub },
      });

      if (!employeeProfile || (contract as any).property.managerId !== employeeProfile.id) {
        throw new ForbiddenException(
          `You are not authorized to manage this contract.`,
        );
      }
    }

    // Additional validation for status changes
    if (updateContractDto.status === ContractStatus.TERMINATED ||
      updateContractDto.status === ContractStatus.EXPIRED) {
      // Update rental status back to AVAILABLE when contract ends
      await this.prisma.rental.update({
        where: { id: contract.rentalId },
        data: { status: RentalStatus.AVAILABLE },
      });
    }

    // Note: Relationship fields (ownerId, propertyId, rentalId, tenantId, managerId)
    // are not allowed to be updated via this endpoint as per UpdateContractDto design
    try {
      return await this.prisma.contract.update({
        where: { id },
        data: updateContractDto,
        include: {
          owner: {
            include: {
              user: {
                select: { id: true, firstName: true, lastName: true, email: true },
              },
            },
          },
          property: true,
          rental: {
            include: {
              property: true,
            },
          },
          tenant: {
            include: {
              user: {
                select: { id: true, firstName: true, lastName: true, email: true },
              },
            },
          },
          manager: {
            include: {
              user: {
                select: { id: true, firstName: true, lastName: true, email: true },
              },
            },
          },
          invoices: true,
        },
      });
    } catch (error) {
      console.error('Error updating contract:', error);
      throw new InternalServerErrorException('Could not update contract.');
    }
  }

  async terminate(id: number, user: JwtPayload): Promise<Contract> {
    // RBAC Check: Only ADMIN and MANAGER can terminate contracts
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.MANAGER) {
      throw new ForbiddenException(
        'Only administrators and property managers can terminate contracts.',
      );
    }

    // Find the contract with necessary relations
    const contract = await this.prisma.contract.findUnique({
      where: { id },
      include: {
        rental: true,
        property: true,
        manager: true,
      },
    });

    if (!contract) {
      throw new NotFoundException(`Contract with ID ${id} not found.`);
    }

    // For MANAGER role, ensure they manage this contract's property
    if (user.role === UserRole.MANAGER) {
      const employeeProfile = await this.prisma.employee.findUnique({
        where: { userId: user.sub },
      });

      if (!employeeProfile || (contract as any).property.managerId !== employeeProfile.id) {
        throw new ForbiddenException(
          `You are not authorized to terminate this contract.`,
        );
      }
    }

    // Check if contract is already terminated or expired
    if (contract.status === ContractStatus.TERMINATED) {
      throw new ConflictException('Contract is already terminated.');
    }

    if (contract.status === ContractStatus.EXPIRED) {
      throw new ConflictException('Cannot terminate an expired contract.');
    }

    try {
      // Update contract status to TERMINATED and set end date to now
      const terminatedContract = await this.prisma.contract.update({
        where: { id },
        data: {
          status: ContractStatus.TERMINATED,
          endDate: new Date(), // Set termination date
        },
        include: {
          owner: {
            include: {
              user: {
                select: { id: true, firstName: true, lastName: true, email: true },
              },
            },
          },
          property: true,
          rental: {
            include: {
              property: true,
            },
          },
          tenant: {
            include: {
              user: {
                select: { id: true, firstName: true, lastName: true, email: true },
              },
            },
          },
          manager: {
            include: {
              user: {
                select: { id: true, firstName: true, lastName: true, email: true },
              },
            },
          },
          invoices: {
            orderBy: { dueDate: 'desc' },
            include: { transactions: true },
          },
        },
      });

      // Update rental status back to AVAILABLE (unless it was BOOKED)
      if (contract.rental.status === RentalStatus.OCCUPIED) {
        await this.prisma.rental.update({
          where: { id: contract.rentalId },
          data: { status: RentalStatus.AVAILABLE },
        });
      }

      return terminatedContract;
    } catch (error) {
      console.error('Error terminating contract:', error);
      throw new InternalServerErrorException('Could not terminate contract.');
    }
  }

  async remove(id: number, user: JwtPayload): Promise<Contract> {
    // RBAC Check: Only ADMIN can delete contracts
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException(
        'Only administrators can delete contracts.',
      );
    }

    // First check if contract exists
    const contract = await this.findOne(id, user);

    // If any payment transaction exists for this contract's invoices, block deletion (audit integrity)
    const txCount = await this.prisma.paymentTransaction.count({
      where: { invoice: { contractId: id } },
    });
    if (txCount > 0) {
      throw new ForbiddenException(
        'Cannot delete contract with existing payment transactions.',
      );
    }

    try {
      // Delete invoices first (FK constraint), then the contract
      await this.prisma.$transaction(async (tx) => {
        await tx.invoice.deleteMany({ where: { contractId: id } });

        await tx.contract.delete({ where: { id } });

        // Update rental status back to AVAILABLE
        await tx.rental.update({
          where: { id: contract.rentalId },
          data: { status: RentalStatus.AVAILABLE },
        });
      });

      // Return the previously-loaded contract snapshot
      return contract;
    } catch (error) {
      console.error('Error deleting contract:', error);
      throw new InternalServerErrorException('Could not delete contract.');
    }
  }

  // Helper method to check contract permissions
  private async checkContractPermission(contract: any, user: JwtPayload): Promise<void> {
    const ownerProfile =
      user.role === UserRole.OWNER
        ? await this.prisma.owner.findUnique({ where: { userId: user.sub } })
        : null;
    const employeeProfile =
      user.role === UserRole.MANAGER
        ? await this.prisma.employee.findUnique({ where: { userId: user.sub } })
        : null;
    const tenantProfile =
      user.role === UserRole.TENANT
        ? await this.prisma.tenant.findUnique({ where: { userId: user.sub } })
        : null;

    const isOwnerOfContract =
      ownerProfile && contract.ownerId === ownerProfile.id;
    const isManagerOfProperty =
      employeeProfile && contract.property.managerId === employeeProfile.id;
    const isTenantOfContract =
      tenantProfile && contract.tenantId === tenantProfile.id;

    if (
      user.role === UserRole.ADMIN ||
      isOwnerOfContract ||
      isManagerOfProperty ||
      isTenantOfContract
    ) {
      return; // Has permission
    }

    throw new ForbiddenException('You do not have permission to access this contract.');
  }
}
