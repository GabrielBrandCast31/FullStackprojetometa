# TanStack Start em Node runtime (preset nitro: node-server).
# Stage 1 builda o app; Stage 2 roda `node .output/server/index.mjs`.

# ---------- Stage 1: build ----------
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps --no-audit --no-fund

COPY . .
RUN npm run build

# ---------- Stage 2: runtime ----------
FROM node:20-alpine AS runtime

WORKDIR /app

# Copia só o output gerado pelo Nitro (server + public assets + manifest).
COPY --from=build /app/.output ./.output

ENV NODE_ENV=production
ENV PORT=80
EXPOSE 80

# srvx (server runtime do Nitro/h3) le HOST e PORT automaticamente.
CMD ["node", ".output/server/index.mjs"]
