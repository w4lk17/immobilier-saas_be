import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core'; // For global guards
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { ManagersModule } from './managers/managers.module';
import { OwnersModule } from './owners/owners.module';
import { TenantsModule } from './tenants/tenants.module';
import { PropertiesModule } from './properties/properties.module';
import { ContractsModule } from './contracts/contracts.module';
import { InvoicesModule } from './invoices/invoices.module';
import { BillingModule } from './billing/billing.module';
import { ExpensesModule } from './expenses/expenses.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RentalsModule } from './rentals/rentals.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // Make config available globally
      envFilePath: '.env',
    }),
    PrismaModule, // PrismaService available globally
    AuthModule, // Authentication
    UsersModule,
    ManagersModule,
    OwnersModule,
    TenantsModule,
    PropertiesModule,
    RentalsModule,
    ContractsModule,
    InvoicesModule,
    BillingModule,
    ExpensesModule,
  ],
  controllers: [AppController], // AppController can be removed if not used
  providers: [
    AppService,
    // Apply guards globally in order: JWT Auth first, then Roles
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard, // Runs first - checks token, attaches user
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard, // Runs second - checks user.role against @Roles()
    },
  ],
})
export class AppModule {}
