-- Etapa 9A.3: versión independiente de Órdenes de pago.
-- Migración aditiva. Conserva Pagos SisGAT, Liquidaciones y Requerimientos.

ALTER TABLE "ordenes_pago"
ADD COLUMN "version_ordenes_id" INTEGER;

ALTER TABLE "importaciones"
ADD COLUMN "version_ordenes_id" INTEGER;

CREATE TABLE "versiones_ordenes" (
    "id" SERIAL NOT NULL,
    "codigo" UUID NOT NULL DEFAULT gen_random_uuid(),
    "hash_archivo" VARCHAR(64) NOT NULL,
    "estado" "EstadoVersionDatos" NOT NULL DEFAULT 'PENDIENTE',
    "usuario_id" INTEGER,
    "comentario" VARCHAR(500),
    "total_ordenes" INTEGER NOT NULL DEFAULT 0,
    "total_detalles" INTEGER NOT NULL DEFAULT 0,
    "total_errores" INTEGER NOT NULL DEFAULT 0,
    "fecha_analisis" TIMESTAMPTZ(3),
    "fecha_aplicacion" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "versiones_ordenes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "archivos_version_ordenes" (
    "id" SERIAL NOT NULL,
    "version_ordenes_id" INTEGER NOT NULL,
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
    CONSTRAINT "archivos_version_ordenes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "errores_archivo_ordenes" (
    "id" SERIAL NOT NULL,
    "archivo_id" INTEGER NOT NULL,
    "fila" INTEGER,
    "campo" VARCHAR(100),
    "mensaje" TEXT NOT NULL,
    "datos_originales" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "errores_archivo_ordenes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "versiones_ordenes_codigo_key"
ON "versiones_ordenes"("codigo");

CREATE UNIQUE INDEX "versiones_ordenes_hash_archivo_key"
ON "versiones_ordenes"("hash_archivo");

CREATE INDEX "versiones_ordenes_estado_created_at_idx"
ON "versiones_ordenes"("estado", "created_at");

CREATE INDEX "versiones_ordenes_usuario_id_idx"
ON "versiones_ordenes"("usuario_id");

CREATE UNIQUE INDEX "archivos_version_ordenes_version_ordenes_id_key"
ON "archivos_version_ordenes"("version_ordenes_id");

CREATE INDEX "archivos_version_ordenes_hash_archivo_idx"
ON "archivos_version_ordenes"("hash_archivo");

CREATE INDEX "errores_archivo_ordenes_archivo_id_fila_idx"
ON "errores_archivo_ordenes"("archivo_id", "fila");

CREATE INDEX "ordenes_pago_version_ordenes_id_idx"
ON "ordenes_pago"("version_ordenes_id");

CREATE INDEX "importaciones_version_ordenes_id_idx"
ON "importaciones"("version_ordenes_id");

ALTER TABLE "versiones_ordenes"
ADD CONSTRAINT "versiones_ordenes_usuario_id_fkey"
FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "archivos_version_ordenes"
ADD CONSTRAINT "archivos_version_ordenes_version_ordenes_id_fkey"
FOREIGN KEY ("version_ordenes_id") REFERENCES "versiones_ordenes"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "errores_archivo_ordenes"
ADD CONSTRAINT "errores_archivo_ordenes_archivo_id_fkey"
FOREIGN KEY ("archivo_id") REFERENCES "archivos_version_ordenes"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ordenes_pago"
ADD CONSTRAINT "ordenes_pago_version_ordenes_id_fkey"
FOREIGN KEY ("version_ordenes_id") REFERENCES "versiones_ordenes"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "importaciones"
ADD CONSTRAINT "importaciones_version_ordenes_id_fkey"
FOREIGN KEY ("version_ordenes_id") REFERENCES "versiones_ordenes"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Crear una versión independiente inicial a partir de la versión conjunta activa.
DO $$
DECLARE
    fuente RECORD;
    nueva_version_id INTEGER;
    nuevo_archivo_id INTEGER;
    total_detalles_actual INTEGER;
BEGIN
    SELECT
        vd."id" AS version_datos_anterior_id,
        vd."usuario_id",
        vd."comentario",
        vd."total_ordenes",
        vd."total_errores",
        vd."fecha_analisis",
        vd."fecha_aplicacion",
        avd."id" AS archivo_anterior_id,
        avd."nombre_archivo",
        avd."hash_archivo",
        avd."contenido_gzip",
        avd."tamano_original",
        avd."tamano_comprimido",
        avd."total_filas",
        avd."filas_validas",
        avd."filas_con_error",
        avd."resumen"
    INTO fuente
    FROM "versiones_datos" vd
    INNER JOIN "archivos_version_datos" avd
        ON avd."version_datos_id" = vd."id"
       AND avd."tipo" = 'ORDENES'
    WHERE vd."estado" = 'ACTIVA'
    ORDER BY vd."fecha_aplicacion" DESC NULLS LAST, vd."id" DESC
    LIMIT 1;

    IF FOUND THEN
        SELECT COUNT(*)
        INTO total_detalles_actual
        FROM "ordenes_detalle";

        INSERT INTO "versiones_ordenes" (
            "hash_archivo",
            "estado",
            "usuario_id",
            "comentario",
            "total_ordenes",
            "total_detalles",
            "total_errores",
            "fecha_analisis",
            "fecha_aplicacion",
            "created_at",
            "updated_at"
        ) VALUES (
            fuente."hash_archivo",
            'ACTIVA',
            fuente."usuario_id",
            COALESCE(
                fuente."comentario",
                'Migrada desde la versión conjunta de Órdenes y Pagos SisGAT.'
            ),
            fuente."total_ordenes",
            total_detalles_actual,
            fuente."total_errores",
            fuente."fecha_analisis",
            fuente."fecha_aplicacion",
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
        )
        RETURNING "id" INTO nueva_version_id;

        INSERT INTO "archivos_version_ordenes" (
            "version_ordenes_id",
            "nombre_archivo",
            "hash_archivo",
            "contenido_gzip",
            "tamano_original",
            "tamano_comprimido",
            "total_filas",
            "filas_validas",
            "filas_con_error",
            "resumen"
        ) VALUES (
            nueva_version_id,
            fuente."nombre_archivo",
            fuente."hash_archivo",
            fuente."contenido_gzip",
            fuente."tamano_original",
            fuente."tamano_comprimido",
            fuente."total_filas",
            fuente."filas_validas",
            fuente."filas_con_error",
            jsonb_build_object(
                'totalOrdenes', fuente."total_ordenes",
                'totalDetalles', total_detalles_actual,
                'migradaDesdeVersionDatosId', fuente."version_datos_anterior_id",
                'resumenAnterior', fuente."resumen"
            )
        )
        RETURNING "id" INTO nuevo_archivo_id;

        INSERT INTO "errores_archivo_ordenes" (
            "archivo_id",
            "fila",
            "campo",
            "mensaje",
            "datos_originales",
            "created_at"
        )
        SELECT
            nuevo_archivo_id,
            eav."fila",
            eav."campo",
            eav."mensaje",
            eav."datos_originales",
            eav."created_at"
        FROM "errores_archivo_version" eav
        WHERE eav."archivo_id" = fuente."archivo_anterior_id";

        UPDATE "ordenes_pago"
        SET "version_ordenes_id" = nueva_version_id;

        UPDATE "importaciones"
        SET "version_ordenes_id" = nueva_version_id
        WHERE "tipo" = 'ORDENES'
          AND "version_datos_id" = fuente."version_datos_anterior_id"
          AND "estado" IN ('COMPLETADA', 'COMPLETADA_CON_ERRORES');
    END IF;
END $$;
