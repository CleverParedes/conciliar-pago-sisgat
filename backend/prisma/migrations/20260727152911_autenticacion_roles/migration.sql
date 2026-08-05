-- CreateEnum
CREATE TYPE "RolUsuario" AS ENUM ('USUARIO', 'ADMINISTRADOR');

-- CreateEnum
CREATE TYPE "EstadoUsuario" AS ENUM ('ACTIVO', 'BLOQUEADO', 'DESACTIVADO');

-- CreateEnum
CREATE TYPE "TipoSesion" AS ENUM ('INVITADO', 'AUTENTICADO');

-- CreateEnum
CREATE TYPE "EstadoSesion" AS ENUM ('ACTIVA', 'REVOCADA', 'EXPIRADA');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(150) NOT NULL,
    "nombre_usuario" VARCHAR(80) NOT NULL,
    "correo" VARCHAR(180),
    "password_hash" VARCHAR(255) NOT NULL,
    "rol" "RolUsuario" NOT NULL DEFAULT 'USUARIO',
    "estado" "EstadoUsuario" NOT NULL DEFAULT 'ACTIVO',
    "intentos_fallidos" INTEGER NOT NULL DEFAULT 0,
    "bloqueado_hasta" TIMESTAMPTZ(3),
    "ultimo_acceso" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sesiones" (
    "id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "tipo" "TipoSesion" NOT NULL,
    "estado" "EstadoSesion" NOT NULL DEFAULT 'ACTIVA',
    "usuario_id" INTEGER,
    "fecha_expira" TIMESTAMPTZ(3) NOT NULL,
    "ultima_actividad" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" VARCHAR(64),
    "user_agent" VARCHAR(500),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sesiones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditoria" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER,
    "sesion_id" UUID,
    "accion" VARCHAR(100) NOT NULL,
    "entidad" VARCHAR(100),
    "entidad_id" VARCHAR(100),
    "resultado" VARCHAR(30) NOT NULL DEFAULT 'CORRECTO',
    "detalles" JSONB,
    "ip" VARCHAR(64),
    "user_agent" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_nombre_usuario_key" ON "usuarios"("nombre_usuario");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_correo_key" ON "usuarios"("correo");

-- CreateIndex
CREATE INDEX "usuarios_rol_estado_idx" ON "usuarios"("rol", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "sesiones_token_hash_key" ON "sesiones"("token_hash");

-- CreateIndex
CREATE INDEX "sesiones_usuario_id_estado_idx" ON "sesiones"("usuario_id", "estado");

-- CreateIndex
CREATE INDEX "sesiones_tipo_estado_idx" ON "sesiones"("tipo", "estado");

-- CreateIndex
CREATE INDEX "sesiones_fecha_expira_idx" ON "sesiones"("fecha_expira");

-- CreateIndex
CREATE INDEX "auditoria_usuario_id_created_at_idx" ON "auditoria"("usuario_id", "created_at");

-- CreateIndex
CREATE INDEX "auditoria_sesion_id_idx" ON "auditoria"("sesion_id");

-- CreateIndex
CREATE INDEX "auditoria_accion_created_at_idx" ON "auditoria"("accion", "created_at");

-- AddForeignKey
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_sesion_id_fkey" FOREIGN KEY ("sesion_id") REFERENCES "sesiones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
