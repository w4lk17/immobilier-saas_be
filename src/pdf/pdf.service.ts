import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PuppeteerEngine } from './engines/puppeteer.engine';
import { LeasePdfPayload } from 'src/contracts/contracts.service';
// import { ReactPdfEngine } from './engines/react-pdf.engine';

@Injectable()
export class PdfService {
  constructor(private configService: ConfigService) { }

  async generateLeasePdf(data: LeasePdfPayload): Promise<Buffer> {
    const engine = this.configService.get<string>('PDF_ENGINE');

    switch (engine) {
      case 'puppeteer':
        const puppeteerEngine = new PuppeteerEngine();
        return puppeteerEngine.generate(data);
      // case 'react-pdf': 
      //   const reactPdfEngine = new ReactPdfEngine();
      //   return reactPdfEngine.generate(data);
      default:
        throw new Error(`Moteur PDF "${engine}" non configuré.`);
    }
  }
}