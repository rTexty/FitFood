# Frontend (TanStack Start + Nitro node-server) multi-stage image.

FROM node:22-bookworm-slim AS builder

WORKDIR /build

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_API_BASE_URL
ENV NODE_ENV=production
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build


FROM node:22-bookworm-slim AS runner

RUN apt-get update \
 && apt-get install -y --no-install-recommends wget ca-certificates \
 && rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 1001 appgroup \
 && useradd --system --uid 1001 --gid appgroup --create-home --shell /bin/bash appuser

WORKDIR /app

COPY --from=builder --chown=appuser:appgroup /build/.output ./.output
COPY --from=builder --chown=appuser:appgroup /build/package.json ./

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/ >/dev/null 2>&1 || exit 1

CMD ["node", ".output/server/index.mjs"]
