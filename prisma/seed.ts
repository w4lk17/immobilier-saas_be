// prisma/seed.ts

import {
	PrismaClient,
	UserRole,
	PropertyType,
	PropertyStatus,
	ContractStatus,
	PaymentType,
	PaymentStatus,
	ExpenseType,
	ExpenseStatus,
} from '@prisma/client';
import { faker } from '@faker-js/faker/locale/fr'; // Utiliser la locale FR pour des données plus adaptées
import * as bcrypt from 'bcryptjs';

// Initialiser Prisma Client
const prisma = new PrismaClient();

// Mot de passe commun pour tous les utilisateurs créés (sera hashé)
const DEFAULT_PASSWORD = 'password123';

async function main() {
	console.log(`Début du seeding...`);

	// 1. Nettoyer la base de données (Optionnel mais recommandé pour l'idempotence)
	// Supprimer dans l'ordre inverse des dépendances pour éviter les erreurs FK
	console.log('Nettoyage des données existantes...');
	await prisma.payment.deleteMany({});
	await prisma.expense.deleteMany({});
	await prisma.contract.deleteMany({});
	await prisma.property.deleteMany({});
	await prisma.employee.deleteMany({});
	await prisma.owner.deleteMany({});
	await prisma.tenant.deleteMany({});
	await prisma.user.deleteMany({});
	console.log('Nettoyage terminé.');

	// 2. Hasher le mot de passe par défaut
	const salt = await bcrypt.genSalt(10);
	const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, salt);
	console.log(`Mot de passe par défaut hashé: ${DEFAULT_PASSWORD}`);

	// 3. Créer les Utilisateurs avec différents rôles
	console.log('Création des utilisateurs...');
	const adminUser = await prisma.user.create({
		data: {
			email: 'admin@example.com',
			password: hashedPassword,
			role: UserRole.ADMIN,
			firstName: 'Admin',
			lastName: 'User',
		},
	});

	const employeeUser1 = await prisma.user.create({
		data: {
			email: 'manager1@example.com',
			password: hashedPassword,
			role: UserRole.EMPLOYEE, // Sera mis à jour lors de la création du profil Employee
			firstName: faker.person.firstName(),
			lastName: faker.person.lastName(),
		},
	});

	const employeeUser2 = await prisma.user.create({
		data: {
			email: 'manager2@example.com',
			password: hashedPassword,
			role: UserRole.EMPLOYEE,
			firstName: faker.person.firstName(),
			lastName: faker.person.lastName(),
		},
	});

	const ownerUser1 = await prisma.user.create({
		data: {
			email: 'owner1@example.com',
			password: hashedPassword,
			role: UserRole.OWNER, // Sera mis à jour
			firstName: faker.person.firstName(),
			lastName: faker.person.lastName(),
		},
	});

	const ownerUser2 = await prisma.user.create({
		data: {
			email: 'owner2@example.com',
			password: hashedPassword,
			role: UserRole.OWNER,
			firstName: faker.person.firstName(),
			lastName: faker.person.lastName(),
		},
	});

	const tenantUser1 = await prisma.user.create({
		data: {
			email: 'tenant1@example.com',
			password: hashedPassword,
			role: UserRole.TENANT, // Sera mis à jour
			firstName: faker.person.firstName(),
			lastName: faker.person.lastName(),
		},
	});

	const tenantUser2 = await prisma.user.create({
		data: {
			email: 'tenant2@example.com',
			password: hashedPassword,
			role: UserRole.TENANT,
			firstName: faker.person.firstName(),
			lastName: faker.person.lastName(),
		},
	});

	const basicUser = await prisma.user.create({
		data: {
			email: 'basicuser@example.com',
			password: hashedPassword,
			role: UserRole.USER,
			firstName: faker.person.firstName(),
			lastName: faker.person.lastName(),
		},
	});

	console.log('Utilisateurs créés:', { adminUser, employeeUser1, employeeUser2, ownerUser1, ownerUser2, tenantUser1, tenantUser2, basicUser });

	// 4. Créer les profils Employés, Propriétaires, Locataires
	console.log('Création des profils...');

	const employee1 = await prisma.employee.create({
		data: {
			userId: employeeUser1.id,
			position: 'Gestionnaire Principal',
			phoneNumber: faker.phone.number(),
		},
	});

	// Met à jour le rôle User
	await prisma.user.update({
		where: { id: employeeUser1.id },
		data: { role: UserRole.EMPLOYEE }
	});

	const employee2 = await prisma.employee.create({
		data: {
			userId: employeeUser2.id,
			position: 'Assistant Gestionnaire',
			phoneNumber: faker.phone.number(),
		},
	});

	// Met à jour le rôle User
	await prisma.user.update({
		where: { id: employeeUser2.id },
		data: { role: UserRole.EMPLOYEE }
	});

	const owner1 = await prisma.owner.create({
		data: {
			userId: ownerUser1.id,
			phoneNumber: faker.phone.number(),
		},
	});

	await prisma.user.update({
		where: { id: ownerUser1.id },
		data: { role: UserRole.OWNER }
	});

	const owner2 = await prisma.owner.create({
		data: {
			userId: ownerUser2.id,
			phoneNumber: faker.phone.number(),
		},
	});

	await prisma.user.update({
		where: { id: ownerUser2.id },
		data: { role: UserRole.OWNER }
	});

	const tenant1 = await prisma.tenant.create({
		data: {
			userId: tenantUser1.id,
			phoneNumber: faker.phone.number(),
		},
	});

	await prisma.user.update({
		where: { id: tenantUser1.id },
		data: { role: UserRole.TENANT }
	});

	const tenant2 = await prisma.tenant.create({
		data: {
			userId: tenantUser2.id,
			phoneNumber: faker.phone.number(),
		},
	});

	await prisma.user.update({
		where: { id: tenantUser2.id },
		data: { role: UserRole.TENANT }
	});

	console.log('Profils créés:', { employee1, employee2, owner1, owner2, tenant1, tenant2 });


	// 5. Créer les Propriétés
	console.log('Création des propriétés...');
	const property1 = await prisma.property.create({
		data: {
			ownerId: owner1.id,
			managerId: employee1.id, // Géré par employee1
			address: faker.location.streetAddress(true),
			type: PropertyType.APARTMENT,
			description: faker.lorem.paragraph(),
			rentAmount: parseFloat(faker.finance.amount({ min: 800, max: 2500, dec: 2 })),
			charges: parseFloat(faker.finance.amount({ min: 50, max: 200, dec: 2 })),
			status: PropertyStatus.AVAILABLE,
		},
	});

	const property2 = await prisma.property.create({
		data: {
			ownerId: owner1.id,
			managerId: employee1.id, // Géré par employee1
			address: faker.location.streetAddress(true),
			type: PropertyType.HOUSE,
			description: faker.lorem.paragraph(),
			rentAmount: parseFloat(faker.finance.amount({ min: 1500, max: 4000, dec: 2 })),
			charges: parseFloat(faker.finance.amount({ min: 100, max: 300, dec: 2 })),
			status: PropertyStatus.AVAILABLE,
		},
	});

	const property3 = await prisma.property.create({
		data: {
			ownerId: owner2.id,
			managerId: employee2.id, // Géré par employee2
			address: faker.location.streetAddress(true),
			type: PropertyType.COMMERCIAL,
			description: faker.lorem.paragraph(),
			rentAmount: parseFloat(faker.finance.amount({ min: 2000, max: 6000, dec: 2 })),
			charges: parseFloat(faker.finance.amount({ min: 200, max: 500, dec: 2 })),
			status: PropertyStatus.RENTED, // Déjà loué (pour l'exemple)
		},
	});

	const property4 = await prisma.property.create({
		data: {
			ownerId: owner2.id,
			// Pas de manager assigné
			address: faker.location.streetAddress(true),
			type: PropertyType.APARTMENT,
			description: faker.lorem.paragraph(),
			rentAmount: parseFloat(faker.finance.amount({ min: 700, max: 2000, dec: 2 })),
			charges: parseFloat(faker.finance.amount({ min: 40, max: 150, dec: 2 })),
			status: PropertyStatus.MAINTENANCE,
		},
	});
	console.log('Propriétés créées:', { property1, property2, property3, property4 });


	// 6. Créer les Contrats
	console.log('Création des contrats...');
	// Contrat Actif pour property1 / tenant1 / employee1
	const contract1 = await prisma.contract.create({
		data: {
			propertyId: property1.id,
			tenantId: tenant1.id,
			managerId: employee1.id,
			startDate: faker.date.past({ years: 1 }),
			// endDate: null (contrat actif)
			rentAmount: property1.rentAmount, // Utiliser le loyer de la propriété
			depositAmount: property1.rentAmount * 1.5, // Exemple de caution
			status: ContractStatus.ACTIVE,
		},
	});
	// Mettre à jour le statut de la propriété liée
	await prisma.property.update({
		where: { id: property1.id },
		data: { status: PropertyStatus.RENTED },
	});


	// Contrat Expiré pour property2 / tenant2 / employee1
	const pastEndDate = faker.date.past({ years: 0.5 });
	const pastStartDate = new Date(pastEndDate.getTime() - (365 * 24 * 60 * 60 * 1000)); // Approx 1 an avant
	const contract2 = await prisma.contract.create({
		data: {
			propertyId: property2.id, // Propriété qui était dispo
			tenantId: tenant2.id,
			managerId: employee1.id,
			startDate: pastStartDate,
			endDate: pastEndDate, // Contrat terminé
			rentAmount: property2.rentAmount,
			depositAmount: property2.rentAmount,
			status: ContractStatus.EXPIRED,
			// Laisser property2 comme AVAILABLE car le contrat est fini
		},
	});

	// Contrat pour la propriété déjà louée (property3) - doit être créé avant la propriété ou le statut mis à jour
	// Ici on simule qu'il existe déjà (on ne le crée pas car property3.status = RENTED)
	// Pour un vrai seed, il faudrait créer ce contrat AVANT de définir property3 comme RENTED.

	console.log('Contrats créés:', { contract1, contract2 });


	// 7. Créer les Paiements
	console.log('Création des paiements...');
	// Paiements pour contract1 (actif)
	await prisma.payment.createMany({
		data: [
			// Dépôt initial (payé)
			{
				contractId: contract1.id,
				tenantId: contract1.tenantId,
				amount: contract1.depositAmount,
				type: PaymentType.DEPOSIT,
				status: PaymentStatus.PAID,
				dueDate: contract1.startDate,
				paidDate: contract1.startDate,
			},
			// Quelques loyers passés (payés)
			{
				contractId: contract1.id,
				tenantId: contract1.tenantId,
				amount: contract1.rentAmount + property1.charges, // Loyer + charges
				type: PaymentType.RENT,
				status: PaymentStatus.PAID,
				dueDate: faker.date.recent({ days: 90 }),
				paidDate: faker.date.recent({ days: 88 }),
			},
			{
				contractId: contract1.id,
				tenantId: contract1.tenantId,
				amount: contract1.rentAmount + property1.charges,
				type: PaymentType.RENT,
				status: PaymentStatus.PAID,
				dueDate: faker.date.recent({ days: 60 }),
				paidDate: faker.date.recent({ days: 59 }),
			},
			// Loyer actuel (en attente)
			{
				contractId: contract1.id,
				tenantId: contract1.tenantId,
				amount: contract1.rentAmount + property1.charges,
				type: PaymentType.RENT,
				status: PaymentStatus.PENDING,
				dueDate: faker.date.soon({ days: 5 }), // Échéance proche
				paidDate: null,
			},
			// Loyer en retard
			{
				contractId: contract1.id,
				tenantId: contract1.tenantId,
				amount: contract1.rentAmount + property1.charges,
				type: PaymentType.RENT,
				status: PaymentStatus.LATE,
				dueDate: faker.date.recent({ days: 35 }), // Échéance passée
				paidDate: null,
			},
		]
	});
	console.log('Paiements créés pour le contrat 1.');


	// 8. Créer les Dépenses
	console.log('Création des dépenses...');
	await prisma.expense.createMany({
		data: [
			{
				propertyId: property1.id,
				amount: parseFloat(faker.finance.amount({ min: 50, max: 500, dec: 2 })),
				description: faker.lorem.sentence(),
				date: faker.date.recent({ days: 45 }),
				type: ExpenseType.REPAIR,
				status: ExpenseStatus.PAID,
			},
			{
				propertyId: property3.id, // Pour la propriété commerciale
				amount: parseFloat(faker.finance.amount({ min: 200, max: 1500, dec: 2 })),
				description: "Taxe foncière annuelle",
				date: faker.date.past({ years: 0.5 }),
				type: ExpenseType.TAXES,
				status: ExpenseStatus.PAID,
			},
			{
				propertyId: property4.id, // Pour la propriété en maintenance
				amount: parseFloat(faker.finance.amount({ min: 100, max: 800, dec: 2 })),
				description: "Réparation plomberie urgente",
				date: faker.date.recent({ days: 5 }),
				type: ExpenseType.MAINTENANCE,
				status: ExpenseStatus.PENDING, // En attente de paiement
			},
			{
				propertyId: property1.id,
				amount: parseFloat(faker.finance.amount({ min: 30, max: 100, dec: 2 })),
				description: "Assurance habitation",
				date: faker.date.recent({ days: 10 }),
				type: ExpenseType.INSURANCE,
				status: ExpenseStatus.PENDING,
			},
		]
	});
	console.log('Dépenses créées.');


	console.log(`Seeding terminé.`);
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