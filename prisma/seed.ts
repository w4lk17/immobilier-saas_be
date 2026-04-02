// prisma/seed.ts

import {
  PrismaClient,
  UserRole,
  PropertyType,
  PropertyStatus,
  RentalType,
  RentalStatus,
  ContractStatus,
  InvoiceType,
  InvoiceStatus,
  PaymentProvider,
  PaymentTransactionStatus,
  ExpenseType,
  ExpenseStatus,
  EmploymentType,
  LeaseType,
} from '@prisma/client';
import { faker } from '@faker-js/faker/locale/fr';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const DEFAULT_PASSWORD = 'password123';

function makeInvoiceNumber(prefix = 'INV'): string {
  const ymd = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const rand = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, '0');
  return `${prefix}-${ymd}-${Date.now()}-${rand}`;
}

// Helper pour générer des données utilisateur complètes
function generateFullUserData(role: UserRole, email: string, password: string) {
  return {
    email,
    password,
    role,
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    phoneNumber: faker.phone.number(),
    civility: faker.helpers.arrayElement(['M.', 'Mme']),
    dateOfBirth: faker.date.birthdate({ min: 18, max: 65, mode: 'age' }),
    address: faker.location.streetAddress(true),
    pictureUrl: faker.image.avatar(),
    workPlace: faker.company.name(),
    occupation: faker.person.jobTitle(),
    identityDocumentNumber: faker.string.alphanumeric(10).toUpperCase(),
    identityDocumentType: faker.helpers.arrayElement(['CIN', 'PASSPORT', 'RESIDENCE_PERMIT']),
    identityDeliveryCity: faker.location.city(),
    identityDeliveryDate: faker.date.past({ years: 10 }),
    identityExpiryDate: faker.date.future({ years: 5 }),
    pacLastName: faker.person.lastName(),
    pacFirstName: faker.person.firstName(),
    pacPhoneNumber: faker.phone.number(),
    isActive: true,
  };
}

async function main() {
  console.log(`Début du seeding complet...`);

  // 1. Nettoyer la base de données
  console.log('Nettoyage des données existantes...');
  await prisma.expense.deleteMany({});
  await prisma.paymentTransaction.deleteMany({});
  await prisma.invoice.deleteMany({});
  await prisma.contract.deleteMany({});
  await prisma.rental.deleteMany({});
  await prisma.property.deleteMany({});
  await prisma.manager.deleteMany({});
  await prisma.owner.deleteMany({});
  await prisma.tenant.deleteMany({});
  await prisma.user.deleteMany({});
  console.log('Nettoyage terminé.');

  // 2. Hasher le mot de passe
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, salt);

  // 3. Créer les Utilisateurs (Avec TOUS les champs remplis)
  console.log('Création des utilisateurs complets...');

  const adminUser = await prisma.user.create({
    data: {
      ...generateFullUserData(UserRole.ADMIN, 'admin@example.com', hashedPassword),
      firstName: 'Admin', lastName: 'User', // Override pour clarté
    },
  });

  const employeeUser1 = await prisma.user.create({
    data: generateFullUserData(UserRole.MANAGER, 'manager1@example.com', hashedPassword),
  });

  const employeeUser2 = await prisma.user.create({
    data: generateFullUserData(UserRole.MANAGER, 'manager2@example.com', hashedPassword),
  });

  const ownerUser1 = await prisma.user.create({
    data: generateFullUserData(UserRole.OWNER, 'owner1@example.com', hashedPassword),
  });

  const ownerUser2 = await prisma.user.create({
    data: generateFullUserData(UserRole.OWNER, 'owner2@example.com', hashedPassword),
  });

  const tenantUser1 = await prisma.user.create({
    data: generateFullUserData(UserRole.TENANT, 'tenant1@example.com', hashedPassword),
  });

  const tenantUser2 = await prisma.user.create({
    data: generateFullUserData(UserRole.TENANT, 'tenant2@example.com', hashedPassword),
  });

  const simpleUser = await prisma.user.create({
    data: generateFullUserData(UserRole.USER, 'user@example.com', hashedPassword),
  });

  console.log('Utilisateurs créés avec données complètes.');

  // 4. Créer les profils
  console.log('Création des profils...');

  const manager1 = await prisma.manager.create({
    data: {
      userId: employeeUser1.id,
      position: 'Gestionnaire Principal',
      employmentType: EmploymentType.CDI,
      hireDate: faker.date.past({ years: 2 }),
      terminationDate: null,
    },
  });

  const manager2 = await prisma.manager.create({
    data: {
      userId: employeeUser2.id,
      position: 'Assistant Gestionnaire',
      employmentType: EmploymentType.CDD,
      hireDate: faker.date.past({ years: 1 }),
    },
  });

  const owner1 = await prisma.owner.create({
    data: { userId: ownerUser1.id },
  });

  const owner2 = await prisma.owner.create({
    data: { userId: ownerUser2.id },
  });

  const tenant1 = await prisma.tenant.create({
    data: {
      userId: tenantUser1.id,
      oldAddress: faker.location.streetAddress(true)
    },
  });

  const tenant2 = await prisma.tenant.create({
    data: {
      userId: tenantUser2.id,
      oldAddress: faker.location.streetAddress(true)
    },
  });

  // 5. Créer les Propriétés
  console.log('Création des propriétés...');
  const property1 = await prisma.property.create({
    data: {
      ownerId: owner1.id,
      managerId: manager1.id,
      address: faker.location.streetAddress(true),
      type: PropertyType.BUILDING,
      description: faker.lorem.paragraphs(2),
      propertyValue: parseFloat(faker.finance.amount({ min: 200000, max: 500000, dec: 2 })),
      status: PropertyStatus.AVAILABLE,
    },
  });

  const property2 = await prisma.property.create({
    data: {
      ownerId: owner1.id,
      managerId: manager1.id,
      address: faker.location.streetAddress(true),
      type: PropertyType.LOW_HOUSE,
      description: faker.lorem.paragraphs(2),
      propertyValue: parseFloat(faker.finance.amount({ min: 300000, max: 800000, dec: 2 })),
      status: PropertyStatus.AVAILABLE,
    },
  });

  const property3 = await prisma.property.create({
    data: {
      ownerId: owner2.id,
      managerId: manager2.id,
      address: faker.location.streetAddress(true),
      type: PropertyType.LOW_HOUSE,
      description: faker.lorem.paragraphs(2),
      propertyValue: parseFloat(faker.finance.amount({ min: 500000, max: 1500000, dec: 2 })),
      status: PropertyStatus.AVAILABLE,
    },
  });

  const property4 = await prisma.property.create({
    data: {
      ownerId: owner2.id,
      managerId: null,
      address: faker.location.streetAddress(true),
      type: PropertyType.DUPLEX,
      description: faker.lorem.paragraphs(2),
      propertyValue: parseFloat(faker.finance.amount({ min: 150000, max: 400000, dec: 2 })),
      status: PropertyStatus.MAINTENANCE,
    },
  });

  // 6. Créer les Locations (Rentals)
  console.log('Création des locations...');

  const rental1 = await prisma.rental.create({
    data: {
      propertyId: property1.id,
      name: 'Appartement 1A',
      type: RentalType.APARTMENT,
      status: RentalStatus.AVAILABLE,
      roomCount: 2,
      rentalValue: 850.00,
      charges: 50.00,
    },
  });

  const rental2 = await prisma.rental.create({
    data: {
      propertyId: property1.id,
      name: 'Appartement 1B',
      type: RentalType.APARTMENT,
      status: RentalStatus.AVAILABLE,
      roomCount: 3,
      rentalValue: 1100.00,
      charges: 80.00,
    },
  });

  const rental3 = await prisma.rental.create({
    data: {
      propertyId: property2.id,
      name: 'Villa entière',
      type: RentalType.VILLA,
      status: RentalStatus.AVAILABLE,
      roomCount: 4,
      rentalValue: 1800.00,
      charges: 120.00,
    },
  });

  const rental4 = await prisma.rental.create({
    data: {
      propertyId: property3.id,
      name: 'Local Commercial',
      type: RentalType.STORE,
      status: RentalStatus.AVAILABLE,
      roomCount: 1,
      rentalValue: 2500.00,
      charges: 250.00,
    },
  });

  // 7. Créer les Contrats
  console.log('Création des contrats...');

  const contract1 = await prisma.contract.create({
    data: {
      ownerId: owner1.id,
      propertyId: property1.id,
      rentalId: rental1.id,
      tenantId: tenant1.id,
      managerId: manager1.id,
      startDate: faker.date.past({ years: 1 }),
      endDate: faker.date.future({ years: 1 }),
      rentAmount: 850.00,
      rentDeposit: 1, // 1 mois
      rentAdvance: 1, // 1 mois
      depositAmount: 1700.00, // 850 * 2
      dayAddToPaymentDay: 5,
      paymentStartAfter: 1,
      leaseType: LeaseType.RESIDENTIAL_LEASE,
      status: ContractStatus.ACTIVE,
    },
  });

  // Update rental status
  await prisma.rental.update({
    where: { id: rental1.id },
    data: { status: RentalStatus.OCCUPIED },
  });

  const pastEndDate = faker.date.past({ years: 0.5 });
  const pastStartDate = new Date(pastEndDate.getTime() - 365 * 24 * 60 * 60 * 1000);

  const contract2 = await prisma.contract.create({
    data: {
      ownerId: owner1.id,
      propertyId: property2.id,
      rentalId: rental3.id,
      tenantId: tenant2.id,
      managerId: manager1.id,
      startDate: pastStartDate,
      endDate: pastEndDate,
      rentAmount: 1800.00,
      rentDeposit: 2,
      rentAdvance: 1,
      depositAmount: 5400.00,
      dayAddToPaymentDay: 10,
      paymentStartAfter: 0,
      leaseType: LeaseType.RESIDENTIAL_LEASE,
      status: ContractStatus.TERMINATED,
    },
  });

  // 8. Créer les Factures (Invoices)
  console.log('Création des factures...');

  await prisma.invoice.createMany({
    data: [
      {
        invoiceNumber: makeInvoiceNumber('DEP'),
        contractId: contract1.id,
        tenantId: contract1.tenantId,
        amountDue: 1700.00,
        paidAmount: 1700.00,
        type: InvoiceType.DEPOSIT,
        status: InvoiceStatus.PAID,
        dueDate: contract1.startDate,
        paidDate: contract1.startDate,
      },
      {
        invoiceNumber: makeInvoiceNumber('RENT'),
        contractId: contract1.id,
        tenantId: contract1.tenantId,
        amountDue: 900.00, // Loyer + charges
        paidAmount: 900.00,
        type: InvoiceType.RENT,
        status: InvoiceStatus.PAID,
        dueDate: faker.date.recent({ days: 60 }),
        paidDate: faker.date.recent({ days: 55 }),
      },
      {
        invoiceNumber: makeInvoiceNumber('RENT'),
        contractId: contract1.id,
        tenantId: contract1.tenantId,
        amountDue: 900.00,
        paidAmount: 0,
        type: InvoiceType.RENT,
        status: InvoiceStatus.PENDING,
        dueDate: faker.date.soon({ days: 5 }),
      },
      {
        invoiceNumber: makeInvoiceNumber('PEN'),
        contractId: contract1.id,
        tenantId: contract1.tenantId,
        amountDue: 50.00,
        paidAmount: 0,
        type: InvoiceType.PENALTY,
        status: InvoiceStatus.OVERDUE,
        dueDate: faker.date.recent({ days: 10 }),
      },
    ],
  });

  // Transactions de paiement
  const paidInvoices = await prisma.invoice.findMany({
    where: { status: InvoiceStatus.PAID },
    select: { id: true, amountDue: true },
  });

  if (paidInvoices.length > 0) {
    await prisma.paymentTransaction.createMany({
      data: paidInvoices.map((inv) => ({
        invoiceId: inv.id,
        provider: faker.helpers.arrayElement([PaymentProvider.STRIPE, PaymentProvider.MOBILE_MONEY]),
        providerRef: `pi_${faker.string.alphanumeric(24)}`,
        amount: inv.amountDue,
        status: PaymentTransactionStatus.SUCCESS,
        rawPayload: { seeded: true, method: 'card' },
      })),
      skipDuplicates: true,
    });
  }

  // 9. Créer les Dépenses
  console.log('Création des dépenses...');

  await prisma.expense.createMany({
    data: [
      {
        propertyId: property1.id,
        rentalId: rental1.id,
        recordedById: employeeUser1.id,
        amount: 250.00,
        description: 'Réparation fuite robinet cuisine',
        date: faker.date.recent({ days: 20 }),
        type: ExpenseType.REPAIR,
        status: ExpenseStatus.PAID,
      },
      {
        propertyId: property3.id,
        rentalId: rental4.id,
        recordedById: employeeUser2.id,
        amount: 1200.00,
        description: 'Taxe foncière annuelle',
        date: faker.date.past({ years: 0.5 }),
        type: ExpenseType.TAX,
        status: ExpenseStatus.PAID,
      },
      {
        propertyId: property4.id,
        recordedById: adminUser.id,
        amount: 500.00,
        description: 'Réparation ascenseur (copropriété)',
        date: faker.date.recent({ days: 5 }),
        type: ExpenseType.MAINTENANCE,
        status: ExpenseStatus.PENDING,
      },
      {
        propertyId: property2.id,
        recordedById: employeeUser1.id,
        amount: 300.00,
        description: 'Assurance propriétaire non occupant',
        date: faker.date.recent({ days: 40 }),
        type: ExpenseType.INSURANCE,
        status: ExpenseStatus.PAID,
      },
    ],
  });

  console.log(`Seeding terminé avec succès !`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('Erreur durant le seeding:', e);
    await prisma.$disconnect();
    process.exit(1);
  });

// npx prisma db seed