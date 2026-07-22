FROM node:22-bookworm-slim AS dependencies

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund

FROM dependencies AS build

COPY tsconfig.json tsconfig.api.json ./
COPY api ./api
RUN npm run api:build

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=build /app/.api-dist ./.api-dist
COPY --from=build /app/api/migrations ./api/migrations
COPY --from=build /app/package.json ./package.json

USER node
EXPOSE 3001

CMD ["node", ".api-dist/api/main.js"]
