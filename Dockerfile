# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
# Hugging Face Spaces (SDK docker) exige escuchar en app_port = 7860 (ver README.md).
ENV PORT=7860
# HF Spaces: el tráfico llega por el proxy de HF, así que todos los jugadores comparten la IP
# del socket. Con TRUST_PROXY=1 se lee el último hop de X-Forwarded-For para rate-limit y
# el tope de conexiones por IP. Poné TRUST_PROXY=0 (variable del Space) si no querés confiar.
ENV TRUST_PROXY=1
# CORS_ORIGIN: el server no arranca en producción sin él (ni con `*`). Acepta una lista separada
# por comas. Valor de PLACEHOLDER: reemplazalo por la URL real del Space
# (https://<owner>-<space>.hf.space) definiendo la VARIABLE `CORS_ORIGIN` en
# Settings > Variables and secrets del Space (la variable pisa este ENV en runtime), o editá esta línea.
# Mismo origen (Origin == Host) pasa igual aunque este valor no matchee.
ENV CORS_ORIGIN=https://OWNER-SPACE.hf.space
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
COPY --from=build /app/tsconfig.server.json ./tsconfig.server.json
RUN chown -R node:node /app
# HF corre el contenedor como UID 1000: en node:22-alpine, `node` es uid/gid 1000 (no-root).
USER node
EXPOSE 7860
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:7860/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--import", "tsx", "server/index.ts"]
