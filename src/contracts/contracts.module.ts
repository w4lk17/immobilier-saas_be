import { Module } from '@nestjs/common';
import { ContractsService } from './contracts.service';
import { ContractsController } from './contracts.controller';
import { PdfModule } from 'src/pdf/pdf.module';
import { StorageModule } from 'src/storage/storage.module';

@Module({
  imports: [
    // ... tes autres imports (PrismaModule, etc.)
    PdfModule,
    StorageModule,
  ],
  controllers: [ContractsController],
  providers: [ContractsService],
  exports: [ContractsService],
})
export class ContractsModule {}
