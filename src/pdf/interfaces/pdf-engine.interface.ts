import { LeasePdfPayload } from "src/contracts/contracts.service";


export interface PdfEngineInterface {
  generate(data: LeasePdfPayload): Promise<Buffer>;
}