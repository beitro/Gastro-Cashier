# Multi-stage image for the Gastro-Cashier API + Vite preview.
# Works on both amd64 and arm64 (including Oracle Ampere A1).
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV PORT=8080
ENV PGSSL=true
ENV TRUST_PROXY_HOPS=1
WORKDIR /app

COPY --from=build --chown=node:node /app/package*.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/server ./server
COPY --from=build --chown=node:node /app/dist ./dist

USER node
EXPOSE 8080
CMD ["npm", "start"]
