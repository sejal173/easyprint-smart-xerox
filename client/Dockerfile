# Multi-stage Dockerfile for EasyPrint Web Client (React + Vite + Nginx)

# Stage 1: Build static distribution
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package manifests for workspace resolution
COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY shared/package.json ./shared/
COPY server/package.json ./server/

# Install dependencies across workspaces
RUN npm ci

# Copy client source code
COPY client ./client

# Build production assets with Vite
WORKDIR /app/client
RUN npm run build

# Stage 2: Serve static bundle via Nginx
FROM nginx:alpine AS runner

# Remove default nginx static files
RUN rm -rf /usr/share/nginx/html/*

# Copy Vite build output to Nginx root
COPY --from=builder /app/client/dist /usr/share/nginx/html

# Copy custom Nginx configuration with SPA fallback and reverse proxy
COPY client/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]

