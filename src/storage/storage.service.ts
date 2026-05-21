import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CloudinaryEngine } from './engines/cloudinary.engine';
import { StorageEngineInterface } from './interfaces/storage-engine.interface';

@Injectable()
export class StorageService {
  constructor(private configService: ConfigService) { }

  private getEngine(): StorageEngineInterface {
    const engine = this.configService.get<string>('STORAGE_ENGINE');

    switch (engine) {
      case 'cloudinary':
        return new CloudinaryEngine(this.configService);

      // On préparera le case 's3' plus tard
      default:
        throw new Error(`Moteur de stockage "${engine}" non configuré.`);
    }
  }

  async uploadFile(buffer: Buffer, path: string): Promise<string> {
    const engine = this.getEngine();
    return engine.upload(buffer, path);
  }
}