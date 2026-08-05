# Sistema de Conciliación de Pagos Tributarios

Aplicación web para actualizar, consultar, conciliar y generar reportes de información tributaria.

## Módulos principales

- Pagos SisGAT
- Órdenes de pago
- Liquidaciones
- Requerimientos SisGAT
- Requerimientos manuales
- Historial de actualizaciones
- Reportes en Excel
- Administración de usuarios
- Respaldos automáticos de PostgreSQL

## Tecnologías

- React
- TypeScript
- Vite
- Node.js
- Express
- Prisma ORM
- PostgreSQL 17
- Docker y Docker Compose

## Requisitos

- Git
- Docker Desktop

No es necesario instalar PostgreSQL ni Node.js cuando se utiliza Docker.

## Instalación

Clonar el repositorio:

    git clone https://github.com/CleverParedes/conciliar-pago-sisgat.git
    cd conciliar-pago-sisgat

Crear el archivo privado de configuración:

    Copy-Item ".env.docker.example" ".env.docker"
    notepad ".env.docker"

Cambiar obligatoriamente:

- POSTGRES_PASSWORD
- ADMIN_PASSWORD

La contraseña del administrador debe tener como mínimo 12 caracteres.

## Primer inicio

Durante el primer inicio, el contenedor ejecuta automáticamente:

1. Las migraciones mediante prisma migrate deploy.
2. El seed para crear el administrador inicial.
3. El servidor web.

Las credenciales iniciales se obtienen del archivo .env.docker:

- ADMIN_NAME
- ADMIN_USERNAME
- ADMIN_EMAIL
- ADMIN_PASSWORD

El seed no modifica la contraseña cuando el administrador ya existe.

## Iniciar el sistema

    docker compose --env-file ".env.docker" up -d --build

Comprobar el estado:

    docker compose --env-file ".env.docker" ps

Abrir:

    http://localhost:3000

## Ver registros

    docker compose --env-file ".env.docker" logs --tail 150 app

## Detener el sistema

    docker compose --env-file ".env.docker" down

Este comando conserva la base de datos.

No utilizar docker compose down -v salvo que se quiera eliminar completamente el volumen PostgreSQL.

## Persistencia

El volumen de PostgreSQL es:

    sistema-pagos-postgres-data

Los respaldos locales se almacenan en:

    backups/database

La carpeta de respaldos no se publica en GitHub.

## Seguridad

No deben publicarse:

- .env.docker
- backend/.env
- frontend/.env
- Contraseñas o credenciales
- Respaldos PostgreSQL
- Archivos XLSX, CSV o TXT con datos reales
- node_modules
- backups
- Carpetas de etapas, parches o correcciones

## Prisma

Las migraciones oficiales se encuentran en:

    backend/prisma/migrations

En despliegue se utiliza prisma migrate deploy.

No utilizar prisma migrate dev ni prisma db push en producción.
