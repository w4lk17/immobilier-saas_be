import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PdfService } from './pdf.service';

@Module({
  imports: [ConfigModule],
  providers: [PdfService],
  exports: [PdfService], // INDISPENSABLE pour que ContractModule puisse l'utiliser
})
export class PdfModule { }