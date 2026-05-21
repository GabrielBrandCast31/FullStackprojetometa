# Build multi-stage:
#   1) Node — instala deps e roda `vite build`, produzindo /app/dist.
#   2) nginx — copia o dist e serve, fazendo proxy de /api -> backend:8000.

# ---------- Stage 1: build ----------
FROM node:20-alpine AS build

WORKDIR /app

# Camada de deps (cacheia ate package.json mudar).
COPY package.json package-lock.json* ./
RUN npm ci

# Codigo + build.
COPY . .
RUN npm run build

# ---------- Stage 2: serve ----------
FROM nginx:1.27-alpine

# Config customizada: SPA fallback + reverse proxy /api -> backend
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Apenas os artefatos buildados — sem node_modules, sem fonte.
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

# nginx ja roda em foreground por padrao na imagem oficial.
