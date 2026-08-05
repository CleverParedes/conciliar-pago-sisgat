-- CreateEnum
CREATE TYPE "ModoImportacion" AS ENUM ('HISTORICA', 'INCREMENTAL');

-- CreateEnum
CREATE TYPE "TipoFechaFiltro" AS ENUM ('NO_ESPECIFICADO', 'FECHA_DECLARACION', 'FECHA_RECIBO', 'FECHA_CREACION', 'FECHA_MODIFICACION', 'CREACION_O_MODIFICACION');

-- AlterTable
ALTER TABLE "importaciones" ADD COLUMN     "fecha_desde" DATE,
ADD COLUMN     "fecha_hasta" DATE,
ADD COLUMN     "modo" "ModoImportacion" NOT NULL DEFAULT 'HISTORICA',
ADD COLUMN     "registros_actualizados" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "registros_nuevos" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "registros_sin_cambios" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tipo_fecha_filtro" "TipoFechaFiltro" NOT NULL DEFAULT 'NO_ESPECIFICADO';
