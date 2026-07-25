FROM node:22-bookworm-slim AS dependencies

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund

FROM dependencies AS build

COPY . .
RUN npm run build

FROM dependencies AS runtime-dependencies

RUN npm prune --omit=dev --ignore-scripts --no-audit --no-fund \
    && npm remove --omit=dev --ignore-scripts --no-audit --no-fund \
      @vitejs/plugin-react @vitejs/plugin-rsc react-server-dom-webpack vite \
      @aws-sdk/client-s3 @nestjs/common @nestjs/core @nestjs/platform-express \
      class-transformer class-validator drizzle-orm pg qrcode reflect-metadata rxjs web-push \
    && rm -rf node_modules/@vitejs/plugin-rsc

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

COPY --from=runtime-dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY scripts/start-web.mjs ./scripts/start-web.mjs

USER node
EXPOSE 4174

CMD ["node", "scripts/start-web.mjs"]
