FROM oven/bun:1-alpine@sha256:4cf82f5686b196504fe119db3fcd9185b191f82ece82c40680e597228ec6070a AS deps

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1-alpine@sha256:4cf82f5686b196504fe119db3fcd9185b191f82ece82c40680e597228ec6070a AS builder

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

RUN bun run build && test -f dist/main.js || { \
      echo "build produced no dist/main.js; contents of dist:"; \
      ls -R dist 2>/dev/null || echo "(no dist directory at all)"; \
      exit 1; \
    }

FROM oven/bun:1-alpine@sha256:4cf82f5686b196504fe119db3fcd9185b191f82ece82c40680e597228ec6070a AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000
ENV GRPC_PORT=50052

COPY package.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
# No `COPY proto`. The .proto travels inside kinetix-contracts, which is already in
# node_modules above — copying one here again would be the vendored second copy this segment
# exists to delete.
    
EXPOSE 5000 50052

USER bun


HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=3 \
    CMD bun -e 'const r = await fetch("http://127.0.0.1:5000/health/ready"); process.exit(r.ok ? 0 : 1)' || exit 1

CMD ["bun", "run", "dist/main.js"]
