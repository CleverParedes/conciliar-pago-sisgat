-- Etapa 7A.1: base independiente del módulo de requerimientos manuales.
-- Migración aditiva. No elimina ni reemplaza datos existentes.

-- AlterEnum
ALTER TYPE "TipoImportacion"
ADD VALUE 'REQUERIMIENTOS_MANUALES';

-- CreateEnum
CREATE TYPE "TipoRegistroManual" AS ENUM (
    'REGISTRO_COMPLETO',
    'INCOMPLETO',
    'VACIO',
    'SIN_REGISTRO',
    'ANULADO'
);

CREATE TYPE "EstadoConciliacionManual" AS ENUM (
    'PENDIENTE',
    'PAGO_PARCIAL',
    'PAGADO',
    'SIN_DECLARACION',
    'ANULADO',
    'NO_APLICA',
    'REVISAR'
);

CREATE TYPE "EstadoRevisionManual" AS ENUM (
    'PENDIENTE',
    'COINCIDE',
    'DISCREPANCIA',
    'REVISAR',
    'NO_APLICA'
);

CREATE TYPE "EstadoNotificacionManual" AS ENUM (
    'SIN_ASIGNAR',
    'ASIGNADO',
    'PENDIENTE_NOTIFICACION',
    'NOTIFICADO',
    'NO_NOTIFICADO',
    'OBSERVADO'
);

-- AlterTable
ALTER TABLE "importaciones"
ADD COLUMN "version_requerimientos_manuales_id" INTEGER;

-- CreateTable
CREATE TABLE "versiones_requerimientos_manuales" (
    "id" SERIAL NOT NULL,
    "codigo" UUID NOT NULL,
    "hash_archivo" VARCHAR(64) NOT NULL,
    "estado" "EstadoVersionDatos" NOT NULL DEFAULT 'PENDIENTE',
    "usuario_id" INTEGER,
    "comentario" VARCHAR(500),
    "anio_gestion" INTEGER NOT NULL,
    "total_registros" INTEGER NOT NULL DEFAULT 0,
    "total_periodos" INTEGER NOT NULL DEFAULT 0,
    "total_errores" INTEGER NOT NULL DEFAULT 0,
    "total_advertencias" INTEGER NOT NULL DEFAULT 0,
    "fecha_analisis" TIMESTAMPTZ(3),
    "fecha_aplicacion" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "versiones_requerimientos_manuales_pkey"
    PRIMARY KEY ("id")
);

CREATE TABLE "requerimientos_manuales" (
    "id" SERIAL NOT NULL,
    "anio_gestion" INTEGER NOT NULL,
    "numero_requerimiento" VARCHAR(60) NOT NULL,
    "correlativo_excel" INTEGER,
    "placa_original" VARCHAR(40),
    "placa_normalizada" VARCHAR(20),
    "fecha_requerimiento" DATE,
    "anio_vehiculo_original" VARCHAR(60),
    "anio_vehiculo" INTEGER,
    "deuda_original" TEXT,
    "propietario_original" VARCHAR(300),
    "estado_manual_original" VARCHAR(250),
    "provincia_original" VARCHAR(150),
    "distrito_original" VARCHAR(150),
    "direccion_original" TEXT,
    "notificador_original" VARCHAR(150),
    "observaciones_original" TEXT,
    "numero_liquidacion_deuda_original" VARCHAR(100),
    "fecha_notificacion_original" DATE,
    "numero_cedulon_original" VARCHAR(150),
    "responsable_original" VARCHAR(150),
    "tipo_registro" "TipoRegistroManual" NOT NULL DEFAULT 'INCOMPLETO',
    "estado_conciliado" "EstadoConciliacionManual" NOT NULL DEFAULT 'REVISAR',
    "estado_revision" "EstadoRevisionManual" NOT NULL DEFAULT 'PENDIENTE',
    "estado_notificacion" "EstadoNotificacionManual" NOT NULL DEFAULT 'SIN_ASIGNAR',
    "notificador_actual" VARCHAR(150),
    "responsable_actual" VARCHAR(150),
    "numero_liquidacion_deuda_actual" VARCHAR(100),
    "fecha_notificacion_actual" DATE,
    "numero_cedulon_actual" VARCHAR(150),
    "observacion_seguimiento" TEXT,
    "archivo_origen" TEXT,
    "fila_origen" INTEGER,
    "datos_originales" JSONB,
    "importacion_id" INTEGER,
    "version_requerimientos_manuales_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "requerimientos_manuales_pkey"
    PRIMARY KEY ("id")
);

CREATE TABLE "requerimientos_manuales_periodos" (
    "id" SERIAL NOT NULL,
    "requerimiento_manual_id" INTEGER NOT NULL,
    "declaracion_id" INTEGER,
    "periodo_anio" INTEGER NOT NULL,
    "estado_conciliado" "EstadoConciliacionManual" NOT NULL DEFAULT 'REVISAR',
    "monto_pagado" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "observacion" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "requerimientos_manuales_periodos_pkey"
    PRIMARY KEY ("id")
);

CREATE TABLE "seguimientos_requerimientos_manuales" (
    "id" SERIAL NOT NULL,
    "requerimiento_manual_id" INTEGER NOT NULL,
    "usuario_id" INTEGER,
    "estado_notificacion" "EstadoNotificacionManual" NOT NULL,
    "notificador" VARCHAR(150),
    "responsable" VARCHAR(150),
    "numero_liquidacion_deuda" VARCHAR(100),
    "fecha_notificacion" DATE,
    "numero_cedulon" VARCHAR(150),
    "observacion" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seguimientos_requerimientos_manuales_pkey"
    PRIMARY KEY ("id")
);

CREATE TABLE "historial_requerimientos_manuales" (
    "id" SERIAL NOT NULL,
    "requerimiento_manual_id" INTEGER NOT NULL,
    "usuario_id" INTEGER,
    "accion" VARCHAR(100) NOT NULL,
    "campo" VARCHAR(120),
    "valor_anterior" TEXT,
    "valor_nuevo" TEXT,
    "motivo" TEXT,
    "detalles" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historial_requerimientos_manuales_pkey"
    PRIMARY KEY ("id")
);

CREATE TABLE "archivos_version_requerimientos_manuales" (
    "id" SERIAL NOT NULL,
    "version_requerimientos_manuales_id" INTEGER NOT NULL,
    "nombre_archivo" VARCHAR(255) NOT NULL,
    "nombre_hoja" VARCHAR(150),
    "hash_archivo" VARCHAR(64) NOT NULL,
    "contenido_original" BYTEA NOT NULL,
    "tamano_original" INTEGER NOT NULL,
    "total_filas" INTEGER NOT NULL DEFAULT 0,
    "filas_validas" INTEGER NOT NULL DEFAULT 0,
    "filas_con_error" INTEGER NOT NULL DEFAULT 0,
    "resumen" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "archivos_version_requerimientos_manuales_pkey"
    PRIMARY KEY ("id")
);

CREATE TABLE "errores_archivo_requerimiento_manual" (
    "id" SERIAL NOT NULL,
    "archivo_id" INTEGER NOT NULL,
    "fila" INTEGER,
    "campo" VARCHAR(120),
    "nivel" VARCHAR(20) NOT NULL DEFAULT 'ERROR',
    "mensaje" TEXT NOT NULL,
    "datos_originales" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "errores_archivo_requerimiento_manual_pkey"
    PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "versiones_requerimientos_manuales_codigo_key"
ON "versiones_requerimientos_manuales"("codigo");

CREATE UNIQUE INDEX "versiones_requerimientos_manuales_hash_archivo_key"
ON "versiones_requerimientos_manuales"("hash_archivo");

CREATE INDEX "versiones_requerimientos_manuales_estado_created_at_idx"
ON "versiones_requerimientos_manuales"("estado", "created_at");

CREATE INDEX "versiones_requerimientos_manuales_anio_gestion_idx"
ON "versiones_requerimientos_manuales"("anio_gestion");

CREATE INDEX "versiones_requerimientos_manuales_usuario_id_idx"
ON "versiones_requerimientos_manuales"("usuario_id");

CREATE UNIQUE INDEX "requerimientos_manuales_anio_gestion_numero_requerimiento_key"
ON "requerimientos_manuales"("anio_gestion", "numero_requerimiento");

CREATE INDEX "requerimientos_manuales_placa_normalizada_idx"
ON "requerimientos_manuales"("placa_normalizada");

CREATE INDEX "requerimientos_manuales_fecha_requerimiento_idx"
ON "requerimientos_manuales"("fecha_requerimiento");

CREATE INDEX "requerimientos_manuales_tipo_registro_idx"
ON "requerimientos_manuales"("tipo_registro");

CREATE INDEX "requerimientos_manuales_estado_conciliado_idx"
ON "requerimientos_manuales"("estado_conciliado");

CREATE INDEX "requerimientos_manuales_estado_revision_idx"
ON "requerimientos_manuales"("estado_revision");

CREATE INDEX "requerimientos_manuales_estado_notificacion_idx"
ON "requerimientos_manuales"("estado_notificacion");

CREATE INDEX "requerimientos_manuales_notificador_actual_idx"
ON "requerimientos_manuales"("notificador_actual");

CREATE INDEX "requerimientos_manuales_responsable_actual_idx"
ON "requerimientos_manuales"("responsable_actual");

CREATE INDEX "requerimientos_manuales_importacion_id_idx"
ON "requerimientos_manuales"("importacion_id");

CREATE INDEX "requerimientos_manuales_version_requerimientos_manuales_id_idx"
ON "requerimientos_manuales"("version_requerimientos_manuales_id");

CREATE UNIQUE INDEX "requerimientos_manuales_periodos_requerimiento_manual_id_periodo_anio_key"
ON "requerimientos_manuales_periodos"(
    "requerimiento_manual_id",
    "periodo_anio"
);

CREATE INDEX "requerimientos_manuales_periodos_requerimiento_manual_id_idx"
ON "requerimientos_manuales_periodos"("requerimiento_manual_id");

CREATE INDEX "requerimientos_manuales_periodos_declaracion_id_idx"
ON "requerimientos_manuales_periodos"("declaracion_id");

CREATE INDEX "requerimientos_manuales_periodos_periodo_anio_idx"
ON "requerimientos_manuales_periodos"("periodo_anio");

CREATE INDEX "requerimientos_manuales_periodos_estado_conciliado_idx"
ON "requerimientos_manuales_periodos"("estado_conciliado");

CREATE INDEX "seguimientos_requerimientos_manuales_requerimiento_manual_id_created_at_idx"
ON "seguimientos_requerimientos_manuales"(
    "requerimiento_manual_id",
    "created_at"
);

CREATE INDEX "seguimientos_requerimientos_manuales_usuario_id_idx"
ON "seguimientos_requerimientos_manuales"("usuario_id");

CREATE INDEX "seguimientos_requerimientos_manuales_estado_notificacion_idx"
ON "seguimientos_requerimientos_manuales"("estado_notificacion");

CREATE INDEX "historial_requerimientos_manuales_requerimiento_manual_id_created_at_idx"
ON "historial_requerimientos_manuales"(
    "requerimiento_manual_id",
    "created_at"
);

CREATE INDEX "historial_requerimientos_manuales_usuario_id_idx"
ON "historial_requerimientos_manuales"("usuario_id");

CREATE INDEX "historial_requerimientos_manuales_accion_idx"
ON "historial_requerimientos_manuales"("accion");

CREATE UNIQUE INDEX "archivos_version_requerimientos_manuales_version_id_key"
ON "archivos_version_requerimientos_manuales"(
    "version_requerimientos_manuales_id"
);

CREATE INDEX "archivos_version_requerimientos_manuales_hash_archivo_idx"
ON "archivos_version_requerimientos_manuales"("hash_archivo");

CREATE INDEX "errores_archivo_requerimiento_manual_archivo_id_fila_idx"
ON "errores_archivo_requerimiento_manual"("archivo_id", "fila");

CREATE INDEX "errores_archivo_requerimiento_manual_nivel_idx"
ON "errores_archivo_requerimiento_manual"("nivel");

CREATE INDEX "importaciones_version_requerimientos_manuales_id_idx"
ON "importaciones"("version_requerimientos_manuales_id");

-- AddForeignKey
ALTER TABLE "versiones_requerimientos_manuales"
ADD CONSTRAINT "versiones_requerimientos_manuales_usuario_id_fkey"
FOREIGN KEY ("usuario_id")
REFERENCES "usuarios"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE "requerimientos_manuales"
ADD CONSTRAINT "requerimientos_manuales_importacion_id_fkey"
FOREIGN KEY ("importacion_id")
REFERENCES "importaciones"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE "requerimientos_manuales"
ADD CONSTRAINT "requerimientos_manuales_version_id_fkey"
FOREIGN KEY ("version_requerimientos_manuales_id")
REFERENCES "versiones_requerimientos_manuales"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE "requerimientos_manuales_periodos"
ADD CONSTRAINT "requerimientos_manuales_periodos_requerimiento_id_fkey"
FOREIGN KEY ("requerimiento_manual_id")
REFERENCES "requerimientos_manuales"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "requerimientos_manuales_periodos"
ADD CONSTRAINT "requerimientos_manuales_periodos_declaracion_id_fkey"
FOREIGN KEY ("declaracion_id")
REFERENCES "declaraciones"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE "seguimientos_requerimientos_manuales"
ADD CONSTRAINT "seguimientos_requerimientos_manuales_requerimiento_id_fkey"
FOREIGN KEY ("requerimiento_manual_id")
REFERENCES "requerimientos_manuales"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "seguimientos_requerimientos_manuales"
ADD CONSTRAINT "seguimientos_requerimientos_manuales_usuario_id_fkey"
FOREIGN KEY ("usuario_id")
REFERENCES "usuarios"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE "historial_requerimientos_manuales"
ADD CONSTRAINT "historial_requerimientos_manuales_requerimiento_id_fkey"
FOREIGN KEY ("requerimiento_manual_id")
REFERENCES "requerimientos_manuales"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "historial_requerimientos_manuales"
ADD CONSTRAINT "historial_requerimientos_manuales_usuario_id_fkey"
FOREIGN KEY ("usuario_id")
REFERENCES "usuarios"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE "archivos_version_requerimientos_manuales"
ADD CONSTRAINT "archivos_version_requerimientos_manuales_version_id_fkey"
FOREIGN KEY ("version_requerimientos_manuales_id")
REFERENCES "versiones_requerimientos_manuales"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "errores_archivo_requerimiento_manual"
ADD CONSTRAINT "errores_archivo_requerimiento_manual_archivo_id_fkey"
FOREIGN KEY ("archivo_id")
REFERENCES "archivos_version_requerimientos_manuales"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "importaciones"
ADD CONSTRAINT "importaciones_version_requerimientos_manuales_id_fkey"
FOREIGN KEY ("version_requerimientos_manuales_id")
REFERENCES "versiones_requerimientos_manuales"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
