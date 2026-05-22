// import { Injectable } from '@nestjs/common';
// import { pdf } from '@react-pdf/renderer';
// import { PdfEngineInterface } from '../interfaces/pdf-engine.interface';
// import { LeaseTemplate } from '../templates/lease-template';
// import { LeasePdfPayload } from 'src/contracts/contracts.service';
// @Injectable()
// export class ReactPdfEngine implements PdfEngineInterface {
//   async generate(data: LeasePdfPayload): Promise<Buffer> {
//     try {
//       // 1. On crée une instance du PDF en passant notre composant React et ses données
//       const pdfInstance = pdf(
//         <LeaseTemplate data={ data } />
//       );

//       // 2. On demande à React-PDF de compiler cela en un Buffer (fichier binaire en mémoire)
//       const pdfBuffer = await pdfInstance.toBuffer();

//       return pdfBuffer;
//     } catch (error) {
//       console.error('Erreur lors de la génération React-PDF:', error);
//       throw new Error('Impossible de générer le PDF avec React-PDF');
//     }
//   }
// }