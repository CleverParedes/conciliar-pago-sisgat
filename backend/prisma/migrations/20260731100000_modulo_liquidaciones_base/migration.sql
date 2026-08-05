-- AlterEnum
ALTER TYPE "TipoImportacion" ADD VALUE 'LIQUIDACIONES';

-- AlterTable
ALTER TABLE "importaciones"
ADD COLUMN "version_liquidaciones_id" INTEGER;

-- CreateTable
CREATE TABLE "versiones_liquidaciones" (
    "id" SERIAL NOT NULL,
    "codigo" UUID NOT NULL,
    "hash_archivo" VARCHAR(64) NOT NULL,
    "estado" "EstadoVersionDatos" NOT NULL DEFAULT 'PENDIENTE',
    "usuario_id" INTEGER,
    "comentario" VARCHAR(500),
    "total_liquidaciones" INTEGER NOT NULL DEFAULT 0,
    "total_detalles" INTEGER NOT NULL DEFAULT 0,
    "total_errores" INTEGER NOT NULL DEFAULT 0,
    "fecha_analisis" TIMESTAMPTZ(3),
    "fecha_aplicacion" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "versiones_liquidaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "liquidaciones" (
    "id" SERIAL NOT NULL,
    "anio_liquidacion" INTEGER NOT NULL,
    "numero_liquidacion" VARCHAR(60) NOT NULL,
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
    "anio_r_veh" INTEGER,
    "numero_r_veh" VARCHAR(60),
    "archivo_origen" TEXT,
    "fila_origen" INTEGER,
    "datos_originales" JSONB,
    "importacion_id" INTEGER,
    "version_liquidaciones_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "liquidaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "liquidaciones_detalle" (
    "id" SERIAL NOT NULL,
    "liquidacion_id" INTEGER NOT NULL,
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

    CONSTRAINT "liquidaciones_detalle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "archivos_version_liquidaciones" (
    "id" SERIAL NOT NULL,
    "version_liquidaciones_id" INTEGER NOT NULL,
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

    CONSTRAINT "archivos_version_liquidaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "errores_archivo_liquidacion" (
    "id" SERIAL NOT NULL,
    "archivo_id" INTEGER NOT NULL,
    "fila" INTEGER,
    "campo" VARCHAR(100),
    "mensaje" TEXT NOT NULL,
    "datos_originales" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "errores_archivo_liquidacion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "versiones_liquidaciones_codigo_key"
ON "versiones_liquidaciones"("codigo");

CREATE UNIQUE INDEX "versiones_liquidaciones_hash_archivo_key"
ON "versiones_liquidaciones"("hash_archivo");

CREATE INDEX "versiones_liquidaciones_estado_created_at_idx"
ON "versiones_liquidaciones"("estado", "created_at");

CREATE INDEX "versiones_liquidaciones_usuario_id_idx"
ON "versiones_liquidaciones"("usuario_id");

CREATE UNIQUE INDEX "liquidaciones_anio_liquidacion_numero_liquidacion_key"
ON "liquidaciones"("anio_liquidacion", "numero_liquidacion");

CREATE INDEX "liquidaciones_contribuyente_id_idx"
ON "liquidaciones"("contribuyente_id");

CREATE INDEX "liquidaciones_dni_ruc_original_idx"
ON "liquidaciones"("dni_ruc_original");

CREATE INDEX "liquidaciones_placa_idx"
ON "liquidaciones"("placa");

CREATE INDEX "liquidaciones_estado_idx"
ON "liquidaciones"("estado");

CREATE INDEX "liquidaciones_anio_liquidacion_idx"
ON "liquidaciones"("anio_liquidacion");

CREATE INDEX "liquidaciones_importacion_id_idx"
ON "liquidaciones"("importacion_id");

CREATE INDEX "liquidaciones_version_liquidaciones_id_idx"
ON "liquidaciones"("version_liquidaciones_id");

CREATE UNIQUE INDEX "liquidaciones_detalle_liquidacion_id_periodo_anio_trimestre_desde_trimestre_hasta_key"
ON "liquidaciones_detalle"(
    "liquidacion_id",
    "periodo_anio",
    "trimestre_desde",
    "trimestre_hasta"
);

CREATE INDEX "liquidaciones_detalle_liquidacion_id_idx"
ON "liquidaciones_detalle"("liquidacion_id");

CREATE INDEX "liquidaciones_detalle_declaracion_id_idx"
ON "liquidaciones_detalle"("declaracion_id");

CREATE INDEX "liquidaciones_detalle_periodo_anio_idx"
ON "liquidaciones_detalle"("periodo_anio");

CREATE INDEX "liquidaciones_detalle_estado_idx"
ON "liquidaciones_detalle"("estado");

CREATE UNIQUE INDEX "archivos_version_liquidaciones_version_liquidaciones_id_key"
ON "archivos_version_liquidaciones"("version_liquidaciones_id");

CREATE INDEX "archivos_version_liquidaciones_hash_archivo_idx"
ON "archivos_version_liquidaciones"("hash_archivo");

CREATE INDEX "errores_archivo_liquidacion_archivo_id_fila_idx"
ON "errores_archivo_liquidacion"("archivo_id", "fila");

CREATE INDEX "importaciones_version_liquidaciones_id_idx"
ON "importaciones"("version_liquidaciones_id");

ALTER TABLE "versiones_liquidaciones"
ADD CONSTRAINT "versiones_liquidaciones_usuario_id_fkey"
FOREIGN KEY ("usuario_id")
REFERENCES "usuarios"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE "liquidaciones"
ADD CONSTRAINT "liquidaciones_contribuyente_id_fkey"
FOREIGN KEY ("contribuyente_id")
REFERENCES "contribuyentes"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE "liquidaciones"
ADD CONSTRAINT "liquidaciones_importacion_id_fkey"
FOREIGN KEY ("importacion_id")
REFERENCES "importaciones"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE "liquidaciones"
ADD CONSTRAINT "liquidaciones_version_liquidaciones_id_fkey"
FOREIGN KEY ("version_liquidaciones_id")
REFERENCES "versiones_liquidaciones"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE "liquidaciones_detalle"
ADD CONSTRAINT "liquidaciones_detalle_liquidacion_id_fkey"
FOREIGN KEY ("liquidacion_id")
REFERENCES "liquidaciones"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "liquidaciones_detalle"
ADD CONSTRAINT "liquidaciones_detalle_declaracion_id_fkey"
FOREIGN KEY ("declaracion_id")
REFERENCES "declaraciones"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE "archivos_version_liquidaciones"
ADD CONSTRAINT "archivos_version_liquidaciones_version_liquidaciones_id_fkey"
FOREIGN KEY ("version_liquidaciones_id")
REFERENCES "versiones_liquidaciones"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "errores_archivo_liquidacion"
ADD CONSTRAINT "errores_archivo_liquidacion_archivo_id_fkey"
FOREIGN KEY ("archivo_id")
REFERENCES "archivos_version_liquidaciones"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "importaciones"
ADD CONSTRAINT "importaciones_version_liquidaciones_id_fkey"
FOREIGN KEY ("version_liquidaciones_id")
REFERENCES "versiones_liquidaciones"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
