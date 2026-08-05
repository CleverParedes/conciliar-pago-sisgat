-- Etapa 6A.1: base independiente del módulo de requerimientos.
-- Esta migración es aditiva y no elimina datos existentes.

-- AlterEnum
ALTER TYPE "TipoImportacion" ADD VALUE 'REQUERIMIENTOS';

-- AlterTable
ALTER TABLE "importaciones"
ADD COLUMN "version_requerimientos_id" INTEGER;

-- CreateTable
CREATE TABLE "versiones_requerimientos" (
    "id" SERIAL NOT NULL,
    "codigo" UUID NOT NULL,
    "hash_archivo" VARCHAR(64) NOT NULL,
    "estado" "EstadoVersionDatos" NOT NULL DEFAULT 'PENDIENTE',
    "usuario_id" INTEGER,
    "comentario" VARCHAR(500),
    "total_requerimientos" INTEGER NOT NULL DEFAULT 0,
    "total_detalles" INTEGER NOT NULL DEFAULT 0,
    "total_errores" INTEGER NOT NULL DEFAULT 0,
    "fecha_analisis" TIMESTAMPTZ(3),
    "fecha_aplicacion" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "versiones_requerimientos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requerimientos" (
    "id" SERIAL NOT NULL,
    "anio_requerimiento" INTEGER NOT NULL,
    "numero_requerimiento" VARCHAR(60) NOT NULL,
    "id_origen" VARCHAR(60),
    "fecha_emision" DATE,
    "contribuyente_id" INTEGER,
    "dni_ruc_original" VARCHAR(30),
    "nombre_original" VARCHAR(250),
    "direccion_original" TEXT,
    "placa" VARCHAR(20),
    "fecha_sunarp" DATE,
    "estado_original" VARCHAR(40),
    "periodo_original" TEXT,
    "importe_total" DECIMAL(14,2) NOT NULL,
    "total_pagado" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "saldo" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "estado" "EstadoConciliacion" NOT NULL DEFAULT 'PENDIENTE',
    "usuario_creacion" VARCHAR(100),
    "fecha_creacion_origen" TIMESTAMP(3),
    "usuario_modificacion" VARCHAR(100),
    "fecha_modificacion_origen" TIMESTAMP(3),
    "fecha_generacion" DATE,
    "archivo_origen" TEXT,
    "fila_origen" INTEGER,
    "datos_originales" JSONB,
    "importacion_id" INTEGER,
    "version_requerimientos_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "requerimientos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requerimientos_detalle" (
    "id" SERIAL NOT NULL,
    "requerimiento_id" INTEGER NOT NULL,
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

    CONSTRAINT "requerimientos_detalle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "archivos_version_requerimientos" (
    "id" SERIAL NOT NULL,
    "version_requerimientos_id" INTEGER NOT NULL,
    "nombre_archivo" VARCHAR(255) NOT NULL,
    "hash_archivo" VARCHAR(64) NOT NULL,
    "contenido_gzip" BYTEA NOT NULL,
    "tamano_original" INTEGER NOT NULL,
    "tamano_comprimido" INTEGER NOT NULL,
    "total_filas" INTEGER NOT NULL DEFAULT 0,
    "filas_validas" INTEGER NOT NULL DEFAULT 0,
    "filas_con_error" INTEGER NOT NULL DEFAULT 0,
    "resumen" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "archivos_version_requerimientos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "errores_archivo_requerimiento" (
    "id" SERIAL NOT NULL,
    "archivo_id" INTEGER NOT NULL,
    "fila" INTEGER,
    "campo" VARCHAR(100),
    "mensaje" TEXT NOT NULL,
    "datos_originales" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "errores_archivo_requerimiento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "versiones_requerimientos_codigo_key"
ON "versiones_requerimientos"("codigo");

CREATE UNIQUE INDEX "versiones_requerimientos_hash_archivo_key"
ON "versiones_requerimientos"("hash_archivo");

CREATE INDEX "versiones_requerimientos_estado_created_at_idx"
ON "versiones_requerimientos"("estado", "created_at");

CREATE INDEX "versiones_requerimientos_usuario_id_idx"
ON "versiones_requerimientos"("usuario_id");

CREATE UNIQUE INDEX "requerimientos_anio_requerimiento_numero_requerimiento_key"
ON "requerimientos"("anio_requerimiento", "numero_requerimiento");

CREATE INDEX "requerimientos_contribuyente_id_idx"
ON "requerimientos"("contribuyente_id");

CREATE INDEX "requerimientos_dni_ruc_original_idx"
ON "requerimientos"("dni_ruc_original");

CREATE INDEX "requerimientos_placa_idx"
ON "requerimientos"("placa");

CREATE INDEX "requerimientos_estado_idx"
ON "requerimientos"("estado");

CREATE INDEX "requerimientos_anio_requerimiento_idx"
ON "requerimientos"("anio_requerimiento");

CREATE INDEX "requerimientos_importacion_id_idx"
ON "requerimientos"("importacion_id");

CREATE INDEX "requerimientos_version_requerimientos_id_idx"
ON "requerimientos"("version_requerimientos_id");

CREATE UNIQUE INDEX "requerimientos_detalle_requerimiento_id_periodo_anio_trimestre_desde_trimestre_hasta_key"
ON "requerimientos_detalle"(
    "requerimiento_id",
    "periodo_anio",
    "trimestre_desde",
    "trimestre_hasta"
);

CREATE INDEX "requerimientos_detalle_requerimiento_id_idx"
ON "requerimientos_detalle"("requerimiento_id");

CREATE INDEX "requerimientos_detalle_declaracion_id_idx"
ON "requerimientos_detalle"("declaracion_id");

CREATE INDEX "requerimientos_detalle_periodo_anio_idx"
ON "requerimientos_detalle"("periodo_anio");

CREATE INDEX "requerimientos_detalle_estado_idx"
ON "requerimientos_detalle"("estado");

CREATE UNIQUE INDEX "archivos_version_requerimientos_version_requerimientos_id_key"
ON "archivos_version_requerimientos"("version_requerimientos_id");

CREATE INDEX "archivos_version_requerimientos_hash_archivo_idx"
ON "archivos_version_requerimientos"("hash_archivo");

CREATE INDEX "errores_archivo_requerimiento_archivo_id_fila_idx"
ON "errores_archivo_requerimiento"("archivo_id", "fila");

CREATE INDEX "importaciones_version_requerimientos_id_idx"
ON "importaciones"("version_requerimientos_id");

-- AddForeignKey
ALTER TABLE "versiones_requerimientos"
ADD CONSTRAINT "versiones_requerimientos_usuario_id_fkey"
FOREIGN KEY ("usuario_id")
REFERENCES "usuarios"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE "requerimientos"
ADD CONSTRAINT "requerimientos_contribuyente_id_fkey"
FOREIGN KEY ("contribuyente_id")
REFERENCES "contribuyentes"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE "requerimientos"
ADD CONSTRAINT "requerimientos_importacion_id_fkey"
FOREIGN KEY ("importacion_id")
REFERENCES "importaciones"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE "requerimientos"
ADD CONSTRAINT "requerimientos_version_requerimientos_id_fkey"
FOREIGN KEY ("version_requerimientos_id")
REFERENCES "versiones_requerimientos"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE "requerimientos_detalle"
ADD CONSTRAINT "requerimientos_detalle_requerimiento_id_fkey"
FOREIGN KEY ("requerimiento_id")
REFERENCES "requerimientos"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "requerimientos_detalle"
ADD CONSTRAINT "requerimientos_detalle_declaracion_id_fkey"
FOREIGN KEY ("declaracion_id")
REFERENCES "declaraciones"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE "archivos_version_requerimientos"
ADD CONSTRAINT "archivos_version_requerimientos_version_requerimientos_id_fkey"
FOREIGN KEY ("version_requerimientos_id")
REFERENCES "versiones_requerimientos"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "errores_archivo_requerimiento"
ADD CONSTRAINT "errores_archivo_requerimiento_archivo_id_fkey"
FOREIGN KEY ("archivo_id")
REFERENCES "archivos_version_requerimientos"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "importaciones"
ADD CONSTRAINT "importaciones_version_requerimientos_id_fkey"
FOREIGN KEY ("version_requerimientos_id")
REFERENCES "versiones_requerimientos"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
