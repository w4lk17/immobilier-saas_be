# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a NestJS backend for a real estate management SaaS platform ("immobilier-saas"). It manages properties, rentals, contracts, invoices, expenses, and billing with role-based access control.

**Tech Stack:** NestJS, Prisma ORM, PostgreSQL, JWT authentication (cookie-based), Stripe integration.

## Development Commands

```bash
# Development
pnpm install          # Runs prisma generate automatically via postinstall
pnpm start:dev        # Start with watch mode
pnpm start:debug      # Start with debug mode

# Building & Production
pnpm build            # Build to dist/
pnpm start:prod       # Run built application

# Database
npx prisma generate   # Generate Prisma Client after schema changes
npx prisma migrate dev # Create and apply new migration
npx prisma db seed    # Seed database (uses ts-node prisma/seed.ts)
npx prisma studio     # Visual database browser

# Code Quality
pnpm lint             # ESLint with auto-fix
pnpm format           # Prettier formatting

# Testing
pnpm test             # Run unit tests
pnpm test:watch       # Watch mode
pnpm test:cov         # Coverage report
pnpm test:e2e         # End-to-end tests
```

## Architecture

### Module Structure

The application follows NestJS's modular architecture:

- **`src/auth/`** - Authentication with JWT (access + refresh tokens stored in httpOnly cookies)
- **`src/users/`** - Core user management with self-service methods (`getMe`, `updateMe`, `changePassword`)
- **`src/employees/`**, **`src/owners/`**, **`src/tenants/`** - Role-specific profiles (1:1 with User)
- **`src/properties/`** - Property management
- **`src/rentals/`** - Rental units within properties
- **`src/contracts/`** - Lease contracts linking owners, tenants, properties, and rentals
- **`src/invoices/`** - Invoice generation for rent, deposits, charges
- **`src/billing/`** - Stripe payment processing
- **`src/expenses/`** - Property expense tracking
- **`src/common/`** - Shared DTOs (e.g., `UpdateStatusDto`)
- **`src/prisma/`** - PrismaService (singleton, available globally)

### Authentication & Authorization

The app uses **cookie-based JWT authentication** with dual tokens:

1. **Access Token** (15min) - Stored in `accessToken` cookie, sent to all routes
2. **Refresh Token** (7 days) - Stored in `refreshToken` cookie, only sent to `/api/auth` endpoints

**Global Guards (applied in order via `app.module.ts`):**
1. `JwtAuthGuard` - Validates JWT, attaches `user` payload to request
2. `RolesGuard` - Checks user role against `@Roles()` decorator

**Public Routes:** Use `@Public()` decorator on controller methods to bypass auth.

**Role-Based Access:** Use `@Roles(UserRole.ADMIN, UserRole.MANAGER)` decorator.

**Current User:** Use `@GetCurrentUser('userId')` or `@GetCurrentUser()` decorator.

**Cookie Configuration (auth.service.ts:174-203):**
- Local development: `secure: false`, `sameSite: 'lax'`
- Production (Vercel): `secure: true`, `sameSite: 'none'` (cross-site)

### Database Schema (Prisma)

**Optimized Schema Pattern:**
- `User` table contains **all common fields** (firstName, lastName, phoneNumber, civility, dateOfBirth, address, pictureUrl, workPlace, occupation, identity docs, PAC info)
- Profile tables (`Owner`, `Employee`, `Tenant`) only contain **role-specific fields** and are minimal
- Example: `Owner` has no specific fields (acts as a role marker), `Employee` has `position`/`hireDate`/`employmentType`, `Tenant` has `oldAddress`

**Key relationships:**
- `User` → `Owner` | `Employee` | `Tenant` (1:1 profile relations)
- `Owner` owns `Property`
- `Property` has many `Rental`
- `Contract` links `Owner` + `Tenant` + `Property` + `Rental` + `Employee?` (manager, optional)
- `Contract` generates `Invoice`
- `Invoice` receives `PaymentTransaction`

**Enums:** `UserRole` (USER, OWNER, TENANT, MANAGER, ADMIN), `EmploymentType`, `PropertyType`, `PropertyStatus`, `RentalType`, `RentalStatus`, `LeaseType`, `ContractStatus`, `InvoiceType`, `InvoiceStatus` (PENDING, PAID, PARTIAL, OVERDUE), `PaymentProvider`, `PaymentTransactionStatus`, `ExpenseType`, `ExpenseStatus`

**Important:** After modifying `prisma/schema.prisma`, run `npx prisma generate` to update the Prisma Client types.

### Entity Creation Workflow

**Single-Step Atomic Creation (Admin only):**
- Creating an Owner/Tenant/Employee is done via `POST /api/owners|tenants|employees`
- The service atomically creates both `User` (with hashed password) and the profile in one Prisma transaction
- DTOs include auth fields (`email`, `password`) + all common User fields + role-specific fields
- Example: `CreateOwnerDto` includes email, password, firstName, lastName, phoneNumber, civility, etc.

**Role Assignment:**
- Role is set during creation (OWNER, TENANT, or MANAGER for employees)
- Deleting a profile retrogrades the User to `USER` role
- `isActive` status toggled via `PATCH /api/:resource/:id/status` (uses `UpdateStatusDto`)

## Authorization Patterns

### Self-Access Control

Services implement ownership checks for profile access:

```typescript
// In service methods (findOne, update)
const isOwner = resource.userId === currentUser.sub;
if (currentUser.role !== UserRole.ADMIN && !isOwner) {
  throw new ForbiddenException("Vous n'avez pas accès à ce profil.");
}
```

- **Tenants**: Can view/update their own profile (not others)
- **Owners**: Can view/update their own profile (not others)
- **Employees (MANAGER)**: Can view/update their own profile; `position`/`employmentType` changes restricted to admins only

**Controller pattern:** Pass `@GetCurrentUser() user: JwtPayload` to service methods for ownership checks.

## Service Layer Patterns

**Prisma Access:** Inject `PrismaService` in any service - it's globally available via `PrismaModule`.

**User Operations:**
- Use `UsersService` for user lookups (e.g., `findByEmail`) rather than direct Prisma queries
- Self-service methods: `getMe(userId)` returns user with all profiles, `updateMe()` for basic info changes, `changePassword()` for password updates
- Admin-only methods: `findAll()`, `findOne()`, `update()`, `remove()`

**Response Formatting:**
- Services use private helpers like `formatOwnerResponse()` to strip sensitive fields (`password`, `refreshToken`)
- Profile services reformat Prisma's nested create response to return `{ id, userId, ..., user: {...} }` structure

**DTO Validation:** All controllers use class-validator DTOs. Global `ValidationPipe` has `whitelist: true` and `transform: true` enabled in `main.ts`.

**Response Objects:** The app does not use class-transformer entities. Services return plain objects or Prisma models directly.

### Common Patterns

**Status Update Pattern:**
```typescript
@Patch(':id/status')
@Roles(UserRole.ADMIN)
updateStatus(@Param('id') id: number, @Body() updateStatusDto: UpdateStatusDto)
```
Uses shared `UpdateStatusDto { isActive: boolean }` from `src/common/dto/update-status.dto.ts`.

**Delete Pattern:**
- Profile deletion does NOT delete the User record
- Instead, it retrogrades the User to `role: USER`
- Deletion may be blocked by foreign key constraints (e.g., Owner with properties, Tenant with contracts)

## API Prefix & CORS

- Global prefix: `/api`
- CORS enabled for `http://localhost:3000` (frontend)
- Credentials enabled for cookie-based auth

## Environment Variables

Required in `.env`:
```
DATABASE_URL=
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
JWT_ACCESS_EXPIRATION=15m
JWT_REFRESH_EXPIRATION=7d
NODE_ENV=development
```

For Stripe billing (billing module):
```
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```
