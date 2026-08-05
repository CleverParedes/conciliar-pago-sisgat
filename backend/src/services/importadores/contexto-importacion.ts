import type { Prisma } from "../../../generated/prisma/client";

export interface ContextoImportacion {
  cliente?: Prisma.TransactionClient;
  versionDatosId?: number;
  versionOrdenesId?: number;
  versionPagosSisgatId?: number;
  usuarioId?: number;
  permitirArchivoDuplicado?: boolean;
}