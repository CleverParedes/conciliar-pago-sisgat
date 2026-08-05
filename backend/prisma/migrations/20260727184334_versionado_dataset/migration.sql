-- CreateEnum
CREATE TYPE "EstadoVersionDatos" AS ENUM ('PENDIENTE', 'VALIDADA', 'APLICANDO', 'ACTIVA', 'ARCHIVADA', 'FALLIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "TipoArchivoVersion" AS ENUM ('ORDENES', 'DECLARACIONES_PAGOS');

-- AlterTable
ALTER TABLE "declaraciones" ADD COLUMN     "version_datos_id" INTEGER;

-- AlterTable
ALTER TABLE "importaciones" ADD COLUMN     "usuario_id" INTEGER,
ADD COLUMN     "version_datos_id" INTEGER;

-- AlterTable
ALTER TABLE "ordenes_pago" ADD COLUMN     "version_datos_id" INTEGER;

-- CreateTable
CREATE TABLE "versiones_datos" (
    "id" SERIAL NOT NULL,
    "codigo" UUID NOT NULL,
    "hash_conjunto" VARCHAR(64) NOT NULL,
    "estado" "EstadoVersionDatos" NOT NULL DEFAULT 'PENDIENTE',
    "usuario_id" INTEGER,
    "comentario" VARCHAR(500),
    "total_ordenes" INTEGER NOT NULL DEFAULT 0,
    "total_declaraciones" INTEGER NOT NULL DEFAULT 0,
    "total_recibos" INTEGER NOT NULL DEFAULT 0,
    "total_errores" INTEGER NOT NULL DEFAULT 0,
    "fecha_analisis" TIMESTAMPTZ(3),
    "fecha_aplicacion" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "versiones_datos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "archivos_version_datos" (
    "id" SERIAL NOT NULL,
    "version_datos_id" INTEGER NOT NULL,
    "tipo" "TipoArchivoVersion" NOT NULL,
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

    CONSTRAINT "archivos_version_datos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "errores_archivo_version" (
    "id" SERIAL NOT NULL,
    "archivo_id" INTEGER NOT NULL,
    "fila" INTEGER,
    "campo" VARCHAR(100),
    "mensaje" TEXT NOT NULL,
    "datos_originales" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "errores_archivo_version_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "versiones_datos_codigo_key" ON "versiones_datos"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "versiones_datos_hash_conjunto_key" ON "versiones_datos"("hash_conjunto");

-- CreateIndex
CREATE INDEX "versiones_datos_estado_created_at_idx" ON "versiones_datos"("estado", "created_at");

-- CreateIndex
CREATE INDEX "versiones_datos_usuario_id_idx" ON "versiones_datos"("usuario_id");

-- CreateIndex
CREATE INDEX "archivos_version_datos_tipo_hash_archivo_idx" ON "archivos_version_datos"("tipo", "hash_archivo");

-- CreateIndex
CREATE UNIQUE INDEX "archivos_version_datos_version_datos_id_tipo_key" ON "archivos_version_datos"("version_datos_id", "tipo");

-- CreateIndex
CREATE INDEX "errores_archivo_version_archivo_id_fila_idx" ON "errores_archivo_version"("archivo_id", "fila");

-- CreateIndex
CREATE INDEX "declaraciones_version_datos_id_idx" ON "declaraciones"("version_datos_id");

-- CreateIndex
CREATE INDEX "importaciones_version_datos_id_idx" ON "importaciones"("version_datos_id");

-- CreateIndex
CREATE INDEX "importaciones_usuario_id_idx" ON "importaciones"("usuario_id");

-- CreateIndex
CREATE INDEX "ordenes_pago_version_datos_id_idx" ON "ordenes_pago"("version_datos_id");

-- AddForeignKey
ALTER TABLE "ordenes_pago" ADD CONSTRAINT "ordenes_pago_version_datos_id_fkey" FOREIGN KEY ("version_datos_id") REFERENCES "versiones_datos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "declaraciones" ADD CONSTRAINT "declaraciones_version_datos_id_fkey" FOREIGN KEY ("version_datos_id") REFERENCES "versiones_datos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "importaciones" ADD CONSTRAINT "importaciones_version_datos_id_fkey" FOREIGN KEY ("version_datos_id") REFERENCES "versiones_datos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "importaciones" ADD CONSTRAINT "importaciones_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "versiones_datos" ADD CONSTRAINT "versiones_datos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archivos_version_datos" ADD CONSTRAINT "archivos_version_datos_version_datos_id_fkey" FOREIGN KEY ("version_datos_id") REFERENCES "versiones_datos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "errores_archivo_version" ADD CONSTRAINT "errores_archivo_version_archivo_id_fkey" FOREIGN KEY ("archivo_id") REFERENCES "archivos_version_datos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
