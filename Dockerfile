# Production Dockerfile for KhetiSense
FROM node:22-alpine AS runner

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

WORKDIR /app

# Install production dependencies only using package-lock.json
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy application source and assets
COPY server.js ./
COPY public/ ./public/
COPY src/ ./src/

# Create data directory and assign ownership to node user
RUN mkdir -p /app/data && chown -R node:node /app

# Switch to non-root user for security
USER node

# Expose HTTP port
EXPOSE 3000

# Health check using built-in Node 22 fetch
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
