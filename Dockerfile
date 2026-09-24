FROM node:22-bookworm-slim AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:22-bookworm-slim AS server-dependencies
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=server-dependencies /app/server/node_modules ./server/node_modules
COPY server/package*.json ./server/
COPY server/src ./server/src
COPY server/scripts ./server/scripts
COPY --from=client-build /app/client/dist ./client/dist
RUN mkdir -p /app/server/uploads /app/server/saved-files && chown -R node:node /app
USER node
EXPOSE 5000
CMD ["node", "server/src/server.js"]
