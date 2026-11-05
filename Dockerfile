FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src src
COPY test test
COPY data data
COPY migrations migrations
RUN npx tsc

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8787 DATABASE_FILE=/data/indie-alternatives.db
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist dist
COPY data/products.json data/products.json
VOLUME /data
EXPOSE 8787
CMD ["node", "dist/src/http.js"]
