/*
  Warnings:

  - You are about to alter the column `hash_archivo` on the `importaciones` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(128)`.
  - You are about to drop the column `concepto` on the `ordenes_pago` table. All the data in the column will be lost.
  - You are about to drop the column `periodo` on the `ordenes_pago` table. All the data in the column will be lost.
  - The `estado` column on the `ordenes_pago` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the `pagos` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[numero_documento]` on the table `contribuyentes` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[anio_orden,numero_orden]` on the table `ordenes_pago` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `anio_orden` to the `ordenes_pago` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "EstadoConciliacion" AS ENUM ('PENDIENTE', 'PAGO_PARCIAL', 'PAGADO', 'SOBREPAGO', 'SIN_DECLARACION', 'PAGO_ANULADO', 'ANULADO', 'REVISAR');

-- CreateEnum
CREATE TYPE "OrigenImportacion" AS ENUM ('MANUAL', 'DRIVE');

-- CreateEnum
CREATE TYPE "EstadoImportacion" AS ENUM ('PROCESANDO', 'COMPLETADA', 'COMPLETADA_CON_ERRORES', 'FALLIDA');

-- AlterEnum
ALTER TYPE "TipoImportacion" ADD VALUE 'DECLARACIONES_PAGOS';

-- DropForeignKey
ALTER TABLE "pagos" DROP CONSTRAINT "pagos_contribuyente_id_fkey";

-- DropForeignKey
ALTER TABLE "pagos" DROP CONSTRAINT "pagos_importacion_id_fkey";

-- DropForeignKey
ALTER TABLE "pagos" DROP CONSTRAINT "pagos_orden_id_fkey";

-- DropIndex
DROP INDEX "contribuyentes_numero_documento_idx";

-- DropIndex
DROP INDEX "ordenes_pago_numero_orden_key";

-- DropIndex
DROP INDEX "ordenes_pago_periodo_idx";

-- AlterTable
ALTER TABLE "importaciones" ADD COLUMN     "drive_modified_time" TIMESTAMP(3),
ADD COLUMN     "estado" "EstadoImportacion" NOT NULL DEFAULT 'PROCESANDO',
ADD COLUMN     "fecha_finalizacion" TIMESTAMP(3),
ADD COLUMN     "mensaje" TEXT,
ADD COLUMN     "origen" "OrigenImportacion" NOT NULL DEFAULT 'MANUAL',
ALTER COLUMN "hash_archivo" SET DATA TYPE VARCHAR(128);

-- AlterTable
ALTER TABLE "ordenes_pago" DROP COLUMN "concepto",
DROP COLUMN "periodo",
ADD COLUMN     "activo_original" INTEGER,
ADD COLUMN     "anio_orden" INTEGER NOT NULL,
ADD COLUMN     "datos_originales" JSONB,
ADD COLUMN     "direccion_original" TEXT,
ADD COLUMN     "dni_ruc_original" VARCHAR(30),
ADD COLUMN     "fecha_sunarp" DATE,
ADD COLUMN     "fila_origen" INTEGER,
ADD COLUMN     "id_origen" VARCHAR(60),
ADD COLUMN     "nombre_original" VARCHAR(250),
ADD COLUMN     "periodo_original" TEXT,
ADD COLUMN     "placa" VARCHAR(20),
DROP COLUMN "estado",
ADD COLUMN     "estado" "EstadoConciliacion" NOT NULL DEFAULT 'PENDIENTE';

-- DropTable
DROP TABLE "pagos";

-- DropEnum
DROP TYPE "EstadoOrden";

-- CreateTable
CREATE TABLE "ordenes_detalle" (
    "id" SERIAL NOT NULL,
    "orden_id" INTEGER NOT NULL,
    "declaracion_id" INTEGER,
    "periodo_anio" INTEGER NOT NULL,
    "periodo_original" VARCHAR(50),
    "trimestre_desde" INTEGER NOT NULL,
    "trimestre_hasta" INTEGER NOT NULL,
    "valor_referencial" DECIMAL(14,2),
    "anio_fabricacion" INTEGER,
    "uit" DECIMAL(14,2),
    "base_imponible" DECIMAL(14,2),
    "impuesto" DECIMAL(14,2),
    "reajuste" DECIMAL(14,2),
    "interes" DECIMAL(14,2),
    "gastos_admin" DECIMAL(14,2),
    "total_periodo" DECIMAL(14,2) NOT NULL,
    "monto_pagado" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "saldo" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "estado" "EstadoConciliacion" NOT NULL DEFAULT 'PENDIENTE',
    "observacion" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ordenes_detalle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "declaraciones" (
    "id" SERIAL NOT NULL,
    "anio_declaracion" INTEGER NOT NULL,
    "numero_declaracion" VARCHAR(60) NOT NULL,
    "anio_recepcion" INTEGER,
    "numero_recepcion" VARCHAR(60),
    "contribuyente_id" INTEGER,
    "dni_ruc" VARCHAR(30),
    "nombres_razon_social" VARCHAR(250),
    "direccion_fiscal" TEXT,
    "placa" VARCHAR(20),
    "fecha_inscripcion" DATE,
    "anio_fabricacion" INTEGER,
    "valor_referencial" DECIMAL(14,2),
    "base_imponible" DECIMAL(14,2),
    "tasa" DECIMAL(8,4),
    "impuesto_anual" DECIMAL(14,2),
    "impuesto_trimestral" DECIMAL(14,2),
    "observacion" TEXT,
    "estado_conciliacion" "EstadoConciliacion" NOT NULL DEFAULT 'PENDIENTE',
    "importacion_id" INTEGER,
    "archivo_origen" TEXT,
    "fila_origen" INTEGER,
    "datos_originales" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "declaraciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recibos_pago" (
    "id" SERIAL NOT NULL,
    "declaracion_id" INTEGER NOT NULL,
    "anio_recibo" INTEGER NOT NULL,
    "numero_recibo" VARCHAR(60) NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL,
    "trimestre_original" VARCHAR(30),
    "trimestre_desde" INTEGER,
    "trimestre_hasta" INTEGER,
    "estado_original" VARCHAR(40),
    "activo" BOOLEAN NOT NULL DEFAULT false,
    "usuario_creacion" VARCHAR(100),
    "fecha_creacion_origen" TIMESTAMP(3),
    "usuario_modificacion" VARCHAR(100),
    "fecha_modificacion_origen" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recibos_pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "errores_importacion" (
    "id" SERIAL NOT NULL,
    "importacion_id" INTEGER NOT NULL,
    "fila" INTEGER,
    "campo" VARCHAR(100),
    "valor_original" TEXT,
    "mensaje" TEXT NOT NULL,
    "datos_originales" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "errores_importacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ordenes_detalle_orden_id_idx" ON "ordenes_detalle"("orden_id");

-- CreateIndex
CREATE INDEX "ordenes_detalle_declaracion_id_idx" ON "ordenes_detalle"("declaracion_id");

-- CreateIndex
CREATE INDEX "ordenes_detalle_periodo_anio_idx" ON "ordenes_detalle"("periodo_anio");

-- CreateIndex
CREATE INDEX "ordenes_detalle_estado_idx" ON "ordenes_detalle"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "ordenes_detalle_orden_id_periodo_anio_trimestre_desde_trime_key" ON "ordenes_detalle"("orden_id", "periodo_anio", "trimestre_desde", "trimestre_hasta");

-- CreateIndex
CREATE INDEX "declaraciones_contribuyente_id_idx" ON "declaraciones"("contribuyente_id");

-- CreateIndex
CREATE INDEX "declaraciones_dni_ruc_placa_anio_declaracion_idx" ON "declaraciones"("dni_ruc", "placa", "anio_declaracion");

-- CreateIndex
CREATE INDEX "declaraciones_placa_idx" ON "declaraciones"("placa");

-- CreateIndex
CREATE INDEX "declaraciones_estado_conciliacion_idx" ON "declaraciones"("estado_conciliacion");

-- CreateIndex
CREATE INDEX "declaraciones_importacion_id_idx" ON "declaraciones"("importacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "declaraciones_anio_declaracion_numero_declaracion_key" ON "declaraciones"("anio_declaracion", "numero_declaracion");

-- CreateIndex
CREATE INDEX "recibos_pago_declaracion_id_idx" ON "recibos_pago"("declaracion_id");

-- CreateIndex
CREATE INDEX "recibos_pago_activo_idx" ON "recibos_pago"("activo");

-- CreateIndex
CREATE INDEX "recibos_pago_anio_recibo_idx" ON "recibos_pago"("anio_recibo");

-- CreateIndex
CREATE UNIQUE INDEX "recibos_pago_anio_recibo_numero_recibo_key" ON "recibos_pago"("anio_recibo", "numero_recibo");

-- CreateIndex
CREATE INDEX "errores_importacion_importacion_id_idx" ON "errores_importacion"("importacion_id");

-- CreateIndex
CREATE INDEX "errores_importacion_fila_idx" ON "errores_importacion"("fila");

-- CreateIndex
CREATE UNIQUE INDEX "contribuyentes_numero_documento_key" ON "contribuyentes"("numero_documento");

-- CreateIndex
CREATE INDEX "importaciones_tipo_idx" ON "importaciones"("tipo");

-- CreateIndex
CREATE INDEX "importaciones_origen_idx" ON "importaciones"("origen");

-- CreateIndex
CREATE INDEX "importaciones_estado_idx" ON "importaciones"("estado");

-- CreateIndex
CREATE INDEX "importaciones_hash_archivo_idx" ON "importaciones"("hash_archivo");

-- CreateIndex
CREATE INDEX "ordenes_pago_dni_ruc_original_idx" ON "ordenes_pago"("dni_ruc_original");

-- CreateIndex
CREATE INDEX "ordenes_pago_placa_idx" ON "ordenes_pago"("placa");

-- CreateIndex
CREATE INDEX "ordenes_pago_estado_idx" ON "ordenes_pago"("estado");

-- CreateIndex
CREATE INDEX "ordenes_pago_anio_orden_idx" ON "ordenes_pago"("anio_orden");

-- CreateIndex
CREATE INDEX "ordenes_pago_importacion_id_idx" ON "ordenes_pago"("importacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "ordenes_pago_anio_orden_numero_orden_key" ON "ordenes_pago"("anio_orden", "numero_orden");

-- AddForeignKey
ALTER TABLE "ordenes_detalle" ADD CONSTRAINT "ordenes_detalle_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "ordenes_pago"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_detalle" ADD CONSTRAINT "ordenes_detalle_declaracion_id_fkey" FOREIGN KEY ("declaracion_id") REFERENCES "declaraciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "declaraciones" ADD CONSTRAINT "declaraciones_contribuyente_id_fkey" FOREIGN KEY ("contribuyente_id") REFERENCES "contribuyentes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "declaraciones" ADD CONSTRAINT "declaraciones_importacion_id_fkey" FOREIGN KEY ("importacion_id") REFERENCES "importaciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recibos_pago" ADD CONSTRAINT "recibos_pago_declaracion_id_fkey" FOREIGN KEY ("declaracion_id") REFERENCES "declaraciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "errores_importacion" ADD CONSTRAINT "errores_importacion_importacion_id_fkey" FOREIGN KEY ("importacion_id") REFERENCES "importaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
