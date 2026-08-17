import { LeasePdfPayload } from "../../contracts/contracts.service";

export interface PdfEngineInterface {
  generate(data: LeasePdfPayload): Promise<Buffer>;
}