export interface StorageEngineInterface {
  upload(buffer: Buffer, folderPath: string): Promise<string>;
}