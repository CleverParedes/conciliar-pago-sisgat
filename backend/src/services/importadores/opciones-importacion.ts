import {
  ModoImportacion,
  TipoFechaFiltro,
} from "../../../generated/prisma/client";

export interface OpcionesImportacion {
  modo: ModoImportacion;
  fechaDesde: Date | null;
  fechaHasta: Date | null;
  tipoFechaFiltro: TipoFechaFiltro;
}