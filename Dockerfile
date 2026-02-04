# Multi-stage build for VictorySync Dashboard

# Stage 1: Build client
FROM node:20-alpine AS client-builder
WORKDIR /app/client

# Copy package files
COPY client/package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY client . 

# Build frontend with Vite
RUN npm run build

# Stage 2: Build server
FROM node:20-alpine AS server-builder
WORKDIR /app/server

# Copy package files
COPY server/package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY server .

# Build TypeScript server
RUN npm run build

# Stage 3: Runtime image
FROM node:20-alpine
WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Copy server runtime dependencies and built code
COPY --from=server-builder --chown=nodejs:nodejs /app/server/node_modules ./node_modules
COPY --from=server-builder --chown=nodejs:nodejs /app/server/dist ./dist
COPY --from=server-builder --chown=nodejs:nodejs /app/server/package*.json ./

# Copy built client assets to be served by express
COPY --from=client-builder --chown=nodejs:nodejs /app/client/dist ./public

# Switch to non-root user
USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Expose port
EXPOSE 4000

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start server
CMD ["node", "dist/index.js"]
