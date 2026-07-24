# Stage 1: Builder - compile TypeScript to JavaScript
FROM node:20-slim AS builder

WORKDIR /app

# Copy dependency manifests and install all dependencies (including devDependencies for tsc)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source code and TypeScript config
COPY src/ ./src/
COPY tsconfig.json ./

# Compile TypeScript
RUN npx tsc

# Stage 2: Production - minimal runtime image
FROM node:20-slim

WORKDIR /app

# Copy dependency manifests and install production-only dependencies
COPY package.json package-lock.json ./
RUN npm ci --production

# Copy compiled JavaScript from builder stage
COPY --from=builder /app/dist ./dist

# Expose default port (configurable via PORT env var)
EXPOSE 3000

# Start the application
CMD ["node", "dist/app.js"]
