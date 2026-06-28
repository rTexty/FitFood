# Frontend (TanStack Start + Nitro node-server) — multi-stage
# ---------- builder ----------
FROM oven/bun:1 AS builder

WORKDIR /build

# Зависимости отдельно для кеширования слоёв.
# Без --frozen-lockfile: bun в linux-контейнере может резолвить
# platform-зависимые optional deps иначе, чем локальный lockfile.
COPY package.json bun.lock* ./
RUN bun install

COPY . .

ENV NODE_ENV=production
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN bun run build


# ---------- runner ----------
FROM oven/bun:1-slim AS runner

# wget нужен для healthcheck
RUN apt-get update \
 && apt-get install -y --no-install-recommends wget ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Непривилегированный пользователь
RUN groupadd --system --gid 1001 appgroup \
 && useradd  --system --uid 1001 --gid appgroup --create-home --shell /bin/bash appuser

WORKDIR /app

# Только артефакты сборки и манифест пакета
COPY --from=builder --chown=appuser:appgroup /build/.output        ./.output
COPY --from=builder --chown=appuser:appgroup /build/package.json   ./

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/ >/dev/null 2>&1 || exit 1

CMD ["node", ".output/server/index.mjs"]
