FROM node:20-alpine AS frontend-build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json tsconfig.worker.json postcss.config.js ./
COPY src ./src
COPY public ./public
RUN npm run build

FROM node:20-alpine AS backend-build
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/tsconfig.json ./
COPY server/prisma ./prisma
COPY server/src ./src
RUN npx prisma generate
RUN npx tsc

FROM node:20-alpine AS runtime
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/prisma ./prisma
RUN npx prisma generate
COPY --from=backend-build /app/dist ./dist
COPY --from=frontend-build /app/dist ./public

EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
