import { Injectable } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import { PdfEngineInterface } from '../interfaces/pdf-engine.interface';
import { LeasePdfPayload } from 'src/contracts/contracts.service';
import { join } from 'path';

@Injectable()
export class PuppeteerEngine implements PdfEngineInterface {
  async generate(data: LeasePdfPayload): Promise<Buffer> {
    // 1. Lancement du navigateur headless
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        // Empêche Chrome de verrouiller les fonctionnalités de tracking inter-sites sous Windows
        '--disable-features=FirstPartySets,PrivacySandboxFirstPartySetsUI',
      ],
      // Optionnel mais recommandé : Force l'usage d'un sous-dossier propre au projet pour les profils
      userDataDir: join(process.cwd(), '.cache', 'puppeteer_user_data'),
    });
    const page = await browser.newPage();

    // 2. Création d'un HTML très basique pour le test 
    const htmlContent = `
     <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <title>Contrat de Bail d'Habitation - Togo</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; line-height: 1.6; color: #333; }
          h1 { color: #2c3e50; border-bottom: 2px solid #2c3e50; padding-bottom: 10px; text-align: center; font-size: 24px; }
          h2 { color: #2c3e50; border-bottom: 1px solid #bdc3c7; padding-bottom: 5px; font-size: 18px; margin-top: 30px; }
          .party { margin-bottom: 15px; }
          .label { font-weight: bold; color: #2c3e50; }
          .highlight { font-weight: bold; color: #000; }
          .signatures { margin-top: 50px; display: flex; justify-content: space-between; }
          .sig-box { width: 45%; border-top: 1px dashed #333; padding-top: 10px; height: 120px; }
        </style>
      </head>
      <body>

        <h1>CONTRAT DE BAIL À USAGE D’HABITATION</h1>
        <p style="text-align: center; font-style: italic;">Conforme au décret n° 2022-001/PR du 05 janvier 2022 (République Togolaise)</p>
        <p style="text-align: right;"><span class="label">Référence :</span> ${data.reference}</p>

        <h2>1. ENTRE LES SOUSSIGNÉS</h2>
        
        <div class="party">
          <span class="label">LE BAILLEUR (Propriétaire) :</span> <span class="highlight">${data.ownerFullName}</span><br>
          <span class="label">Adresse / Demeure :</span> ${data.ownerAddress || 'Non renseignée'}<br>
          <span class="label">Téléphone :</span> ${data.ownerPhoneNumber || 'Non renseigné'}
        </div>

        <div class="party">
          <span class="label">LE LOCATAIRE :</span> <span class="highlight">${data.tenantFullName}</span><br>
          <span class="label">Né(e) le :</span> ${data.tenantBirthDate || 'Non renseigné'}<br>
          <span class="label">Téléphone :</span> ${data.tenantPhoneNumber || 'Non renseigné'}
        </div>

        <h2>2. DÉSIGNATION ET DESTINATION DES LIEUX</h2>
        <p><span class="label">Description du bien :</span> ${data.designation}</p>
        <p><span class="label">Adresse / Quartier :</span> ${data.address}</p>
        <p><em>Les locaux loués sont destinés exclusivement à l'usage d'habitation principale.</em></p>

        <h2>3. DURÉE ET PRISE D'EFFET</h2>
        <p>Le présent contrat est conclu pour une durée indéterminée. Il prend effet à compter du : <strong>${data.startDate}</strong>.</p>

        <h2>4. CONDITIONS FINANCIÈRES</h2>
        <p>Le présent bail est consenti et accepté sous les conditions financières suivantes :</p>
        <ul>
          <li>Loyer mensuel : <strong class="highlight">${data.rentAmount} F CFA</strong></li>
          <li>Provisions sur charges : <strong>${data.chargesAmount} F CFA</strong></li>
          <li>Dépôt de garantie et Avance (Plafonds réglementés) : <strong class="highlight">${data.depositAmount} F CFA</strong></li>
        </ul>
        <p>Le loyer est payable d'avance à terme échu au plus tard le 5 de chaque mois.</p>

        <h2>5. RÉSILIATION ET PRÉAVIS</h2>
        <p>Chacune des parties peut mettre fin au présent contrat à tout moment sous réserve de notifier à l'autre party un préavis écrit de <strong>deux (02) mois</strong> minimum, conformément à la réglementation togolaise en vigueur.</p>

        <h2>6. ENREGISTREMENT ET LITIGES</h2>
        <p>Le présent contrat sera obligatoirement soumis à la formalité de l'enregistrement auprès de l'Office Togolais des Recettes (OTR). Tout litige né de l'exécution du présent bail sera porté devant les tribunaux compétents du Togo.</p>

        <p style="margin-top: 30px;">Fait à Lomé, le ......................................... en trois (03) exemplaires originaux.</p>

        <div class="signatures">
          <div class="sig-box">
            <span class="label">Le Bailleur</span><br>
            <span style="font-size: 11px; color: #7f8c8d;">(Mention manuscrite "Lu et approuvé" + Signature)</span>
          </div>
          <div class="sig-box">
            <span class="label">Le Locataire</span><br>
            <span style="font-size: 11px; color: #7f8c8d;">(Mention manuscrite "Lu et approuvé" + Signature)</span>
          </div>
        </div>

      </body>
      </html>
    `;

    // 3. Puppeteer charge le HTML
    await page.setContent(htmlContent, { waitUntil: 'load' });

    // 4. Génération du PDF en mémoire (Buffer)
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
    });

    // 5. Fermeture du navigateur (très important pour ne pas saturer la RAM)
    await browser.close();
    // return pdfBuffer;
    return Buffer.from(pdfBuffer);
  }
}