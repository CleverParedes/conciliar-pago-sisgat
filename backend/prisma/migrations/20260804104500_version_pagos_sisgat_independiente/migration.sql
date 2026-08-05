-- Etapa 9A.2: versión independiente de Declaraciones y Pagos SisGAT.
-- Migración aditiva. Conserva órdenes, liquidaciones y requerimientos.

ALTER TABLE "declaraciones"
ADD COLUMN "version_pagos_sisgat_id" INTEGER;

ALTER TABLE "importaciones"
ADD COLUMN "version_pagos_sisgat_id" INTEGER;

CREATE TABLE "versiones_pagos_sisgat" (
    "id" SERIAL NOT NULL,
    "codigo" UUID NOT NULL DEFAULT gen_random_uuid(),
    "hash_archivo" VARCHAR(64) NOT NULL,
    "estado" "EstadoVersionDatos" NOT NULL DEFAULT 'PENDIENTE',
    "usuario_id" INTEGER,
    "comentario" VARCHAR(500),
    "total_declaraciones" INTEGER NOT NULL DEFAULT 0,
    "total_recibos" INTEGER NOT NULL DEFAULT 0,
    "total_errores" INTEGER NOT NULL DEFAULT 0,
    "total_advertencias" INTEGER NOT NULL DEFAULT 0,
    "fecha_analisis" TIMESTAMPTZ(3),
    "fecha_aplicacion" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "versiones_pagos_sisgat_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "archivos_version_pagos_sisgat" (
    "id" SERIAL NOT NULL,
    "version_pagos_sisgat_id" INTEGER NOT NULL,
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
    CONSTRAINT "archivos_version_pagos_sisgat_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "errores_archivo_pagos_sisgat" (
    "id" SERIAL NOT NULL,
    "archivo_id" INTEGER NOT NULL,
    "fila" INTEGER,
    "campo" VARCHAR(100),
    "mensaje" TEXT NOT NULL,
    "datos_originales" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "errores_archivo_pagos_sisgat_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "versiones_pagos_sisgat_codigo_key"
ON "versiones_pagos_sisgat"("codigo");
CREATE UNIQUE INDEX "versiones_pagos_sisgat_hash_archivo_key"
ON "versiones_pagos_sisgat"("hash_archivo");
CREATE INDEX "versiones_pagos_sisgat_estado_created_at_idx"
ON "versiones_pagos_sisgat"("estado", "created_at");
CREATE INDEX "versiones_pagos_sisgat_usuario_id_idx"
ON "versiones_pagos_sisgat"("usuario_id");

CREATE UNIQUE INDEX "archivos_version_pagos_sisgat_version_pagos_sisgat_id_key"
ON "archivos_version_pagos_sisgat"("version_pagos_sisgat_id");
CREATE INDEX "archivos_version_pagos_sisgat_hash_archivo_idx"
ON "archivos_version_pagos_sisgat"("hash_archivo");
CREATE INDEX "errores_archivo_pagos_sisgat_archivo_id_fila_idx"
ON "errores_archivo_pagos_sisgat"("archivo_id", "fila");
CREATE INDEX "declaraciones_version_pagos_sisgat_id_idx"
ON "declaraciones"("version_pagos_sisgat_id");
CREATE INDEX "importaciones_version_pagos_sisgat_id_idx"
ON "importaciones"("version_pagos_sisgat_id");

ALTER TABLE "versiones_pagos_sisgat"
ADD CONSTRAINT "versiones_pagos_sisgat_usuario_id_fkey"
FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "archivos_version_pagos_sisgat"
ADD CONSTRAINT "archivos_version_pagos_sisgat_version_pagos_sisgat_id_fkey"
FOREIGN KEY ("version_pagos_sisgat_id") REFERENCES "versiones_pagos_sisgat"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "errores_archivo_pagos_sisgat"
ADD CONSTRAINT "errores_archivo_pagos_sisgat_archivo_id_fkey"
FOREIGN KEY ("archivo_id") REFERENCES "archivos_version_pagos_sisgat"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "declaraciones"
ADD CONSTRAINT "declaraciones_version_pagos_sisgat_id_fkey"
FOREIGN KEY ("version_pagos_sisgat_id") REFERENCES "versiones_pagos_sisgat"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "importaciones"
ADD CONSTRAINT "importaciones_version_pagos_sisgat_id_fkey"
FOREIGN KEY ("version_pagos_sisgat_id") REFERENCES "versiones_pagos_sisgat"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Crear una versión independiente inicial a partir de la versión conjunta activa.
DO $$
DECLARE
    fuente RECORD;
    nueva_version_id INTEGER;
    nuevo_archivo_id INTEGER;
BEGIN
    SELECT
        vd."id" AS version_datos_anterior_id,
        vd."usuario_id",
        vd."comentario",
        vd."total_declaraciones",
        vd."total_recibos",
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
       AND avd."tipo" = 'DECLARACIONES_PAGOS'
    WHERE vd."estado" = 'ACTIVA'
    ORDER BY vd."fecha_aplicacion" DESC NULLS LAST, vd."id" DESC
    LIMIT 1;

    IF FOUND THEN
        INSERT INTO "versiones_pagos_sisgat" (
            "hash_archivo",
            "estado",
            "usuario_id",
            "comentario",
            "total_declaraciones",
            "total_recibos",
            "total_errores",
            "total_advertencias",
            "fecha_analisis",
            "fecha_aplicacion",
            "created_at",
            "updated_at"
        ) VALUES (
            fuente."hash_archivo",
            'ACTIVA',
            fuente."usuario_id",
            COALESCE(fuente."comentario", 'Migrada desde la versión conjunta de Órdenes y Pagos SisGAT.'),
            fuente."total_declaraciones",
            fuente."total_recibos",
            fuente."total_errores",
            COALESCE((fuente."resumen"->>'totalAdvertencias')::INTEGER, 0),
            fuente."fecha_analisis",
            fuente."fecha_aplicacion",
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
        )
        RETURNING "id" INTO nueva_version_id;

        INSERT INTO "archivos_version_pagos_sisgat" (
            "version_pagos_sisgat_id",
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
            fuente."resumen"
        )
        RETURNING "id" INTO nuevo_archivo_id;

        INSERT INTO "errores_archivo_pagos_sisgat" (
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

        UPDATE "declaraciones"
        SET "version_pagos_sisgat_id" = nueva_version_id;

        UPDATE "importaciones"
        SET "version_pagos_sisgat_id" = nueva_version_id
        WHERE "tipo" = 'DECLARACIONES_PAGOS'
          AND "version_datos_id" = fuente."version_datos_anterior_id"
          AND "estado" IN ('COMPLETADA', 'COMPLETADA_CON_ERRORES');
    END IF;
END $$;
