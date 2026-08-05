# syntax=docker/dockerfile:1

# ==================================================
# ETAPA 1: COMPILAR REACT
# ==================================================

FROM node:22-bookworm-slim AS frontend-build

WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./frontend/

RUN npm ci --prefix frontend

COPY frontend ./frontend

RUN npm run build --prefix frontend


# ==================================================
# ETAPA 2: INSTALAR BACKEND Y GENERAR PRISMA
# ==================================================

FROM node:22-bookworm-slim AS backend-build

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       openssl \
       ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY backend/package.json backend/package-lock.json ./backend/

RUN npm ci --prefix backend

COPY backend/prisma ./backend/prisma
COPY backend/prisma.config.ts ./backend/prisma.config.ts
COPY backend/tsconfig.json ./backend/tsconfig.json

ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"

RUN npm run prisma:generate --prefix backend


# ==================================================
# ETAPA 3: APLICACIÓN FINAL
# ==================================================

FROM node:22-bookworm-slim AS runtime

WORKDIR /app


 # Se agrega el repositorio oficial de PostgreSQL
 # para instalar pg_dump y pg_restore versión 17.

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       ca-certificates \
       curl \
       gnupg \
    && install -d /usr/share/postgresql-common/pgdg \
    && curl -fsSL \
       https://www.postgresql.org/media/keys/ACCC4CF8.asc \
       | gpg --dearmor \
         --batch \
         --yes \
         -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg \
    && echo \
       "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
       > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
       openssl \
       postgresql-client-17 \
    && apt-get purge -y --auto-remove \
       curl \
       gnupg \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV BACKUP_DIR=/app/backups/database
ENV BACKUP_RETENTION_COUNT=20

COPY backend/package.json backend/package-lock.json ./backend/

COPY --from=backend-build /app/backend/node_modules ./backend/node_modules

COPY backend/src ./backend/src
COPY backend/prisma ./backend/prisma
COPY backend/prisma.config.ts ./backend/prisma.config.ts
COPY backend/tsconfig.json ./backend/tsconfig.json

COPY --from=backend-build /app/backend/generated ./backend/generated
COPY --from=frontend-build /app/frontend/dist ./frontend/dist


 # La aplicación se ejecuta como usuario node.
 # Esta carpeta debe ser escribible antes de
 # cambiar al usuario sin privilegios.
 
RUN mkdir -p /app/backups/database \
    && chown -R node:node /app/backups

EXPOSE 3000

USER node

CMD ["npm", "run", "start", "--prefix", "backend"]