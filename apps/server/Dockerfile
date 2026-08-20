FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 3001
# Миграции гоняются при каждом старте контейнера, не отдельным шагом —
# `synchronize: false` (см. data-source.ts), применённая миграция не
# переприменяется повторно, так что это безопасно и на перезапуске без
# новых миграций.
CMD ["sh", "-c", "npx typeorm migration:run -d dist/data-source.js && node dist/main.js"]
