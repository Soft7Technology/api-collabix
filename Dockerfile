# =========================
# Stage 1: Dependencies
# =========================
FROM node:22-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci


# =========================
# Stage 2: Build
# =========================
FROM node:22-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY tsconfig.json ./

COPY src ./src
COPY migrations ./migrations

RUN npm run build


# =========================
# Stage 3: Production
# =========================
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 collabix

COPY package.json package-lock.json ./

RUN npm ci --omit=dev \
    && npm cache clean --force

# Application
COPY --from=builder /app/dist ./dist

# Database migrations
COPY --from=builder /app/migrations ./migrations

RUN chown -R collabix:nodejs /app

USER collabix

EXPOSE 5000

CMD ["node", "dist/index.js"]
