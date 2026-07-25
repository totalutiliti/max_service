FROM node:22-bookworm-slim AS dependencies

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund

FROM dependencies AS build

COPY tsconfig.json tsconfig.api.json ./
COPY api ./api
RUN npm run api:build

FROM dependencies AS runtime-dependencies

RUN npm prune --omit=dev --ignore-scripts --no-audit --no-fund \
    && npm remove --omit=dev --ignore-scripts --no-audit --no-fund \
      next react react-dom react-server-dom-webpack vinext

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

COPY --from=runtime-dependencies /app/node_modules ./node_modules
COPY --from=build /app/.api-dist ./.api-dist
COPY --from=build /app/api/migrations ./api/migrations
COPY --from=build /app/package.json ./package.json
COPY scripts/private-storage-reconciliation.mjs ./scripts/private-storage-reconciliation.mjs

USER node
EXPOSE 3001

CMD ["node", ".api-dist/api/main.js"]
