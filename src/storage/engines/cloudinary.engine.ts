import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import * as streamifier from 'streamifier';
import { StorageEngineInterface } from '../interfaces/storage-engine.interface';

@Injectable()
export class CloudinaryEngine implements StorageEngineInterface {
  constructor(private configService: ConfigService) {
    // Initialisation de Cloudinary à la construction de la classe
    cloudinary.config({
      cloud_name: this.configService.get<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: this.configService.get<string>('CLOUDINARY_API_KEY'),
      api_secret: this.configService.get<string>('CLOUDINARY_API_SECRET'),
    });
  }

  async upload(buffer: Buffer, folderPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      // Configuration de l'upload
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'raw', // Indispensable pour les PDF (sinon Cloudinary essaie de le lire comme une image)
          public_id: folderPath, // Le chemin (ex: "contracts/BAIL-2024-0001")
          overwrite: true,
        },
        (error, result) => {
          if (error) return reject(error);
          if (!result) {
            return reject(new Error("Cloudinary upload failed: result is undefined"));
          }
          // On retourne l'URL sécurisée (https) du fichier stocké
          resolve(result.secure_url);
        },

      );

      // On envoie le Buffer dans le stream de Cloudinary
      streamifier.createReadStream(buffer).pipe(uploadStream);
    });
  }
}