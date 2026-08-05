-- CreateEnum
CREATE TYPE "EstadoOrden" AS ENUM ('PENDIENTE', 'PAGO_PARCIAL', 'PAGADO', 'SOBREPAGO', 'ANULADO');

-- CreateEnum
CREATE TYPE "TipoImportacion" AS ENUM ('ORDENES', 'PAGOS');

-- CreateTable
CREATE TABLE "contribuyentes" (
    "id" SERIAL NOT NULL,
    "codigo" VARCHAR(40),
    "tipo_documento" VARCHAR(20),
    "numero_documento" VARCHAR(30),
    "nombre_razon_social" VARCHAR(250) NOT NULL,
    "direccion" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contribuyentes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ordenes_pago" (
    "id" SERIAL NOT NULL,
    "numero_orden" VARCHAR(60) NOT NULL,
    "contribuyente_id" INTEGER,
    "periodo" VARCHAR(30),
    "concepto" VARCHAR(200),
    "fecha_emision" DATE,
    "importe_total" DECIMAL(14,2) NOT NULL,
    "total_pagado" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "saldo" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "estado" "EstadoOrden" NOT NULL DEFAULT 'PENDIENTE',
    "archivo_origen" TEXT,
    "importacion_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ordenes_pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pagos" (
    "id" SERIAL NOT NULL,
    "numero_operacion" VARCHAR(80),
    "numero_orden_origen" VARCHAR(60),
    "orden_id" INTEGER,
    "contribuyente_id" INTEGER,
    "fecha_pago" DATE,
    "importe_pagado" DECIMAL(14,2) NOT NULL,
    "medio_pago" VARCHAR(60),
    "archivo_origen" TEXT,
    "importacion_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pagos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "importaciones" (
    "id" SERIAL NOT NULL,
    "tipo" "TipoImportacion" NOT NULL,
    "nombre_archivo" TEXT NOT NULL,
    "drive_file_id" TEXT,
    "hash_archivo" TEXT,
    "total_filas" INTEGER NOT NULL DEFAULT 0,
    "filas_correctas" INTEGER NOT NULL DEFAULT 0,
    "filas_con_error" INTEGER NOT NULL DEFAULT 0,
    "fecha_importacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "importaciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contribuyentes_codigo_key" ON "contribuyentes"("codigo");

-- CreateIndex
CREATE INDEX "contribuyentes_numero_documento_idx" ON "contribuyentes"("numero_documento");

-- CreateIndex
CREATE INDEX "contribuyentes_nombre_razon_social_idx" ON "contribuyentes"("nombre_razon_social");

-- CreateIndex
CREATE UNIQUE INDEX "ordenes_pago_numero_orden_key" ON "ordenes_pago"("numero_orden");

-- CreateIndex
CREATE INDEX "ordenes_pago_contribuyente_id_idx" ON "ordenes_pago"("contribuyente_id");

-- CreateIndex
CREATE INDEX "ordenes_pago_estado_idx" ON "ordenes_pago"("estado");

-- CreateIndex
CREATE INDEX "ordenes_pago_periodo_idx" ON "ordenes_pago"("periodo");

-- CreateIndex
CREATE INDEX "pagos_numero_orden_origen_idx" ON "pagos"("numero_orden_origen");

-- CreateIndex
CREATE INDEX "pagos_numero_operacion_idx" ON "pagos"("numero_operacion");

-- CreateIndex
CREATE INDEX "pagos_contribuyente_id_idx" ON "pagos"("contribuyente_id");

-- CreateIndex
CREATE INDEX "pagos_fecha_pago_idx" ON "pagos"("fecha_pago");

-- CreateIndex
CREATE INDEX "importaciones_drive_file_id_idx" ON "importaciones"("drive_file_id");

-- AddForeignKey
ALTER TABLE "ordenes_pago" ADD CONSTRAINT "ordenes_pago_contribuyente_id_fkey" FOREIGN KEY ("contribuyente_id") REFERENCES "contribuyentes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_pago" ADD CONSTRAINT "ordenes_pago_importacion_id_fkey" FOREIGN KEY ("importacion_id") REFERENCES "importaciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "ordenes_pago"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_contribuyente_id_fkey" FOREIGN KEY ("contribuyente_id") REFERENCES "contribuyentes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_importacion_id_fkey" FOREIGN KEY ("importacion_id") REFERENCES "importaciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
