# Multi-stage Dockerfile for EasyPrint Backend (API Server & BullMQ Worker)
# Base stage
FROM node:20-alpine AS dependencies

WORKDIR /app

# Copy workspace root manifests
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
COPY client/package.json ./client/

# Install production dependencies for server and shared workspaces
RUN npm ci --omit=dev

# Runner stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

# Copy production node_modules and source code
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json ./
COPY shared ./shared
COPY server ./server

# Create uploads directory and set file permissions for non-root node user
RUN mkdir -p /app/server/uploads && chown -R node:node /app

USER node

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/health || exit 1

CMD ["node", "server/src/server.js"]

